import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { hash } from "bcryptjs";
import { DataSource, EntityManager, QueryFailedError } from "typeorm";
import { safeUser } from "../auth/auth.service";
import { lockAuthorization } from "../auth/authorization-lock";
import { User, UserRole } from "../database/entities/user.entity";
import { RefreshSession } from "../database/entities/refresh-session.entity";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

const userView = (user: User) => ({
  ...safeUser(user),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

@Injectable()
export class UsersService {
  constructor(private readonly source: DataSource) {}

  async assignees(actorId: string) {
    return this.source.transaction(async (manager) => {
      await lockAuthorization(manager, true);
      const actor = await manager.findOneBy(User, { id: actorId });
      if (!actor?.isActive) throw new UnauthorizedException("Unauthorized");
      if (![UserRole.OWNER, UserRole.MANAGER].includes(actor.role))
        throw new ForbiddenException("Forbidden");
      return manager.find(User, {
        select: { id: true, email: true },
        where: { isActive: true },
        order: { email: "ASC", id: "ASC" },
      });
    });
  }

  private async requireOwner(manager: EntityManager, actorId: string) {
    const actor = await manager.findOneBy(User, { id: actorId });
    if (!actor?.isActive) throw new UnauthorizedException("Unauthorized");
    if (actor.role !== UserRole.OWNER)
      throw new ForbiddenException("Forbidden");
  }

  private async lockUsers(manager: EntityManager) {
    // Transaction-scoped global RBAC mutex. Every management mutation takes this
    // before reading actor/target/count, including promotions and creation.
    // READ COMMITTED gives a fresh snapshot after a waiting transaction acquires it.
    await lockAuthorization(manager);
  }

  async list(actorId: string) {
    return this.source.transaction(async (manager) => {
      await this.requireOwner(manager, actorId);
      const users = await manager.find(User, {
        order: { createdAt: "ASC", id: "ASC" },
      });
      return users.map(userView);
    });
  }

  async create(actorId: string, dto: CreateUserDto) {
    if (Buffer.byteLength(dto.password, "utf8") > 72)
      throw new BadRequestException("Password must not exceed 72 UTF-8 bytes");
    const passwordHash = await hash(dto.password, 12);
    try {
      return await this.source.transaction(
        "READ COMMITTED",
        async (manager) => {
          await this.lockUsers(manager);
          await this.requireOwner(manager, actorId);
          const user = manager.create(User, {
            email: dto.email,
            passwordHash,
            role: dto.role,
            isActive: true,
          });
          return userView(await manager.save(user));
        },
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string; constraint?: string }).code ===
          "23505" &&
        (error.driverError as { constraint?: string }).constraint ===
          "uq_users_email"
      )
        throw new ConflictException("Email already exists");
      throw error;
    }
  }

  async update(actorId: string, id: string, dto: UpdateUserDto) {
    if (dto.role === undefined && dto.isActive === undefined)
      throw new BadRequestException("At least one update field is required");
    return this.source.transaction("READ COMMITTED", async (manager) => {
      await this.lockUsers(manager);
      // Recheck inside the mutex: a previously authorized actor may have been
      // disabled/demoted while this request was waiting.
      await this.requireOwner(manager, actorId);
      const user = await manager.findOne(User, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!user) throw new NotFoundException("User not found");
      const role = dto.role ?? user.role;
      const isActive = dto.isActive ?? user.isActive;
      if (
        user.role === UserRole.OWNER &&
        user.isActive &&
        (role !== UserRole.OWNER || !isActive)
      ) {
        const owners = await manager.countBy(User, {
          role: UserRole.OWNER,
          isActive: true,
        });
        if (owners <= 1)
          throw new ConflictException("Cannot remove the last active OWNER");
      }
      user.role = role;
      user.isActive = isActive;
      if (!isActive) {
        await manager
          .createQueryBuilder()
          .update(RefreshSession)
          .set({
            revokedAt: () => "clock_timestamp()",
            revocationReason: "user_disabled",
          })
          .where("user_id = :id AND revoked_at IS NULL", { id })
          .execute();
      }
      return userView(await manager.save(user));
    });
  }
}

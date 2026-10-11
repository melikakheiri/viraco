import { Injectable, UnauthorizedException } from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { compare, hash } from "bcryptjs";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import * as jwt from "jsonwebtoken";
import { User } from "../database/entities/user.entity";
import { RefreshSession } from "../database/entities/refresh-session.entity";
import { AuthConfig } from "./auth.config";
import { LoginDto } from "./auth.dto";
import { lockAuthorization } from "./authorization-lock";

export const safeUser = (user: User) => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
});
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const unauthorized = () => new UnauthorizedException("Unauthorized");
@Injectable()
export class AuthService {
  private readonly dummyHash = hash(randomBytes(32).toString("hex"), 12);
  constructor(
    private readonly source: DataSource,
    private readonly config: AuthConfig,
  ) {}
  private async issue(
    manager: EntityManager,
    user: User,
    expiresAt = new Date(Date.now() + this.config.refreshSeconds * 1000),
  ) {
    const session = manager.create(RefreshSession, {
      userId: user.id,
      expiresAt,
      refreshTokenHash: "pending",
    });
    // Generate the UUID before constructing the opaque token; only the digest is persisted.
    session.id = randomUUID();
    const refresh = `${session.id}.${randomBytes(32).toString("base64url")}`;
    session.refreshTokenHash = digest(refresh);
    await manager.save(session);
    const access = jwt.sign({ sid: session.id }, this.config.secret, {
      algorithm: "HS256",
      subject: user.id,
      issuer: this.config.issuer,
      audience: this.config.audience,
      expiresIn: this.config.accessSeconds,
    });
    return { access, refresh, expiresAt, user: safeUser(user) };
  }
  async login(dto: LoginDto) {
    const user = await this.source
      .getRepository(User)
      .createQueryBuilder("user")
      .addSelect("user.passwordHash")
      .where("user.email = :email", { email: dto.email })
      .getOne();
    const valid = await compare(
      dto.password,
      user?.passwordHash || (await this.dummyHash),
    );
    if (
      !user ||
      !valid ||
      !user.isActive ||
      Buffer.byteLength(dto.password, "utf8") > 72
    )
      throw unauthorized();
    return this.source.transaction(async (manager) => {
      await lockAuthorization(manager, true);
      const current = await manager.findOne(User, {
        where: { id: user.id },
        lock: { mode: "pessimistic_read" },
      });
      if (!current?.isActive) throw unauthorized();
      return this.issue(manager, current);
    });
  }
  private tokenId(token?: string) {
    if (
      !token ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{43}$/.test(
        token,
      )
    )
      throw unauthorized();
    return token.split(".")[0];
  }
  private async lockedSession(manager: EntityManager, token?: string) {
    const id = this.tokenId(token);
    const session = await manager
      .getRepository(RefreshSession)
      .createQueryBuilder("session")
      .addSelect("session.refreshTokenHash")
      .where("session.id = :id", { id })
      .setLock("pessimistic_write")
      .getOne();
    if (
      !session ||
      !timingSafeEqual(
        Buffer.from(digest(token!), "hex"),
        Buffer.from(session.refreshTokenHash, "hex"),
      )
    )
      throw unauthorized();
    return session;
  }
  async refresh(token?: string) {
    return this.source.transaction(async (manager) => {
      await lockAuthorization(manager, true);
      const session = await this.lockedSession(manager, token);
      if (session.revokedAt || session.expiresAt.getTime() <= Date.now())
        throw unauthorized();
      const user = await manager.findOne(User, {
        where: { id: session.userId },
        lock: { mode: "pessimistic_read" },
      });
      if (!user?.isActive) throw unauthorized();
      session.revokedAt = new Date();
      session.revocationReason = "rotated";
      await manager.save(session);
      // Keep the original absolute refresh expiry; rotation does not extend it.
      return this.issue(manager, user, session.expiresAt);
    });
  }
  async logout(token?: string) {
    await this.source.transaction(async (manager) => {
      await lockAuthorization(manager, true);
      const session = await this.lockedSession(manager, token);
      if (!session.revokedAt) {
        session.revokedAt = new Date();
        session.revocationReason = "logout";
        await manager.save(session);
      }
    });
  }
  async authenticate(token?: string): Promise<User> {
    if (!token) throw unauthorized();
    let claims: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, this.config.secret, {
        algorithms: ["HS256"],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      if (
        typeof decoded === "string" ||
        typeof decoded.sub !== "string" ||
        typeof decoded.sid !== "string" ||
        typeof decoded.exp !== "number"
      )
        throw unauthorized();
      claims = decoded;
    } catch {
      throw unauthorized();
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        claims.sub!,
      ) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        claims.sid as string,
      )
    )
      throw unauthorized();
    const session = await this.source
      .getRepository(RefreshSession)
      .findOneBy({ id: claims.sid as string, userId: claims.sub });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    )
      throw unauthorized();
    const user = await this.source
      .getRepository(User)
      .findOneBy({ id: claims.sub });
    if (!user?.isActive) throw unauthorized();
    return user;
  }
}

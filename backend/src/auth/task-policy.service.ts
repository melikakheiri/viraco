import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { DataSource, EntityManager, FindOptionsWhere } from "typeorm";
import { Task } from "../database/entities/task.entity";
import { User, UserRole } from "../database/entities/user.entity";

export type TaskAction = "view" | "create" | "update" | "delete";
export interface TaskIdentityChange {
  creatorId?: string;
  assigneeId?: string | null;
}

@Injectable()
export class TaskPolicyService {
  constructor(private readonly source: DataSource) {}

  private async actor(id: string, manager: EntityManager) {
    const user = await manager.findOneBy(User, { id });
    if (!user?.isActive) throw new UnauthorizedException("Unauthorized");
    return user;
  }

  // Phase 5 must apply this filter to list/count queries before pagination.
  async visibility(
    actorId: string,
    manager = this.source.manager,
  ): Promise<FindOptionsWhere<Task>[]> {
    const user = await this.actor(actorId, manager);
    return user.role === UserRole.MEMBER
      ? [{ creatorId: user.id }, { assigneeId: user.id }]
      : [{}];
  }

  // Pass the same transaction manager used to load and write the task in Phase 5.
  // Authorize the persisted task BEFORE applying changes; creator is immutable.
  async authorize(
    actorId: string,
    action: TaskAction,
    task?: Pick<Task, "creatorId" | "assigneeId">,
    changes: TaskIdentityChange = {},
    manager = this.source.manager,
  ) {
    const user = await this.actor(actorId, manager);
    if (action !== "create" && !task) throw new ForbiddenException("Forbidden");
    if (
      changes.creatorId !== undefined &&
      changes.creatorId !== (action === "create" ? user.id : task?.creatorId)
    )
      throw new ForbiddenException("Task creator cannot be changed");
    if (user.role === UserRole.MEMBER && action !== "create") {
      const owns = task!.creatorId === user.id;
      const assigned = task!.assigneeId === user.id;
      if (action === "delete" ? !owns : !owns && !assigned)
        throw new ForbiddenException("Forbidden");
    }
    if (changes.assigneeId !== undefined) {
      if (
        user.role === UserRole.MEMBER &&
        changes.assigneeId !== task?.assigneeId &&
        changes.assigneeId !== null &&
        changes.assigneeId !== user.id
      )
        throw new ForbiddenException("Cannot assign another user");
      if (changes.assigneeId !== null) {
        const assignee = await manager.findOneBy(User, {
          id: changes.assigneeId,
          isActive: true,
        });
        if (!assignee)
          throw new ForbiddenException("Assignee must be an active user");
      }
    }
  }
}

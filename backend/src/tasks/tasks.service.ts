import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DataSource, EntityManager } from "typeorm";
import { lockAuthorization } from "../auth/authorization-lock";
import { TaskPolicyService } from "../auth/task-policy.service";
import {
  Task,
  TaskPriority,
  TaskStatus,
} from "../database/entities/task.entity";
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from "./tasks.dto";

const taskView = (task: Task) => ({
  id: task.id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  creatorId: task.creatorId,
  assigneeId: task.assigneeId,
  dueDate: task.dueDate,
  description: task.description,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

@Injectable()
export class TasksService {
  constructor(
    private readonly source: DataSource,
    private readonly policy: TaskPolicyService,
  ) {}
  private transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    return this.source.transaction("READ COMMITTED", async (manager) => {
      // Multiple task operations can run concurrently; user-role/status mutations
      // wait for them, and queued task requests reload authorization after waiting.
      await lockAuthorization(manager, true);
      return work(manager);
    });
  }
  async list(actorId: string, dto: ListTasksDto) {
    return this.transaction(async (manager) => {
      const visibility = await this.policy.visibility(actorId, manager);
      const query = manager
        .getRepository(Task)
        .createQueryBuilder("task")
        .where(visibility);
      for (const field of ["status", "assigneeId"] as const) {
        if (dto[field] !== undefined)
          query.andWhere("task." + field + " = :" + field, {
            [field]: dto[field],
          });
      }
      const [tasks, total] = await query
        .orderBy("task.createdAt", "DESC")
        .addOrderBy("task.id", "DESC")
        .skip((dto.page - 1) * dto.pageSize)
        .take(dto.pageSize)
        .getManyAndCount();
      return {
        items: tasks.map(taskView),
        total,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    });
  }
  async get(actorId: string, id: string) {
    return this.transaction(async (manager) => {
      const task = await manager.findOneBy(Task, { id });
      // Recheck active actor even when the requested task doesn't exist.
      await this.policy.visibility(actorId, manager);
      if (!task) throw new NotFoundException("Task not found");
      await this.policy.authorize(actorId, "view", task, {}, manager);
      return taskView(task);
    });
  }
  async create(actorId: string, dto: CreateTaskDto) {
    return this.transaction(async (manager) => {
      await this.policy.authorize(
        actorId,
        "create",
        undefined,
        { creatorId: actorId, assigneeId: dto.assigneeId },
        manager,
      );
      const task = manager.create(Task, {
        title: dto.title,
        status: dto.status ?? TaskStatus.TODO,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        creatorId: actorId,
        assigneeId: dto.assigneeId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        description: dto.description ?? { type: "doc", content: [] },
      });
      return taskView(await manager.save(task));
    });
  }
  async update(actorId: string, id: string, dto: UpdateTaskDto) {
    if (!Object.values(dto).some((value) => value !== undefined))
      throw new BadRequestException("At least one update field is required");
    return this.transaction(async (manager) => {
      await this.policy.visibility(actorId, manager);
      const task = await manager.findOne(Task, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!task) throw new NotFoundException("Task not found");
      await this.policy.authorize(
        actorId,
        "update",
        task,
        { assigneeId: dto.assigneeId },
        manager,
      );
      if (dto.title !== undefined) task.title = dto.title;
      if (dto.status !== undefined) task.status = dto.status;
      if (dto.priority !== undefined) task.priority = dto.priority;
      if (dto.assigneeId !== undefined) task.assigneeId = dto.assigneeId;
      if (dto.dueDate !== undefined)
        task.dueDate = dto.dueDate === null ? null : new Date(dto.dueDate);
      if (dto.description !== undefined) task.description = dto.description;
      return taskView(await manager.save(task));
    });
  }
  async delete(actorId: string, id: string) {
    await this.transaction(async (manager) => {
      await this.policy.visibility(actorId, manager);
      const task = await manager.findOne(Task, {
        where: { id },
        lock: { mode: "pessimistic_write" },
      });
      if (!task) throw new NotFoundException("Task not found");
      await this.policy.authorize(actorId, "delete", task, {}, manager);
      await manager.delete(Task, id);
    });
  }
}

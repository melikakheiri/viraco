import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
} from "@nestjs/common";
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from "./tasks.dto";
import { validPostgresText, validTipTap } from "./tiptap.validator";

// Validate raw JSON before class-transformer recursively walks nested objects.
// This also rejects attributes class-transformer would otherwise discard.
export class TaskPayloadPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (
      metadata.metatype === ListTasksDto &&
      value &&
      typeof value === "object"
    ) {
      const query = value as Record<string, unknown>;
      const allowed = ["status", "assigneeId", "page", "pageSize"];
      if (
        Object.keys(query).some((key) => !allowed.includes(key)) ||
        Object.values(query).some(
          (entry) => typeof entry !== "string" || !validPostgresText(entry),
        )
      )
        throw new BadRequestException("Invalid task query");
    }
    if (
      metadata.metatype !== CreateTaskDto &&
      metadata.metatype !== UpdateTaskDto
    )
      return value;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new BadRequestException("Task payload must be an object");
    const body = value as Record<string, unknown>;
    if (
      Object.values(body).some(
        (entry) => typeof entry === "string" && !validPostgresText(entry),
      )
    )
      throw new BadRequestException(
        "Task fields must contain valid Unicode without NUL characters",
      );
    const allowed = [
      "title",
      "status",
      "priority",
      "assigneeId",
      "dueDate",
      "description",
    ];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw new BadRequestException("Unknown task field");
    if (body.description !== undefined && !validTipTap(body.description))
      throw new BadRequestException("Invalid or oversized TipTap document");
    // All remaining allowed properties are scalar. Reject objects before transformation.
    if (
      Object.entries(body).some(
        ([key, entry]) =>
          key !== "description" && entry !== null && typeof entry === "object",
      )
    )
      throw new BadRequestException("Task fields must be scalar values");
    return value;
  }
}

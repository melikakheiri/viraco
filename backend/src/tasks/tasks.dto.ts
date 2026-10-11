import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
  ValidateIf,
} from "class-validator";
import {
  TaskPriority,
  TaskStatus,
  TipTapDocument,
} from "../database/entities/task.entity";
import { TipTapDocumentValidator } from "./tiptap.validator";
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
const supplied = (_object: unknown, value: unknown) => value !== undefined;
const nullable = (_object: unknown, value: unknown) =>
  value !== undefined && value !== null;
const integer = ({ value }: { value: unknown }) =>
  typeof value === "string" && /^[0-9]{1,9}$/.test(value)
    ? Number(value)
    : value;

export class CreateTaskDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;
  @ValidateIf(supplied)
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @ValidateIf(supplied)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @ValidateIf(nullable)
  @IsUUID()
  assigneeId?: string | null;
  @ValidateIf(nullable)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  dueDate?: string | null;
  @ValidateIf(supplied)
  @Validate(TipTapDocumentValidator)
  description?: TipTapDocument;
}
export class UpdateTaskDto {
  @ValidateIf(supplied)
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;
  @ValidateIf(supplied)
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @ValidateIf(supplied)
  @IsEnum(TaskPriority)
  priority?: TaskPriority;
  @ValidateIf(nullable)
  @IsUUID()
  assigneeId?: string | null;
  @ValidateIf(nullable)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/,
  )
  dueDate?: string | null;
  @ValidateIf(supplied)
  @Validate(TipTapDocumentValidator)
  description?: TipTapDocument;
}
export class ListTasksDto {
  @ValidateIf(supplied)
  @IsEnum(TaskStatus)
  status?: TaskStatus;
  @ValidateIf(supplied)
  @IsUUID()
  assigneeId?: string;
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;
  @Transform(integer)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

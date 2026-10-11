import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.guard";
import { Roles } from "../auth/roles.guard";
import { UserRole } from "../database/entities/user.entity";
import { CreateTaskDto, ListTasksDto, UpdateTaskDto } from "./tasks.dto";
import { TasksService } from "./tasks.service";

@Controller("todos")
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.MEMBER)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() dto: ListTasksDto) {
    return this.tasks.list(request.user.id, dto);
  }
  @Get(":id")
  get(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.tasks.get(request.user.id, id);
  }
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    return this.tasks.create(request.user.id, dto);
  }
  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(request.user.id, id, dto);
  }
  @Delete(":id")
  @HttpCode(204)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.tasks.delete(request.user.id, id);
  }
}

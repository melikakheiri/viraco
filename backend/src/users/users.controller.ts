import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.guard";
import { Roles } from "../auth/roles.guard";
import { UserRole } from "../database/entities/user.entity";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("users")
@Roles(UserRole.OWNER)
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.users.list(request.user.id);
  }
  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateUserDto) {
    return this.users.create(request.user.id, dto);
  }
  @Patch(":id")
  update(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(request.user.id, id, dto);
  }
}

import { Controller, Get, Req } from "@nestjs/common";
import { AuthenticatedRequest } from "../auth/auth.guard";
import { Roles } from "../auth/roles.guard";
import { UserRole } from "../database/entities/user.entity";
import { UsersService } from "./users.service";

@Controller("assignees")
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class AssigneesController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.users.assignees(request.user.id);
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../database/entities/user.entity";
import { AuthGuard, AuthenticatedRequest } from "./auth.guard";

const ROLE_METADATA = "taskboard:roles";
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(ROLE_METADATA, roles);

// Global guard: @Roles implies authentication and runs before the CSRF guard.
// AuthGuard loads the user from PostgreSQL, never from JWT role claims.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthGuard,
  ) {}
  async canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    await this.auth.canActivate(context);
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user?.isActive) throw new UnauthorizedException("Unauthorized");
    if (!roles.includes(user.role)) throw new ForbiddenException("Forbidden");
    return true;
  }
}

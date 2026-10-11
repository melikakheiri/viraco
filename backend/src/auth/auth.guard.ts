import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { User } from "../database/entities/user.entity";
import { AuthConfig } from "./auth.config";
import { readCookie } from "./auth.cookies";
import { AuthService } from "./auth.service";
export interface AuthenticatedRequest extends Request {
  user: User;
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.user = await this.auth.authenticate(
      readCookie(request, this.config.accessCookie),
    );
    return true;
  }
}

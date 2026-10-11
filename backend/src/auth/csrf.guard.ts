import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthConfig } from "./auth.config";
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: AuthConfig) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    if (
      request.headers.origin !== this.config.origin ||
      request.headers["sec-fetch-site"] === "cross-site"
    )
      throw new ForbiddenException("Forbidden");
    return true;
  }
}

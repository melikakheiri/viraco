import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import type { Request, Response } from "express";

// Bounded, process-local fixed windows; no attacker-controlled forwarding headers.
@Injectable()
export class LoginRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = Date.now();
    for (const [key, entry] of this.windows)
      if (entry.until <= now) this.windows.delete(key);
    const email =
      typeof request.body?.email === "string"
        ? request.body.email.trim().toLowerCase().slice(0, 254)
        : "";
    // The Next proxy shares an IP: account limits keep ordinary users independent.
    const keys = [
      ["account:" + email, 15],
      ["peer:" + request.socket.remoteAddress, 300],
    ] as const;
    for (const [key, limit] of keys) {
      const entry = this.windows.get(key);
      if (
        (entry && entry.count >= limit) ||
        (!entry && this.windows.size >= 10000)
      ) {
        response.setHeader(
          "Retry-After",
          Math.max(1, Math.ceil(((entry?.until ?? now + 60000) - now) / 1000)),
        );
        throw new HttpException("Too many login attempts", 429);
      }
    }
    for (const [key] of keys) {
      const entry = this.windows.get(key) ?? { count: 0, until: now + 60000 };
      entry.count++;
      this.windows.set(key, entry);
    }
    const accountWindow = this.windows.get(keys[0][0])!;
    response.once("finish", () => {
      // Successful logins do not consume the account's failed-attempt budget.
      // The peer budget still bounds total bcrypt work, including successes.
      if (response.statusCode < 400)
        accountWindow.count = Math.max(0, accountWindow.count - 1);
    });
    return true;
  }
}

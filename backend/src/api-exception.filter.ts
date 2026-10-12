import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    let status = exception instanceof HttpException ? exception.getStatus() : 500;
    const failure = exception as { code?: string; driverError?: { code?: string }; status?: number };
    const code = failure?.driverError?.code || failure?.code;
    if (["23505", "23503", "23514"].includes(code || "")) status = 409;
    if (!(exception instanceof HttpException) && [400, 413].includes(failure?.status || 0)) status = failure.status!;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const raw = typeof payload === "string" ? payload : (payload as { message?: unknown })?.message;
    const details = status < 500 && Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
    const message = status >= 500 ? "Internal server error" :
      typeof raw === "string" ? raw : details.length ? "Request validation failed" : "Request failed";
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status, error: HttpStatus[status] || "HTTP_ERROR", message, details,
    });
  }
}

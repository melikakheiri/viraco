import { INestApplication, ValidationPipe } from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { TaskPayloadPipe } from "./tasks/task-payload.pipe";
import { RawPayloadPipe } from "./raw-payload.pipe";
import { ApiExceptionFilter } from "./api-exception.filter";
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalPipes(
    new RawPayloadPipe(),
    new TaskPayloadPipe(),
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path.startsWith("/api/v1/")) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
    }
    next();
  });
}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CsrfGuard } from "./csrf.guard";
import { TaskPolicyService } from "./task-policy.service";
import { RolesGuard } from "./roles.guard";
import { LoginRateGuard } from "./login-rate.guard";
@Module({
  controllers: [AuthController],
  providers: [
    AuthConfig,
    LoginRateGuard,
    AuthService,
    AuthGuard,
    TaskPolicyService,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthGuard, AuthService, AuthConfig, TaskPolicyService],
})
export class AuthModule {}

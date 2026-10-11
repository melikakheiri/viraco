import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthConfig } from "./auth.config";
import { clearAuthCookies, readCookie, setAuthCookies } from "./auth.cookies";
import { EmptyDto, LoginDto } from "./auth.dto";
import { AuthGuard, AuthenticatedRequest } from "./auth.guard";
import { AuthService, safeUser } from "./auth.service";
import { LoginRateGuard } from "./login-rate.guard";
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}
  @Post("login")
  @UseGuards(LoginRateGuard)
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto);
    setAuthCookies(
      response,
      this.config,
      result.access,
      result.refresh,
      result.expiresAt,
    );
    return { user: result.user };
  }
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() _dto: EmptyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.refresh(
      readCookie(request, this.config.refreshCookie),
    );
    setAuthCookies(
      response,
      this.config,
      result.access,
      result.refresh,
      result.expiresAt,
    );
    return { user: result.user };
  }
  @Post("logout")
  @HttpCode(204)
  async logout(
    @Body() _dto: EmptyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      await this.auth.logout(readCookie(request, this.config.refreshCookie));
    } finally {
      clearAuthCookies(response, this.config);
    }
  }
  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: safeUser(request.user) };
  }
}

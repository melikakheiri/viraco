import type { Request, Response, CookieOptions } from "express";
import { AuthConfig } from "./auth.config";
export function readCookie(request: Request, name: string): string | undefined {
  const matches = (request.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + "="));
  if (matches.length !== 1) return undefined;
  try {
    return decodeURIComponent(matches[0].slice(name.length + 1));
  } catch {
    return undefined;
  }
}
export function cookieOptions(
  config: AuthConfig,
  refresh: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: refresh ? "/api/v1/auth" : "/api/v1",
  };
}
export function setAuthCookies(
  response: Response,
  config: AuthConfig,
  access: string,
  refresh: string,
  refreshExpires: Date,
) {
  response.cookie(config.accessCookie, access, {
    ...cookieOptions(config, false),
    maxAge: config.accessSeconds * 1000,
  });
  response.cookie(config.refreshCookie, refresh, {
    ...cookieOptions(config, true),
    maxAge: Math.max(0, refreshExpires.getTime() - Date.now()),
  });
}
export function clearAuthCookies(response: Response, config: AuthConfig) {
  response.clearCookie(config.accessCookie, cookieOptions(config, false));
  response.clearCookie(config.refreshCookie, cookieOptions(config, true));
}

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
@Injectable()
export class AuthConfig {
  readonly secret: string;
  readonly issuer: string;
  readonly audience: string;
  readonly origin: string;
  readonly accessSeconds: number;
  readonly refreshSeconds: number;
  readonly secure: boolean;
  readonly sameSite: "strict" | "lax";
  readonly accessCookie: string;
  readonly refreshCookie: string;
  constructor(config: ConfigService) {
    const required = (name: string) => {
      const value = config.get<string>(name);
      if (!value) throw new Error(`Missing ${name}`);
      return value;
    };
    this.secret = required("JWT_ACCESS_SECRET");
    if (
      Buffer.byteLength(this.secret) < 32 ||
      /replace|change.?me|example/i.test(this.secret)
    )
      throw new Error(
        "JWT_ACCESS_SECRET must be a unique secret of at least 32 bytes",
      );
    this.issuer = required("JWT_ISSUER");
    this.audience = required("JWT_AUDIENCE");
    this.origin = required("APP_ORIGIN");
    const origin = new URL(this.origin);
    if (
      origin.origin !== this.origin ||
      !["http:", "https:"].includes(origin.protocol)
    )
      throw new Error("APP_ORIGIN must be an exact HTTP(S) origin");
    const seconds = (name: string, min: number, max: number) => {
      const value = Number(required(name));
      if (!Number.isInteger(value) || value < min || value > max)
        throw new Error(`Invalid ${name}`);
      return value;
    };
    this.accessSeconds = seconds("JWT_ACCESS_TTL_SECONDS", 30, 900);
    this.refreshSeconds = seconds("REFRESH_TTL_SECONDS", 3600, 2592000);
    const secure = required("COOKIE_SECURE");
    if (!["true", "false"].includes(secure))
      throw new Error("Invalid COOKIE_SECURE");
    this.secure = secure === "true";
    if (
      config.get("NODE_ENV") === "production" &&
      (!this.secure || origin.protocol !== "https:")
    )
      throw new Error(
        "Production authentication requires HTTPS and Secure cookies",
      );
    const sameSite = required("COOKIE_SAME_SITE");
    if (sameSite !== "strict" && sameSite !== "lax")
      throw new Error("COOKIE_SAME_SITE must be strict or lax");
    this.sameSite = sameSite;
    const cookieName = (name: string) => {
      const value = required(name);
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(value))
        throw new Error(`Invalid ${name}`);
      return value;
    };
    this.accessCookie = cookieName("ACCESS_COOKIE_NAME");
    this.refreshCookie = cookieName("REFRESH_COOKIE_NAME");
    if (this.accessCookie === this.refreshCookie)
      throw new Error("Authentication cookie names must differ");
  }
}

import { cookieOptions } from "./auth.cookies";
import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DataSource, In } from "typeorm";
import * as jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { AppModule } from "../app.module";
import { configureApp } from "../configure-app";
import source from "../database/data-source";
import { assertTestDatabase } from "../database/local-guard";
import { RefreshSession } from "../database/entities/refresh-session.entity";
import { User } from "../database/entities/user.entity";
import { AuthConfig } from "./auth.config";
import { seedAccounts } from "../database/seed";

void test("authentication HTTP integration (local PostgreSQL)", async (t) => {
  assertTestDatabase();
  let app: INestApplication | undefined;
  let db: DataSource;
  let base = process.env.TEST_BASE_URL;
  let config: AuthConfig;
  if (base) {
    await source.initialize();
    db = source;
    config = new AuthConfig(new ConfigService(process.env));
  } else {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
    db = app.get(DataSource);
    config = app.get(AuthConfig);
  }
  assert.ok(
    new URL(base).hostname === "localhost" ||
      new URL(base).hostname === "127.0.0.1",
  );
  const account = seedAccounts().find((user) => user.role === "MEMBER")!;
  const user = await db
    .getRepository(User)
    .findOneByOrFail({ email: account.email });
  assert.ok(user.isActive, "Seeded MEMBER must be active before tests");
  const sessions = new Set<string>();
  const cookie = (response: globalThis.Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const values = (jar: string) =>
    Object.fromEntries(
      jar.split("; ").map((value) => {
        const index = value.indexOf("=");
        return [
          value.slice(0, index),
          decodeURIComponent(value.slice(index + 1)),
        ];
      }),
    );
  async function request(
    path: string,
    method = "GET",
    jar?: string,
    body?: unknown,
    origin: string | null = config.origin,
    fetchSite?: string,
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (jar) headers.cookie = jar;
    if (origin !== null) headers.origin = origin;
    if (fetchSite) headers["sec-fetch-site"] = fetchSite;
    const response = await fetch(`${base}/api/v1/auth/${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    for (const entry of response.headers.getSetCookie()) {
      if (entry.startsWith(config.refreshCookie + "=")) {
        const token = decodeURIComponent(
          entry.split(";")[0].slice(config.refreshCookie.length + 1),
        );
        if (token) sessions.add(token.split(".")[0]);
      }
    }
    return response;
  }
  const login = () =>
    request("login", "POST", undefined, {
      email: account.email,
      password: account.password,
    });
  let firstJar = "";
  let rotatedJar = "";
  try {
    await t.test(
      "successful seeded login, safe fields, cookie settings and cookie round trip",
      async () => {
        const response = await login();
        assert.equal(response.status, 200);
        const result = (await response.json()) as {
          user: Record<string, unknown>;
        };
        assert.deepEqual(Object.keys(result), ["user"]);
        assert.deepEqual(Object.keys(result.user).sort(), [
          "email",
          "id",
          "isActive",
          "role",
        ]);
        assert.equal(result.user.email, account.email);
        const cookies = response.headers.getSetCookie();
        assert.equal(cookies.length, 2);
        for (const header of cookies) {
          assert.ok(/HttpOnly/i.test(header));
          assert.ok(
            new RegExp(`SameSite=${config.sameSite}`, "i").test(header),
          );
          assert.ok(/Expires=/i.test(header));
          assert.ok(/Max-Age=/i.test(header));
          assert.equal(/; Secure/i.test(header), config.secure);
        }
        assert.ok(
          cookies.some(
            (header) =>
              header.startsWith(config.accessCookie + "=") &&
              /Path=\/api\/v1;/i.test(header),
          ),
        );
        assert.ok(
          cookies.some(
            (header) =>
              header.startsWith(config.refreshCookie + "=") &&
              /Path=\/api\/v1\/auth;/i.test(header),
          ),
        );
        assert.equal(response.headers.get("cache-control"), "no-store");
        firstJar = cookie(response);
        const me = await request("me", "GET", firstJar);
        assert.equal(me.status, 200);
        assert.deepEqual(await me.json(), result);
        const token = values(firstJar)[config.refreshCookie];
        const session = await db.getRepository(RefreshSession).findOneOrFail({
          where: { id: token.split(".")[0] },
          select: { id: true, refreshTokenHash: true },
        });
        assert.ok(session.refreshTokenHash !== token);
        assert.match(session.refreshTokenHash, /^[a-f0-9]{64}$/);
      },
    );
    await t.test(
      "all seeded roles can login and roles are read from the database",
      async () => {
        for (const seeded of seedAccounts()) {
          const response = await request("login", "POST", undefined, {
            email: seeded.email,
            password: seeded.password,
          });
          assert.equal(response.status, 200);
          const result = (await response.json()) as { user: { role: string } };
          assert.equal(result.user.role, seeded.role);
        }
        const claims = jwt.decode(
          values(firstJar)[config.accessCookie],
        ) as jwt.JwtPayload;
        const forgedRole = jwt.sign(
          { sid: claims.sid, role: "OWNER" },
          config.secret,
          {
            algorithm: "HS256",
            subject: user.id,
            issuer: config.issuer,
            audience: config.audience,
            expiresIn: 60,
          },
        );
        const me = await request(
          "me",
          "GET",
          config.accessCookie + "=" + forgedRole,
        );
        assert.equal(me.status, 200);
        assert.equal(
          ((await me.json()) as { user: { role: string } }).user.role,
          "MEMBER",
        );
      },
    );
    await t.test(
      "deleted user loses access with an existing token",
      async () => {
        const stored = await db.getRepository(User).findOneOrFail({
          where: { id: user.id },
          select: { passwordHash: true },
        });
        const email = "auth-test-" + randomUUID() + "@example.test";
        const fixture = await db.getRepository(User).save(
          db.getRepository(User).create({
            email,
            passwordHash: stored.passwordHash,
            role: user.role,
            isActive: true,
          }),
        );
        try {
          const response = await request("login", "POST", undefined, {
            email,
            password: account.password,
          });
          assert.equal(response.status, 200);
          const jar = cookie(response);
          await db.getRepository(User).delete(fixture.id);
          assert.equal((await request("me", "GET", jar)).status, 401);
          assert.equal((await request("refresh", "POST", jar)).status, 401);
        } finally {
          await db.getRepository(User).delete(fixture.id);
        }
      },
    );
    await t.test(
      "incorrect password and unknown email return identical generic errors",
      async () => {
        const wrong = await request("login", "POST", undefined, {
          email: account.email,
          password: "incorrect",
        });
        const unknown = await request("login", "POST", undefined, {
          email: `missing-${randomUUID()}@example.test`,
          password: "incorrect",
        });
        assert.equal(wrong.status, 401);
        assert.equal(unknown.status, 401);
        assert.deepEqual(await wrong.json(), await unknown.json());
        assert.equal(wrong.headers.getSetCookie().length, 0);
      },
    );
    await t.test(
      "disabled user cannot login, use access token or refresh",
      async () => {
        await db.getRepository(User).update(user.id, { isActive: false });
        try {
          assert.equal((await login()).status, 401);
          assert.equal((await request("me", "GET", firstJar)).status, 401);
          assert.equal(
            (await request("refresh", "POST", firstJar)).status,
            401,
          );
        } finally {
          await db.getRepository(User).update(user.id, { isActive: true });
        }
      },
    );
    await t.test(
      "expired, tampered, wrong issuer/audience and missing access tokens rejected",
      async () => {
        const original = values(firstJar)[config.accessCookie];
        const claims = jwt.decode(original) as jwt.JwtPayload;
        for (const options of [
          { expiresIn: -1, issuer: config.issuer, audience: config.audience },
          { expiresIn: 60, issuer: "invalid", audience: config.audience },
          { expiresIn: 60, issuer: config.issuer, audience: "invalid" },
        ]) {
          const token = jwt.sign({ sid: claims.sid }, config.secret, {
            algorithm: "HS256",
            subject: user.id,
            ...options,
          });
          assert.equal(
            (await request("me", "GET", `${config.accessCookie}=${token}`))
              .status,
            401,
          );
        }
        assert.equal(
          (await request("me", "GET", `${config.accessCookie}=broken`)).status,
          401,
        );
        assert.equal((await request("me")).status, 401);
      },
    );
    await t.test(
      "unknown DTO fields and invalid input are rejected",
      async () => {
        assert.equal(
          (
            await request("login", "POST", undefined, {
              email: account.email,
              password: account.password,
              role: "OWNER",
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("login", "POST", undefined, {
              email: "invalid",
              password: 1,
            })
          ).status,
          400,
        );
        assert.equal(
          (await request("refresh", "POST", firstJar, { unexpected: true }))
            .status,
          400,
        );
        assert.equal(
          (await request("logout", "POST", firstJar, { unexpected: true }))
            .status,
          400,
        );
      },
    );
    await t.test(
      "CSRF blocks foreign, missing, null and cross-site origins on all mutations",
      async () => {
        for (const path of ["login", "refresh", "logout"]) {
          for (const origin of ["https://evil.example", null, "null"])
            assert.equal(
              (await request(path, "POST", firstJar, {}, origin)).status,
              403,
            );
          assert.equal(
            (
              await request(
                path,
                "POST",
                firstJar,
                {},
                config.origin,
                "cross-site",
              )
            ).status,
            403,
          );
        }
      },
    );
    await t.test(
      "refresh rotation is atomic under concurrency and old token is rejected",
      async () => {
        const responses = await Promise.all([
          request("refresh", "POST", firstJar),
          request("refresh", "POST", firstJar),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 401]);
        const success = responses.find((r) => r.status === 200)!;
        assert.equal(success.headers.getSetCookie().length, 2);
        rotatedJar = cookie(success);
        assert.ok(rotatedJar !== firstJar);
        const previousId = values(firstJar)[config.refreshCookie].split(".")[0];
        const old = await db
          .getRepository(RefreshSession)
          .findOneByOrFail({ id: previousId });
        assert.ok(old.revokedAt);
        assert.equal(old.revocationReason, "rotated");
        const nextId = values(rotatedJar)[config.refreshCookie].split(".")[0];
        const next = await db
          .getRepository(RefreshSession)
          .findOneByOrFail({ id: nextId });
        assert.equal(next.expiresAt.getTime(), old.expiresAt.getTime());
        assert.equal((await request("refresh", "POST", firstJar)).status, 401);
        assert.equal((await request("me", "GET", firstJar)).status, 401);
        assert.equal((await request("me", "GET", rotatedJar)).status, 200);
      },
    );
    await t.test(
      "logout revokes session and clears both cookies, access also rejected",
      async () => {
        const response = await request("logout", "POST", rotatedJar);
        assert.equal(response.status, 204);
        assert.equal(response.headers.getSetCookie().length, 2);
        for (const header of response.headers.getSetCookie())
          assert.ok(header.includes("Expires=Thu, 01 Jan 1970"));
        const id = values(rotatedJar)[config.refreshCookie].split(".")[0];
        assert.equal(
          (await db.getRepository(RefreshSession).findOneByOrFail({ id }))
            .revocationReason,
          "logout",
        );
        assert.equal(
          (await request("refresh", "POST", rotatedJar)).status,
          401,
        );
        assert.equal((await request("me", "GET", rotatedJar)).status, 401);
        assert.equal((await request("logout", "POST", rotatedJar)).status, 204);
      },
    );
    await t.test(
      "invalid and expired refresh sessions are rejected",
      async () => {
        assert.equal((await request("refresh", "POST")).status, 401);
        assert.equal(
          (await request("refresh", "POST", `${config.refreshCookie}=invalid`))
            .status,
          401,
        );
        const response = await login();
        assert.equal(response.status, 200);
        const jar = cookie(response);
        const token = values(jar)[config.refreshCookie];
        const id = token.split(".")[0];
        assert.equal(
          (
            await request(
              "refresh",
              "POST",
              `${config.refreshCookie}=${id}.${"A".repeat(43)}`,
            )
          ).status,
          401,
        );
        await db.query(
          "UPDATE refresh_sessions SET created_at=now()-interval '2 days', expires_at=now()-interval '1 day' WHERE id=$1",
          [id],
        );
        assert.equal((await request("refresh", "POST", jar)).status, 401);
      },
    );
    await t.test(
      "production cookie enforcement and startup config validation",
      () => {
        const env = {
          ...process.env,
          NODE_ENV: "production",
          APP_ORIGIN: "https://taskboard.example",
          COOKIE_SECURE: "true",
        };
        const production = new AuthConfig(new ConfigService(env));
        assert.equal(production.secure, true);
        assert.equal(cookieOptions(production, false).secure, true);
        assert.equal(cookieOptions(production, true).httpOnly, true);
        assert.throws(
          () =>
            new AuthConfig(
              new ConfigService({ ...env, COOKIE_SECURE: "false" }),
            ),
        );
        assert.throws(
          () =>
            new AuthConfig(
              new ConfigService({ ...env, JWT_ACCESS_SECRET: "short" }),
            ),
        );
        assert.throws(
          () =>
            new AuthConfig(
              new ConfigService({ ...env, JWT_ACCESS_TTL_SECONDS: "0" }),
            ),
        );
      },
    );
    await t.test(
      "login limits repeated attempts without trusting forwarded IP",
      async () => {
        const email = "rate-" + randomUUID() + "@example.test";
        for (let i = 0; i < 15; i++)
          assert.equal(
            (
              await request("login", "POST", undefined, {
                email,
                password: "Wrong-password-123!",
              })
            ).status,
            401,
          );
        const blocked = await request("login", "POST", undefined, {
          email,
          password: "Wrong-password-123!",
        });
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("retry-after")) > 0);
        assert.equal((await login()).status, 200);
      },
    );
  } finally {
    // Only remove sessions minted by this test, preserving all prior database data.
    if (sessions.size)
      await db.getRepository(RefreshSession).delete({ id: In([...sessions]) });
    if (app) await app.close();
    else await source.destroy();
  }
});

import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DataSource, In } from "typeorm";
import { compare, hash } from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../app.module";
import { configureApp } from "../configure-app";
import source from "../database/data-source";
import { assertLocalDatabase } from "../database/local-guard";
import { User, UserRole } from "../database/entities/user.entity";
import { RefreshSession } from "../database/entities/refresh-session.entity";
import { seedAccounts } from "../database/seed";
import { AuthConfig } from "../auth/auth.config";
import { TaskPolicyService } from "../auth/task-policy.service";

void test("RBAC and user management HTTP integration (local PostgreSQL)", async (t) => {
  assertLocalDatabase();
  let app: INestApplication | undefined;
  let db: DataSource;
  let base = process.env.TEST_BASE_URL;
  let config: AuthConfig;
  if (base) {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
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
  const fixtures: string[] = [];
  const sessions: string[] = [];
  const originalOwners = await db
    .getRepository(User)
    .findBy({ role: UserRole.OWNER, isActive: true });
  const password = randomUUID() + "Aa1!";
  const prefix = "rbac-" + randomUUID();
  const jar = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  async function request(
    path: string,
    method = "GET",
    cookie?: string,
    body?: unknown,
    origin: string | null = config.origin,
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (origin !== null) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    for (const value of response.headers.getSetCookie()) {
      if (value.startsWith(config.refreshCookie + "=")) {
        const token = decodeURIComponent(
          value.split(";")[0].slice(config.refreshCookie.length + 1),
        );
        if (token) sessions.push(token.split(".")[0]);
      }
    }
    return response;
  }
  async function login(email: string, secret = password) {
    const response = await request("auth/login", "POST", undefined, {
      email,
      password: secret,
    });
    assert.equal(response.status, 200);
    return jar(response);
  }
  async function fixture(role: UserRole) {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: `${prefix}-${fixtures.length}@example.test`,
        role,
        isActive: true,
        passwordHash: await hash(password, 12),
      }),
    );
    fixtures.push(user.id);
    return user;
  }
  const safe = (user: Record<string, unknown>) =>
    assert.deepEqual(Object.keys(user).sort(), [
      "createdAt",
      "email",
      "id",
      "isActive",
      "role",
      "updatedAt",
    ]);
  try {
    await t.test(
      "development seed roles are active and OWNER/MANAGER/MEMBER obey permissions",
      async () => {
        for (const account of seedAccounts()) {
          const user = await db
            .getRepository(User)
            .findOneByOrFail({ email: account.email });
          assert.equal(user.role, account.role);
          assert.equal(user.isActive, true);
          const cookie = await login(account.email, account.password);
          assert.equal(
            (await request("users", "GET", cookie)).status,
            account.role === UserRole.OWNER ? 200 : 403,
          );
        }
      },
    );
    const owner = await fixture(UserRole.OWNER);
    const manager = await fixture(UserRole.MANAGER);
    const member = await fixture(UserRole.MEMBER);
    const ownerJar = await login(owner.email);
    let managerJar = await login(manager.email);
    const memberJar = await login(member.email);
    await t.test(
      "assignees exposes only active id/email to OWNER and MANAGER",
      async () => {
        const disabled = await fixture(UserRole.MEMBER);
        await db.getRepository(User).update(disabled.id, { isActive: false });
        for (const jar of [ownerJar, managerJar]) {
          const response = await request("assignees", "GET", jar);
          assert.equal(response.status, 200);
          const rows = (await response.json()) as {
            id: string;
            email: string;
          }[];
          rows.forEach((row) =>
            assert.deepEqual(Object.keys(row).sort(), ["email", "id"]),
          );
          assert.ok(rows.some((row) => row.id === member.id));
          assert.ok(!rows.some((row) => row.id === disabled.id));
        }
        assert.equal(
          (await request("assignees", "GET", memberJar)).status,
          403,
        );
        assert.equal((await request("assignees")).status, 401);
        assert.equal((await request("users", "GET", managerJar)).status, 403);
      },
    );
    let created: User;
    await t.test(
      "OWNER lists users safely with timestamps and deterministic ordering",
      async () => {
        const response = await request("users", "GET", ownerJar);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const users = (await response.json()) as Record<string, unknown>[];
        users.forEach(safe);
        assert.deepEqual(
          users,
          await (await request("users", "GET", ownerJar)).json(),
        );
        const ordered = await db
          .getRepository(User)
          .find({ order: { createdAt: "ASC", id: "ASC" } });
        assert.deepEqual(
          users.map((user) => user.id),
          ordered.map((user) => user.id),
        );
      },
    );
    await t.test(
      "OWNER creates a normalized user with bcrypt hash and safe response",
      async () => {
        const email = `${prefix}-created@example.test`;
        const response = await request("users", "POST", ownerJar, {
          email: `  ${email.toUpperCase()}  `,
          password,
          role: UserRole.MEMBER,
        });
        assert.equal(response.status, 201);
        created = (await response.json()) as User;
        fixtures.push(created.id);
        safe(created as unknown as Record<string, unknown>);
        assert.equal(created.email, email);
        const stored = await db.getRepository(User).findOneOrFail({
          where: { id: created.id },
          select: { passwordHash: true },
        });
        assert.ok(await compare(password, stored.passwordHash));
      },
    );
    await t.test(
      "OWNER changes roles and old tokens follow current database role",
      async () => {
        assert.equal(
          (
            await request(`users/${member.id}`, "PATCH", ownerJar, {
              role: UserRole.OWNER,
            })
          ).status,
          200,
        );
        assert.equal((await request("users", "GET", memberJar)).status, 200);
        assert.equal(
          (
            await request(`users/${member.id}`, "PATCH", ownerJar, {
              role: UserRole.MEMBER,
            })
          ).status,
          200,
        );
        assert.equal((await request("users", "GET", memberJar)).status, 403);
      },
    );
    await t.test(
      "OWNER disables/reactivates users; existing access and refresh tokens lose access immediately",
      async () => {
        assert.equal(
          (
            await request(`users/${manager.id}`, "PATCH", ownerJar, {
              isActive: false,
            })
          ).status,
          200,
        );
        assert.equal((await request("users", "GET", managerJar)).status, 401);
        assert.equal((await request("auth/me", "GET", managerJar)).status, 401);
        assert.equal(
          (await request("auth/refresh", "POST", managerJar)).status,
          401,
        );
        assert.equal(
          (
            await request(`users/${manager.id}`, "PATCH", ownerJar, {
              isActive: true,
            })
          ).status,
          200,
        );
        assert.equal((await request("auth/me", "GET", managerJar)).status, 401);
        assert.equal(
          (await request("auth/refresh", "POST", managerJar)).status,
          401,
        );
        managerJar = await login(manager.email);
      },
    );
    for (const [label, cookie, expected] of [
      ["MANAGER", managerJar, 403],
      ["MEMBER", memberJar, 403],
      ["unauthenticated", undefined, 401],
    ] as const) {
      await t.test(
        `${label}: all user management methods return ${expected}`,
        async () => {
          for (const [path, method, body] of [
            ["users", "GET", undefined],
            [
              "users",
              "POST",
              {
                email: `${prefix}-denied@example.test`,
                password,
                role: UserRole.OWNER,
              },
            ],
            [`users/${member.id}`, "PATCH", { role: UserRole.OWNER }],
          ] as const)
            assert.equal(
              (await request(path, method, cookie, body)).status,
              expected,
            );
        },
      );
    }
    await t.test(
      "stale signed OWNER JWT claim cannot grant MEMBER user management",
      async () => {
        const access = memberJar
          .split("; ")
          .find((value) => value.startsWith(config.accessCookie + "="))!
          .slice(config.accessCookie.length + 1);
        const claims = jwt.decode(decodeURIComponent(access)) as jwt.JwtPayload;
        const token = jwt.sign(
          { sid: claims.sid, role: "OWNER" },
          config.secret,
          {
            algorithm: "HS256",
            subject: member.id,
            issuer: config.issuer,
            audience: config.audience,
            expiresIn: 60,
          },
        );
        assert.equal(
          (await request("users", "GET", `${config.accessCookie}=${token}`))
            .status,
          403,
        );
      },
    );
    await t.test(
      "duplicate emails including case variations return 409, including concurrent creation",
      async () => {
        for (const email of [created.email, created.email.toUpperCase()])
          assert.equal(
            (
              await request("users", "POST", ownerJar, {
                email,
                password,
                role: UserRole.MEMBER,
              })
            ).status,
            409,
          );
        const email = `${prefix}-race@example.test`;
        const responses = await Promise.all(
          [email, email.toUpperCase()].map((email) =>
            request("users", "POST", ownerJar, {
              email,
              password,
              role: UserRole.MEMBER,
            }),
          ),
        );
        for (const response of responses)
          if (response.status === 201)
            fixtures.push(((await response.json()) as User).id);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [201, 409],
        );
      },
    );
    await t.test(
      "strict DTOs reject unknown fields, invalid enums, nulls, booleans, empty updates and oversized UTF-8 passwords",
      async () => {
        for (const body of [
          { role: "ADMIN" },
          { isActive: "false" },
          { role: null },
          { isActive: null },
          {},
          { passwordHash: "injected" },
          { id: owner.id },
          { email: owner.email },
          { role: UserRole.OWNER, unexpected: true },
        ])
          assert.equal(
            (await request(`users/${member.id}`, "PATCH", ownerJar, body))
              .status,
            400,
          );
        for (const body of [
          { email: "invalid", password, role: UserRole.MEMBER },
          {
            email: `${prefix}@example.test`,
            password: "short",
            role: UserRole.MEMBER,
          },
          {
            email: `${prefix}@example.test`,
            password: "�".repeat(40),
            role: UserRole.MEMBER,
          },
          {
            email: `${prefix}@example.test`,
            password,
            role: UserRole.MEMBER,
            isActive: false,
          },
        ])
          assert.equal(
            (await request("users", "POST", ownerJar, body)).status,
            400,
          );
      },
    );
    await t.test(
      "nonexistent user returns 404 and invalid UUID returns 400",
      async () => {
        assert.equal(
          (
            await request(`users/${randomUUID()}`, "PATCH", ownerJar, {
              isActive: false,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request("users/invalid", "PATCH", ownerJar, {
              isActive: false,
            })
          ).status,
          400,
        );
      },
    );
    await t.test("user mutations enforce CSRF origin", async () => {
      for (const origin of [null, "null", "https://evil.example"])
        for (const [path, method] of [
          ["users", "POST"],
          [`users/${member.id}`, "PATCH"],
        ])
          assert.equal(
            (await request(path, method, ownerJar, {}, origin)).status,
            403,
          );
    });
    await t.test(
      "unauthenticated mutations return 401 even without an Origin header",
      async () => {
        assert.equal(
          (await request("users", "POST", undefined, {}, null)).status,
          401,
        );
        assert.equal(
          (await request(`users/${member.id}`, "PATCH", undefined, {}, null))
            .status,
          401,
        );
      },
    );
    await t.test(
      "task policy covers role matrix, visibility, immutable creator and active assignees",
      async () => {
        const policy = new TaskPolicyService(db);
        const own = { creatorId: member.id, assigneeId: null };
        const assigned = { creatorId: owner.id, assigneeId: member.id };
        const other = { creatorId: owner.id, assigneeId: manager.id };
        for (const actor of [owner, manager]) {
          for (const action of ["view", "create", "update", "delete"] as const)
            await policy.authorize(actor.id, action, other);
          await policy.authorize(actor.id, "update", other, {
            assigneeId: member.id,
          });
          assert.deepEqual(await policy.visibility(actor.id), [{}]);
        }
        await policy.authorize(member.id, "create", undefined, {
          creatorId: member.id,
          assigneeId: member.id,
        });
        for (const task of [own, assigned])
          for (const action of ["view", "update"] as const)
            await policy.authorize(member.id, action, task);
        await policy.authorize(member.id, "delete", own);
        for (const action of ["view", "update", "delete"] as const)
          await assert.rejects(policy.authorize(member.id, action, other));
        await assert.rejects(policy.authorize(member.id, "delete", assigned));
        await assert.rejects(
          policy.authorize(member.id, "update", other, {
            assigneeId: member.id,
          }),
        );
        await assert.rejects(
          policy.authorize(member.id, "update", own, {
            assigneeId: manager.id,
          }),
        );
        await assert.rejects(
          policy.authorize(member.id, "create", undefined, {
            creatorId: owner.id,
          }),
        );
        await assert.rejects(
          policy.authorize(owner.id, "update", other, { creatorId: member.id }),
        );
        await db.getRepository(User).update(manager.id, { isActive: false });
        try {
          await assert.rejects(
            policy.authorize(owner.id, "update", own, {
              assigneeId: manager.id,
            }),
          );
          await assert.rejects(policy.visibility(manager.id));
        } finally {
          await db.getRepository(User).update(manager.id, { isActive: true });
        }
        assert.deepEqual(await policy.visibility(member.id), [
          { creatorId: member.id },
          { assigneeId: member.id },
        ]);
      },
    );
    // Temporarily isolate fixture owners to exercise the real global invariant.
    // Restore every original owner in finally; never reset or reseed the database.
    await db
      .getRepository(User)
      .update(
        { id: In(originalOwners.map((user) => user.id)) },
        { isActive: false },
      );
    await t.test(
      "last active OWNER cannot be disabled or demoted, including combined payload",
      async () => {
        for (const body of [
          { isActive: false },
          { role: UserRole.MEMBER },
          { role: UserRole.MANAGER, isActive: false },
        ])
          assert.equal(
            (await request(`users/${owner.id}`, "PATCH", ownerJar, body))
              .status,
            409,
          );
      },
    );
    await t.test(
      "concurrent OWNER demotion/deactivation preserves an active OWNER",
      async () => {
        const second = await fixture(UserRole.OWNER);
        const secondJar = await login(second.email);
        const responses = await Promise.all([
          request(`users/${owner.id}`, "PATCH", ownerJar, {
            role: UserRole.MEMBER,
          }),
          request(`users/${second.id}`, "PATCH", secondJar, {
            isActive: false,
          }),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status).sort(),
          [200, 409],
        );
        assert.equal(
          await db
            .getRepository(User)
            .countBy({ role: UserRole.OWNER, isActive: true }),
          1,
        );
        await db
          .getRepository(User)
          .update(owner.id, { role: UserRole.OWNER, isActive: true });
        await db
          .getRepository(User)
          .update(second.id, { role: UserRole.MEMBER, isActive: true });
      },
    );
    await t.test(
      "waiting mutations reauthorize the actor after another transaction demotes it",
      async () => {
        await fixture(UserRole.OWNER);
        const runner = db.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        try {
          await runner.query("SELECT pg_advisory_xact_lock(1791701867, 4)");
          const pending = request(`users/${member.id}`, "PATCH", ownerJar, {
            role: UserRole.OWNER,
          });
          // Wait until HTTP guards have passed and the service is blocked on
          // our mutex, so this tests the in-transaction authorization recheck.
          const deadline = Date.now() + 10000;
          let waiting = false;
          while (Date.now() < deadline) {
            const locks = (await db.query(
              "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=1791701867 AND objid=4 AND NOT granted",
            )) as unknown[];
            if (locks.length) {
              waiting = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          assert.ok(waiting, "Request must reach the transaction mutex");
          await runner.manager.update(User, owner.id, {
            role: UserRole.MEMBER,
          });
          await runner.commitTransaction();
          assert.equal((await pending).status, 403);
        } finally {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
          await db
            .getRepository(User)
            .update(owner.id, { role: UserRole.OWNER });
        }
      },
    );
  } finally {
    for (const user of originalOwners)
      await db.getRepository(User).update(user.id, {
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt,
      });
    if (sessions.length)
      await db.getRepository(RefreshSession).delete({ id: In(sessions) });
    if (fixtures.length)
      await db.getRepository(User).delete({ id: In(fixtures) });
    if (app) await app.close();
    else await source.destroy();
  }
});

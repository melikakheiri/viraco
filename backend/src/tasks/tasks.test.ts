import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { DataSource, In } from "typeorm";
import { hash } from "bcryptjs";
import * as jwt from "jsonwebtoken";
import { AppModule } from "../app.module";
import { configureApp } from "../configure-app";
import source from "../database/data-source";
import { assertLocalDatabase } from "../database/local-guard";
import { User, UserRole } from "../database/entities/user.entity";
import {
  Task,
  TaskPriority,
  TaskStatus,
} from "../database/entities/task.entity";
import { RefreshSession } from "../database/entities/refresh-session.entity";
import { seedAccounts } from "../database/seed";
import { AuthConfig } from "../auth/auth.config";
import { validTipTap } from "./tiptap.validator";

interface Page {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}
const richDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "عنوان فارسی" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "متن",
          marks: [
            { type: "bold" },
            { type: "italic" },
            {
              type: "link",
              attrs: {
                href: "https://example.test/path?q=1",
                target: "_blank",
                rel: "noopener noreferrer",
                class: null,
              },
            },
          ],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "اول" }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 2 },
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph" },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "نقل قول" }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

void test("Phase 5 task CRUD HTTP integration (local PostgreSQL)", async (t) => {
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
  const users: User[] = [];
  const taskIds: string[] = [];
  const sessions: string[] = [];
  const password = randomUUID() + "Aa1!";
  const prefix = "todos-" + randomUUID();
  async function request(
    path: string,
    method = "GET",
    cookie?: string,
    body?: unknown,
    origin: string | null = config.origin,
    raw = false,
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (origin !== null) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${base}/api/v1/${path}`, {
      method,
      headers,
      body:
        method === "GET"
          ? undefined
          : raw
            ? String(body)
            : JSON.stringify(body ?? {}),
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
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }
  async function fixture(role: UserRole, active = true) {
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: `${prefix}-${users.length}@example.test`,
        passwordHash: await hash(password, 12),
        role,
        isActive: active,
      }),
    );
    users.push(user);
    return user;
  }
  async function create(cookie: string, body: Record<string, unknown> = {}) {
    const response = await request("todos", "POST", cookie, {
      title: prefix,
      ...body,
    });
    assert.equal(
      response.status,
      201,
      JSON.stringify(await response.clone().json()),
    );
    const task = (await response.json()) as Task;
    taskIds.push(task.id);
    return task;
  }
  async function page(cookie: string, query = "") {
    const response = await request("todos" + query, "GET", cookie);
    assert.equal(response.status, 200);
    return (await response.json()) as Page;
  }
  async function waitForLock(sql: string) {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (((await db.query(sql)) as unknown[]).length) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("HTTP request did not reach the expected PostgreSQL lock");
  }
  try {
    await t.test(
      "all development seed roles access todos and keep their intended active roles",
      async () => {
        for (const account of seedAccounts()) {
          const user = await db
            .getRepository(User)
            .findOneByOrFail({ email: account.email });
          assert.equal(user.role, account.role);
          assert.equal(user.isActive, true);
          assert.equal(
            (
              await request(
                "todos",
                "GET",
                await login(account.email, account.password),
              )
            ).status,
            200,
          );
        }
      },
    );
    const owner = await fixture(UserRole.OWNER);
    const manager = await fixture(UserRole.MANAGER);
    const member = await fixture(UserRole.MEMBER);
    const other = await fixture(UserRole.MEMBER);
    const disabled = await fixture(UserRole.MEMBER, false);
    const ownerJar = await login(owner.email);
    const managerJar = await login(manager.email);
    let memberJar = await login(member.email);
    const otherJar = await login(other.email);
    let owned: Task;
    let assigned: Task;
    let hidden: Task;
    await t.test(
      "OWNER creates full task, persists JSONB, returns safe fields and defaults",
      async () => {
        owned = await create(memberJar, {
          title: "  کار فارسی  ",
          assigneeId: member.id,
        });
        assert.equal(owned.title, "کار فارسی");
        assert.equal(owned.creatorId, member.id);
        assert.equal(owned.status, TaskStatus.TODO);
        assert.equal(owned.priority, TaskPriority.MEDIUM);
        assert.equal(owned.dueDate, null);
        assert.deepEqual(owned.description, { type: "doc", content: [] });
        assigned = await create(ownerJar, {
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.HIGH,
          assigneeId: member.id,
          dueDate: "2026-11-01T12:00:00+03:30",
          description: richDocument,
        });
        hidden = await create(ownerJar, {
          status: TaskStatus.DONE,
          assigneeId: other.id,
        });
        assert.equal(assigned.creatorId, owner.id);
        assert.equal(String(assigned.dueDate), "2026-11-01T08:30:00.000Z");
        assert.deepEqual(assigned.description, richDocument);
        const stored = await db
          .getRepository(Task)
          .findOneByOrFail({ id: assigned.id });
        assert.deepEqual(stored.description, richDocument);
        const [type] = (await db.query(
          "SELECT pg_typeof(description)::text AS type FROM tasks WHERE id=$1",
          [assigned.id],
        )) as { type: string }[];
        assert.equal(type.type, "jsonb");
        assert.deepEqual(Object.keys(assigned).sort(), [
          "assigneeId",
          "createdAt",
          "creatorId",
          "description",
          "dueDate",
          "id",
          "priority",
          "status",
          "title",
          "updatedAt",
        ]);
      },
    );
    await t.test(
      "OWNER and MANAGER view, update, assign and delete tasks created by others",
      async () => {
        for (const cookie of [ownerJar, managerJar]) {
          const task = await create(otherJar);
          assert.equal(
            (await request(`todos/${task.id}`, "GET", cookie)).status,
            200,
          );
          const response = await request(`todos/${task.id}`, "PATCH", cookie, {
            title: "Changed",
            status: TaskStatus.DONE,
            priority: TaskPriority.LOW,
            assigneeId: member.id,
            description: richDocument,
            dueDate: "2026-12-01T00:00:00Z",
          });
          assert.equal(response.status, 200);
          const updated = (await response.json()) as Task;
          assert.equal(updated.creatorId, other.id);
          assert.equal(updated.assigneeId, member.id);
          assert.deepEqual(updated.description, richDocument);
          assert.equal(
            (await request(`todos/${task.id}`, "DELETE", cookie)).status,
            204,
          );
          assert.equal(
            (await request(`todos/${task.id}`, "GET", cookie)).status,
            404,
          );
        }
        const managed = await create(managerJar, { assigneeId: owner.id });
        assert.equal(managed.creatorId, manager.id);
      },
    );
    await t.test(
      "MEMBER views/updates created and assigned tasks but cannot view or modify unrelated tasks",
      async () => {
        for (const task of [owned, assigned]) {
          assert.equal(
            (await request(`todos/${task.id}`, "GET", memberJar)).status,
            200,
          );
          assert.equal(
            (
              await request(`todos/${task.id}`, "PATCH", memberJar, {
                title: "Member update",
              })
            ).status,
            200,
          );
        }
        for (const method of ["GET", "PATCH", "DELETE"])
          assert.equal(
            (
              await request(`todos/${hidden.id}`, method, memberJar, {
                title: "Intrusion",
              })
            ).status,
            403,
          );
      },
    );
    await t.test(
      "MEMBER deletes created tasks but cannot delete tasks merely assigned to them",
      async () => {
        const task = await create(memberJar);
        const response = await request(`todos/${task.id}`, "DELETE", memberJar);
        assert.equal(response.status, 204);
        assert.equal(await response.text(), "");
        assert.equal(
          (await request(`todos/${assigned.id}`, "DELETE", memberJar)).status,
          403,
        );
      },
    );
    await t.test(
      "MEMBER cannot assign others or bypass authorization by changing assignee or creator",
      async () => {
        assert.equal(
          (
            await request("todos", "POST", memberJar, {
              title: "Bad assignment",
              assigneeId: other.id,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(`todos/${owned.id}`, "PATCH", memberJar, {
              assigneeId: other.id,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(`todos/${hidden.id}`, "PATCH", memberJar, {
              assigneeId: member.id,
            })
          ).status,
          403,
        );
        for (const cookie of [ownerJar, managerJar, memberJar]) {
          assert.equal(
            (
              await request("todos", "POST", cookie, {
                title: "Creator injection",
                creatorId: owner.id,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(`todos/${owned.id}`, "PATCH", cookie, {
                creatorId: other.id,
              })
            ).status,
            400,
          );
        }
        assert.equal(
          (
            await request(`todos/${owned.id}`, "PATCH", memberJar, {
              assigneeId: null,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(`todos/${owned.id}`, "PATCH", memberJar, {
              assigneeId: member.id,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "assignees must exist and be active; OWNER/MANAGER can unassign",
      async () => {
        for (const id of [disabled.id, randomUUID()])
          for (const cookie of [ownerJar, managerJar]) {
            assert.equal(
              (
                await request("todos", "POST", cookie, {
                  title: "Bad assignee",
                  assigneeId: id,
                })
              ).status,
              403,
            );
            assert.equal(
              (
                await request(`todos/${owned.id}`, "PATCH", cookie, {
                  assigneeId: id,
                })
              ).status,
              403,
            );
          }
        const task = await create(ownerJar, {
          assigneeId: member.id,
          dueDate: "2026-11-01T00:00:00Z",
        });
        const response = await request(
          `todos/${task.id}`,
          "PATCH",
          managerJar,
          { assigneeId: null, dueDate: null },
        );
        assert.equal(response.status, 200);
        const updated = (await response.json()) as Task;
        assert.equal(updated.assigneeId, null);
        assert.equal(updated.dueDate, null);
        assert.equal(
          (
            await request(`users/${other.id}`, "PATCH", ownerJar, {
              isActive: false,
            })
          ).status,
          200,
        );
        try {
          assert.equal(
            (
              await request(`todos/${hidden.id}`, "PATCH", ownerJar, {
                assigneeId: other.id,
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(`todos/${hidden.id}`, "PATCH", ownerJar, {
                title: "Existing inactive assignee",
              })
            ).status,
            200,
          );
        } finally {
          assert.equal(
            (
              await request(`users/${other.id}`, "PATCH", ownerJar, {
                isActive: true,
              })
            ).status,
            200,
          );
        }
      },
    );
    await t.test(
      "status and assignee filters combine with MEMBER visibility in SQL and totals",
      async () => {
        const visible = await page(memberJar);
        assert.deepEqual(
          visible.items.map((task) => task.id).sort(),
          [owned.id, assigned.id].sort(),
        );
        assert.equal(visible.total, 2);
        for (const status of Object.values(TaskStatus)) {
          for (const assigneeId of [member.id, other.id]) {
            const result = await page(
              memberJar,
              `?status=${status}&assigneeId=${assigneeId}`,
            );
            const expected = await db
              .getRepository(Task)
              .createQueryBuilder("task")
              .where("(task.creatorId=:actor OR task.assigneeId=:actor)", {
                actor: member.id,
              })
              .andWhere("task.status=:status AND task.assigneeId=:assigneeId", {
                status,
                assigneeId,
              })
              .getMany();
            assert.equal(result.total, expected.length);
            assert.deepEqual(
              result.items.map((task) => task.id).sort(),
              expected.map((task) => task.id).sort(),
            );
          }
        }
        for (const cookie of [ownerJar, managerJar]) {
          const filtered = await page(
            cookie,
            `?status=done&assigneeId=${other.id}`,
          );
          assert.deepEqual(
            filtered.items.map((task) => task.id),
            [hidden.id],
          );
          assert.equal(filtered.total, 1);
        }
        assert.equal(
          (await page(memberJar, `?assigneeId=${other.id}`)).total,
          0,
        );
        assert.equal((await page(memberJar, "?status=done")).total, 0);
      },
    );
    await t.test(
      "pagination defaults, bounds, stable ordering and out-of-range pages respect visibility",
      async () => {
        const first = await page(memberJar);
        assert.equal(first.page, 1);
        assert.equal(first.pageSize, 20);
        // Force equal timestamps to verify the UUID tie-breaker.
        await db
          .getRepository(Task)
          .update(
            { id: In([owned.id, assigned.id]) },
            { createdAt: new Date("2026-01-01T00:00:00Z") },
          );
        const one = await page(memberJar, "?page=1&pageSize=1");
        const two = await page(memberJar, "?page=2&pageSize=1");
        assert.equal(one.total, 2);
        assert.equal(two.total, 2);
        assert.equal(one.items.length, 1);
        assert.equal(two.items.length, 1);
        assert.deepEqual(
          [...one.items, ...two.items].map((task) => task.id),
          [owned.id, assigned.id].sort().reverse(),
        );
        assert.deepEqual(await page(memberJar, "?page=1&pageSize=1"), one);
        const beyond = await page(memberJar, "?page=100&pageSize=100");
        assert.equal(beyond.total, 2);
        assert.deepEqual(beyond.items, []);
      },
    );
    await t.test(
      "strict query validation rejects unknown, repeated and invalid filters/pagination",
      async () => {
        for (const query of [
          "status=bad",
          "assigneeId=invalid",
          "status=todo&status=done",
          "page=0",
          "page=-1",
          "page=1.5",
          "page=1e2",
          "page=",
          "pageSize=0",
          "pageSize=101",
          "pageSize=20junk",
          "unknown=true",
          "creatorId=" + member.id,
          "limit=10",
          "assigneeId=null",
          "status=%27%20OR%201=1--",
        ])
          assert.equal(
            (await request("todos?" + query, "GET", memberJar)).status,
            400,
            query,
          );
      },
    );
    await t.test(
      "strict task DTOs reject unknown/entity fields and invalid scalar types",
      async () => {
        for (const body of [
          {},
          { title: " " },
          { title: "x".repeat(256) },
          { title: 12 },
          { title: "\u0000" },
          { title: "Bad", status: "DONE" },
          { title: "Bad", priority: "urgent" },
          { title: "Bad", assigneeId: false },
          { title: "Bad", dueDate: "2026-02-30T00:00:00Z" },
          { title: "Bad", dueDate: "2026-11-01" },
          { title: "Bad", dueDate: 1 },
          { title: "Bad", passwordHash: "injected" },
        ])
          assert.equal(
            (await request("todos", "POST", ownerJar, body)).status,
            400,
            JSON.stringify(body),
          );
        for (const body of [
          {},
          { title: null },
          { status: null },
          { priority: null },
          { description: null },
          { assigneeId: "invalid" },
          { title: { nested: true } },
          { id: hidden.id },
          { createdAt: "2026-01-01" },
          { creator: { id: owner.id } },
          { role: "OWNER" },
        ])
          assert.equal(
            (await request(`todos/${owned.id}`, "PATCH", ownerJar, body))
              .status,
            400,
          );
      },
    );
    await t.test(
      "valid empty and rich TipTap documents round-trip unchanged on create and update",
      async () => {
        for (const description of [
          { type: "doc" },
          { type: "doc", content: [] },
          { type: "doc", content: [{ type: "paragraph" }] },
          richDocument,
        ]) {
          const task = await create(memberJar, { description });
          const response = await request(`todos/${task.id}`, "GET", memberJar);
          assert.equal(response.status, 200);
          assert.deepEqual(
            ((await response.json()) as Task).description,
            description,
          );
          const update = await request(`todos/${task.id}`, "PATCH", memberJar, {
            description,
          });
          assert.equal(update.status, 200);
          assert.deepEqual(
            ((await update.json()) as Task).description,
            description,
          );
        }
      },
    );
    await t.test(
      "TipTap rejects malformed tree shapes, nodes, marks and attributes on create and update",
      async () => {
        const paragraph = (node: unknown) => ({
          type: "doc",
          content: [{ type: "paragraph", content: [node] }],
        });
        const text = (marks: unknown[]) =>
          paragraph({ type: "text", text: "link", marks });
        const invalid: unknown[] = [
          "<p>HTML</p>",
          [],
          null,
          {},
          { type: "paragraph" },
          { type: "doc", content: {} },
          { type: "doc", content: [null] },
          { type: "doc", content: [{ type: "text", text: "not a block" }] },
          { type: "doc", content: [{ type: "script" }] },
          { type: "doc", content: [{ type: "codeBlock" }] },
          { type: "doc", content: [{ type: "hardBreak" }] },
          { type: "doc", content: [{ type: "heading", attrs: { level: 7 } }] },
          { type: "doc", content: [{ type: "heading" }] },
          {
            type: "doc",
            content: [{ type: "bulletList", content: [{ type: "paragraph" }] }],
          },
          { type: "doc", content: [{ type: "blockquote", content: [] }] },
          {
            type: "doc",
            content: [{ type: "orderedList", attrs: { start: -1 } }],
          },
          paragraph({ type: "text", text: 1 }),
          paragraph({ type: "text", text: "" }),
          paragraph({ type: "text", text: "nul\u0000" }),
          paragraph({ type: "text", text: "a", content: [] }),
          paragraph({ type: "paragraph" }),
          {
            type: "doc",
            content: [{ type: "paragraph", attrs: { onclick: "evil()" } }],
          },
          { type: "doc", attrs: { style: "unsafe" } },
          text([{ type: "underline" }]),
          text([{ type: "strike" }]),
          text([{ type: "code" }]),
          text([{ type: "bold", attrs: { style: "unsafe" } }]),
          text([{ type: "bold" }, { type: "bold" }]),
          text([
            {
              type: "link",
              attrs: { href: "https://example.test", onclick: "evil" },
            },
          ]),
          JSON.parse('{"type":"doc","constructor":{"bad":true}}'),
          JSON.parse(
            '{"type":"doc","content":[{"type":"paragraph","attrs":{"__proto__":{"onclick":"alert(1)"}}}]}',
          ),
        ];
        for (const href of [
          "javascript:alert(1)",
          "data:text/html,bad",
          "mailto:a@example.test",
          "ftp://example.test",
          "//example.test",
          "/relative",
          "https:/example.test",
          "https://user:password@example.test",
          " https://example.test",
          "https://exam\nple.test",
        ])
          invalid.push(text([{ type: "link", attrs: { href } }]));
        for (const description of invalid)
          for (const [path, method, body] of [
            ["todos", "POST", { title: "Invalid TipTap", description }],
            [`todos/${owned.id}`, "PATCH", { description }],
          ] as const)
            assert.equal(
              (await request(path, method, ownerJar, body)).status,
              400,
              JSON.stringify(description),
            );
      },
    );
    await t.test(
      "TipTap resource bounds reject deep, wide and oversized documents",
      async () => {
        let nested: unknown = { type: "paragraph" };
        for (let index = 0; index < 25; index++)
          nested = { type: "blockquote", content: [nested] };
        const invalid = [
          { type: "doc", content: [nested] },
          {
            type: "doc",
            content: Array.from({ length: 2001 }, () => ({
              type: "paragraph",
            })),
          },
          {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "آ".repeat(33000) }],
              },
            ],
          },
        ];
        for (const description of invalid)
          assert.equal(
            (
              await request("todos", "POST", ownerJar, {
                title: "Excessive",
                description,
              })
            ).status,
            400,
          );
        const extreme =
          '{"title":"Too deep","description":{"type":"doc","content":[' +
          '{"type":"blockquote","content":['.repeat(1500) +
          '{"type":"paragraph"}' +
          "]}".repeat(1500) +
          "]}}";
        assert.equal(
          (
            await request(
              "todos",
              "POST",
              ownerJar,
              extreme,
              config.origin,
              true,
            )
          ).status,
          400,
        );
        const cyclic: Record<string, unknown> = { type: "doc" };
        cyclic.content = [cyclic];
        assert.equal(validTipTap(cyclic), false);
      },
    );
    await t.test(
      "HTTP and HTTPS links are accepted and plain text is preserved as JSON",
      async () => {
        const description = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: '<script>alert("text")</script>',
                  marks: [
                    { type: "link", attrs: { href: "http://example.test" } },
                  ],
                },
              ],
            },
          ],
        };
        const task = await create(ownerJar, { description });
        assert.deepEqual(task.description, description);
      },
    );
    await t.test(
      "malformed JSON and oversized HTTP bodies return client errors",
      async () => {
        assert.equal(
          (
            await request(
              "todos",
              "POST",
              ownerJar,
              '{"title":',
              config.origin,
              true,
            )
          ).status,
          400,
        );
        assert.equal(
          (
            await request("todos", "POST", ownerJar, {
              title: "Oversized",
              description: "x".repeat(110000),
            })
          ).status,
          413,
        );
      },
    );
    await t.test(
      "missing tasks return 404 and malformed UUIDs return 400",
      async () => {
        for (const method of ["GET", "PATCH", "DELETE"]) {
          assert.equal(
            (
              await request(`todos/${randomUUID()}`, method, ownerJar, {
                title: "Update",
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request("todos/not-a-uuid", method, ownerJar, {
                title: "Update",
              })
            ).status,
            400,
          );
        }
      },
    );
    await t.test(
      "all task endpoints reject unauthenticated requests with 401 including mutations without Origin",
      async () => {
        for (const [path, method] of [
          ["todos", "GET"],
          ["todos", "POST"],
          [`todos/${owned.id}`, "GET"],
          [`todos/${owned.id}`, "PATCH"],
          [`todos/${owned.id}`, "DELETE"],
        ])
          assert.equal(
            (await request(path, method, undefined, {}, null)).status,
            401,
          );
      },
    );
    await t.test(
      "disabled users immediately lose access with existing access/refresh tokens",
      async () => {
        assert.equal(
          (
            await request(`users/${member.id}`, "PATCH", ownerJar, {
              isActive: false,
            })
          ).status,
          200,
        );
        try {
          for (const [path, method] of [
            ["todos", "GET"],
            ["todos", "POST"],
            [`todos/${owned.id}`, "GET"],
            [`todos/${owned.id}`, "PATCH"],
            [`todos/${owned.id}`, "DELETE"],
            ["auth/refresh", "POST"],
          ])
            assert.equal(
              (
                await request(
                  path,
                  method,
                  memberJar,
                  path === "auth/refresh" ? {} : { title: "Denied" },
                )
              ).status,
              401,
            );
        } finally {
          assert.equal(
            (
              await request(`users/${member.id}`, "PATCH", ownerJar, {
                isActive: true,
              })
            ).status,
            200,
          );
        }
      },
    );
    memberJar = await login(member.email);
    await t.test("stale role claims cannot bypass task ownership", async () => {
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
        (
          await request(
            `todos/${hidden.id}`,
            "PATCH",
            `${config.accessCookie}=${token}`,
            { title: "Denied" },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(`users/${manager.id}`, "PATCH", ownerJar, {
            role: UserRole.MEMBER,
          })
        ).status,
        200,
      );
      try {
        assert.equal(
          (await request(`todos/${hidden.id}`, "GET", managerJar)).status,
          403,
        );
      } finally {
        assert.equal(
          (
            await request(`users/${manager.id}`, "PATCH", ownerJar, {
              role: UserRole.MANAGER,
            })
          ).status,
          200,
        );
      }
    });
    await t.test("CSRF protects all task mutations", async () => {
      for (const origin of [null, "null", "https://evil.example"])
        for (const [path, method] of [
          ["todos", "POST"],
          [`todos/${owned.id}`, "PATCH"],
          [`todos/${owned.id}`, "DELETE"],
        ])
          assert.equal(
            (await request(path, method, ownerJar, { title: "Denied" }, origin))
              .status,
            403,
          );
    });
    await t.test(
      "concurrent ownership changes reauthorize MEMBER after the task row lock",
      async () => {
        const task = await create(ownerJar, { assigneeId: member.id });
        const runner = db.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        let pending: Promise<Response> | undefined;
        try {
          await runner.manager.findOneOrFail(Task, {
            where: { id: task.id },
            lock: { mode: "pessimistic_write" },
          });
          pending = request(`todos/${task.id}`, "PATCH", memberJar, {
            title: "Should be denied",
          });
          await waitForLock(
            "SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FOR UPDATE%' AND query LIKE '%tasks%'",
          );
          await runner.manager.update(Task, task.id, { assigneeId: other.id });
          await runner.commitTransaction();
          assert.equal((await pending).status, 403);
          assert.equal(
            (await db.getRepository(Task).findOneByOrFail({ id: task.id }))
              .title,
            prefix,
          );
        } finally {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
          if (pending) await pending;
        }
      },
    );
    await t.test(
      "task writes waiting on authorization mutex recheck disabled actor",
      async () => {
        const runner = db.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        let pending: Promise<Response> | undefined;
        try {
          await runner.query("SELECT pg_advisory_xact_lock(1791701867, 4)");
          pending = request(`todos/${owned.id}`, "PATCH", memberJar, {
            title: "Should be denied",
          });
          await waitForLock(
            "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=1791701867 AND objid=4 AND NOT granted",
          );
          await runner.manager.update(User, member.id, { isActive: false });
          await runner.commitTransaction();
          assert.equal((await pending).status, 401);
        } finally {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
          if (pending) await pending;
          await db.getRepository(User).update(member.id, { isActive: true });
        }
      },
    );
    await t.test(
      "concurrent partial updates preserve both changes and concurrent deletes return 204/404",
      async () => {
        const task = await create(memberJar);
        const responses = await Promise.all([
          request(`todos/${task.id}`, "PATCH", memberJar, {
            title: "Concurrent title",
          }),
          request(`todos/${task.id}`, "PATCH", ownerJar, {
            priority: TaskPriority.HIGH,
          }),
        ]);
        assert.deepEqual(
          responses.map((response) => response.status),
          [200, 200],
        );
        const stored = await db
          .getRepository(Task)
          .findOneByOrFail({ id: task.id });
        assert.equal(stored.title, "Concurrent title");
        assert.equal(stored.priority, TaskPriority.HIGH);
        const deletions = await Promise.all([
          request(`todos/${task.id}`, "DELETE", memberJar),
          request(`todos/${task.id}`, "DELETE", managerJar),
        ]);
        assert.deepEqual(
          deletions.map((response) => response.status).sort(),
          [204, 404],
        );
      },
    );
  } finally {
    if (taskIds.length)
      await db.getRepository(Task).delete({ id: In(taskIds) });
    // Include any successful fixture creation not tracked due to an assertion failure.
    if (users.length)
      await db
        .getRepository(Task)
        .delete({ creatorId: In(users.map((user) => user.id)) });
    if (sessions.length)
      await db.getRepository(RefreshSession).delete({ id: In(sessions) });
    if (users.length)
      await db
        .getRepository(User)
        .delete({ id: In(users.map((user) => user.id)) });
    if (app) await app.close();
    else await source.destroy();
  }
});

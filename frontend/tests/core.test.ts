import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, canDelete, safeLink, Task, User } from "../lib/api";
import { validTipTap } from "../lib/document";
import { createServer } from "node:http";
import { once } from "node:events";
import { dueDatePatch, localDueDate } from "../lib/due-date";

test("unchanged due dates preserve seconds, milliseconds and offsets in every timezone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "Asia/Tehran", "America/New_York"]) {
      process.env.TZ = zone;
      const task = { dueDate: "2026-10-20T16:04:56.789+03:30" };
      assert.deepEqual(dueDatePatch(localDueDate(task.dueDate), task), {});
      assert.deepEqual(dueDatePatch("", task), { dueDate: null });
      assert.equal(typeof dueDatePatch("2026-11-01T12:34", task).dueDate, "string");
      assert.deepEqual(dueDatePatch("", { dueDate: null }), {});
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});

test("API route forwards cookies, Origin, query and status with separate Set-Cookie headers", async () => {
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/api/v1/error/")) {
      const statusCode = Number(request.url.split("/").pop());
      response.writeHead(statusCode, { "content-type": "application/json" });
      response.end(JSON.stringify({ statusCode, error: "TEST_ERROR", message: "Safe message", details: [] }));
      return;
    }
    assert.equal(request.url, "/api/v1/auth/refresh?check=1");
    assert.equal(request.method, "POST");
    assert.equal(request.headers.cookie, "refresh=opaque");
    assert.equal(request.headers.origin, "http://localhost:3000");
    assert.equal(request.headers.authorization, undefined);
    response.setHeader("Set-Cookie", [
      "access=new; Path=/api/v1; HttpOnly",
      "refresh=rotated; Path=/api/v1/auth; HttpOnly",
    ]);
    response.writeHead(204);
    response.end();
  });
  const previous = process.env.BACKEND_URL;
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`;
    const { POST } = await import("../app/api/v1/[...path]/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/refresh?check=1", {
        method: "POST",
        headers: {
          cookie: "refresh=opaque",
          Origin: "http://localhost:3000",
          Authorization: "not-forwarded",
        },
        body: "{}",
      }),
      { params: Promise.resolve({ path: ["auth", "refresh"] }) },
    );
    assert.equal(response.status, 204);
    assert.equal(await response.text(), "");
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { GET } = await import("../app/api/v1/[...path]/route");
    for (const status of [400, 401, 403, 404, 500]) {
      const forwarded = await GET(new Request(`http://localhost/api/v1/error/${status}`), {
        params: Promise.resolve({ path: ["error", String(status)] }),
      });
      assert.equal(forwarded.status, status);
      assert.deepEqual(await forwarded.json(), { statusCode: status, error: "TEST_ERROR", message: "Safe message", details: [] });
    }
    const invalid = await GET(new Request("http://localhost/api/v1/bad"), { params: Promise.resolve({ path: ["bad.path"] }) });
    assert.deepEqual(await invalid.json(), { statusCode: 400, error: "BAD_REQUEST", message: "Bad Request", details: [] });
    const oversized = await POST(new Request("http://localhost/api/v1/todos", { method: "POST", body: "x".repeat(102401) }), {
      params: Promise.resolve({ path: ["todos"] }),
    });
    assert.equal(oversized.status, 413);
    const { default: config } = await import("../next.config");
    assert.equal(
      config.rewrites,
      undefined,
      "rewrites must not bypass the API route",
    );
  } finally {
    if (previous === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previous;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  const { GET } = await import("../app/api/v1/[...path]/route");
  const unavailable = await GET(new Request("http://localhost/api/v1/health"), {
    params: Promise.resolve({ path: ["health"] }),
  });
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { statusCode: 503, error: "SERVICE_UNAVAILABLE", message: "Service Unavailable", details: [] });
});
test("supported documents, safe links and resource limits", () => {
  assert.equal(
    validTipTap(
      JSON.parse(
        '{"type":"doc","content":[{"type":"paragraph","attrs":{"__proto__":{"onclick":"alert(1)"}}}]}',
      ),
    ),
    false,
  );
  assert.ok(validTipTap({ type: "doc", content: [] }));
  assert.ok(
    validTipTap({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "<script>متن فارسی</script>",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    }),
  );
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,x",
    "https://user:pass@example.com",
    "https://example.com/\n",
  ])
    assert.equal(safeLink(href), false);
  for (const type of ["image", "codeBlock", "hardBreak"])
    assert.equal(validTipTap({ type: "doc", content: [{ type }] }), false);
  assert.equal(
    validTipTap({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x".repeat(65536) }],
        },
      ],
    }),
    false,
  );
  assert.equal(
    validTipTap({
      type: "doc",
      content: Array.from({ length: 2001 }, () => ({ type: "paragraph" })),
    }),
    false,
  );
  let node: unknown = { type: "paragraph" };
  for (let i = 0; i < 21; i++) node = { type: "blockquote", content: [node] };
  assert.equal(validTipTap({ type: "doc", content: [node] }), false);
});
test("member deletion follows persisted creator, managers and owners retain management", () => {
  const task = { creatorId: "creator", assigneeId: "member" } as Task;
  assert.equal(
    canDelete({ id: "member", role: "MEMBER" } as User, task),
    false,
  );
  assert.equal(
    canDelete({ id: "creator", role: "MEMBER" } as User, task),
    true,
  );
  for (const role of ["OWNER", "MANAGER"] as const)
    assert.equal(canDelete({ id: "other", role } as User, task), true);
});
test("concurrent 401 requests share one cookie refresh and retry original requests", async () => {
  const original = globalThis.fetch;
  let refreshed = false,
    refreshes = 0;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    calls.push(path);
    assert.equal(init?.credentials, "same-origin");
    assert.ok(path.startsWith("/api/v1/"));
    if (path.endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      refreshed = true;
      return Response.json({ user: {} });
    }
    return refreshed
      ? Response.json({ ok: true })
      : new Response(null, { status: 401 });
  };
  try {
    const result = await Promise.all([api("/todos"), api("/auth/me")]);
    assert.equal(refreshes, 1);
    assert.deepEqual(result, [{ ok: true }, { ok: true }]);
    assert.equal(calls.length, 5);
  } finally {
    globalThis.fetch = original;
  }
});
test("login failure is not refreshed and errors remain Persian", async () => {
  const original = globalThis.fetch;
  let count = 0;
  globalThis.fetch = async () => {
    count++;
    return new Response(null, { status: 401 });
  };
  try {
    await assert.rejects(api("/auth/login", "POST", {}), ApiError);
    assert.equal(count, 1);
  } finally {
    globalThis.fetch = original;
  }
  for (const status of [400, 401, 403, 404, 409, 500])
    assert.match(new ApiError(status).message, /[\u0600-\u06ff]/);
});

test("refresh service failure preserves session and reports a retryable error", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new Response(null, {
      status: String(input).endsWith("/auth/refresh") ? 503 : 401,
    });
  try {
    await assert.rejects(
      api("/todos"),
      (e: unknown) => e instanceof ApiError && e.status === 503,
    );
  } finally {
    globalThis.fetch = original;
  }
});

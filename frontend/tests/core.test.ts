import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, canDelete, safeLink, Task, User } from "../lib/api";
import { validTipTap } from "../lib/document";
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

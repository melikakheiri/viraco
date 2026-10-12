import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
const accounts = ["OWNER", "MANAGER", "MEMBER"] as const;
test.beforeAll(() => {
  expect(process.env.TEST_DATABASE).toBe("true");
  expect(["localhost", "127.0.0.1", "::1"]).toContain(process.env.DATABASE_HOST);
  expect(process.env.DATABASE_PORT).not.toBe("5433");
  expect(process.env.DATABASE_NAME).toMatch(/^taskboard_test_[a-z0-9_]+$/);
  expect(process.env.PLAYWRIGHT_BASE_URL).toBe(process.env.APP_ORIGIN);
});
for (const role of accounts) {
  test(`${role}: real login, task CRUD, RTL and responsive layouts`, async ({
    page,
    context,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (e) => failures.push(e.message));
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page
      .getByLabel("ایمیل", { exact: true })
      .fill(process.env[`SEED_${role}_EMAIL`]!);
    await page
      .getByLabel("رمز عبور")
      .fill(process.env[`SEED_${role}_PASSWORD`]!);
    await page.getByRole("button", { name: "ورود به حساب" }).click();
    await expect(
      page.getByRole("heading", { name: "برد وظایف", exact: true }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const cookies = await context.cookies();
    expect(cookies.filter((c) => c.httpOnly).length).toBeGreaterThanOrEqual(2);
    expect(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
    ).toBe(0);
    if (role === "OWNER")
      await expect(
        page.getByRole("link", { name: "کاربران", exact: true }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("link", { name: "کاربران", exact: true }),
      ).toHaveCount(0);
    await expect(page.locator('.empty[role="status"]')).toHaveCount(0);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
    const title = `آزمون رابط ${role} ${Date.now()}`;
    await page.getByRole("button", { name: "＋ وظیفه جدید" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "＋ وظیفه جدید" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "＋ وظیفه جدید" }).click();
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const panel = page.locator(".dialog-panel");
      await expect(panel).toBeVisible();
      expect(
        await panel.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBeTruthy();
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      if (role === "OWNER") {
        await page.screenshot({
          path: `test-results/task-dialog-${width}.png`,
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.getByLabel("عنوان وظیفه").fill(title);
    await page
      .getByRole("textbox", { name: "توضیحات وظیفه" })
      .fill("توضیح فارسی برای آزمون");
    if (role === "OWNER") {
      await page
        .getByRole("textbox", { name: "توضیحات وظیفه" })
        .press("ControlOrMeta+A");
      await page.getByRole("button", { name: "پررنگ", exact: true }).click();
      await page.getByRole("button", { name: "مورب", exact: true }).click();
      await page
        .getByRole("textbox", { name: "نشانی پیوند" })
        .fill("https://example.com/task");
      await page
        .getByRole("button", { name: "درج پیوند", exact: true })
        .click();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page
      .getByRole("button", { name: "ذخیره وظیفه", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("توضیح فارسی برای آزمون", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "ویرایش", exact: true }).click();
    await page.getByLabel("عنوان وظیفه").fill(title + " ویرایش");
    await page
      .getByRole("button", { name: "ذخیره وظیفه", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title + " ویرایش", exact: true }),
    ).toBeVisible();
    // Removing the access cookie exercises real automatic refresh with the HttpOnly refresh cookie.
    const accessName = process.env.ACCESS_COOKIE_NAME!;
    await context.clearCookies({ name: accessName });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: title + " ویرایش", exact: true }),
    ).toBeVisible();
    expect(
      (await context.cookies()).some((c) => c.name === accessName),
    ).toBeTruthy();
    await page.getByRole("button", { name: "حذف", exact: true }).click();
    await page.getByRole("button", { name: "حذف وظیفه", exact: true }).click();
    await expect(page).toHaveURL(`${process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000"}/`);
    await expect(
      page.getByRole("link", { name: title + " ویرایش", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "خروج", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(failures).toEqual([]);
  });
}

import { createRequire } from "node:module";
test("OWNER: user creation, role/status changes, filters, pagination and failure preservation", async ({
  page,
}) => {
  // Fixture cleanup is restricted to this local development database and this test's generated user.
  expect(["localhost", "127.0.0.1", "::1"]).toContain(
    process.env.DATABASE_HOST,
  );
  expect(process.env.TEST_DATABASE).toBe("true");
  expect(process.env.DATABASE_PORT).not.toBe("5433");
  expect(process.env.DATABASE_NAME).toMatch(/^taskboard_test_[a-z0-9_]+$/);
  const email = `phase6-${Date.now()}@example.test`,
    ids: string[] = [];
  let userId: string | undefined;
  await page.goto("/login");
  await page
    .getByLabel("ایمیل", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL!);
  await page.getByLabel("رمز عبور").fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "ورود به حساب" }).click();
  await expect(
    page.getByRole("heading", { name: "برد وظایف", exact: true }),
  ).toBeVisible();
  try {
    await page.getByRole("link", { name: "کاربران", exact: true }).click();
    await page.getByRole("button", { name: "＋ کاربر جدید" }).click();
    await page.getByLabel("ایمیل", { exact: true }).fill(email);
    await page.getByLabel("رمز عبور").fill("Phase6-test-password-123!");
    const created = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/users") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    const response = await created;
    expect(response.status()).toBe(201);
    userId = (await response.json()).id;
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.locator("article").filter({ hasText: email });
    await expect(row).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByRole("button", { name: "＋ کاربر جدید" }).click();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.getByLabel("ایمیل", { exact: true }).fill(email);
    await page.getByLabel("رمز عبور").fill("Phase6-test-password-123!");
    await page
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "تکراری",
    );
    await expect(page.getByLabel("ایمیل", { exact: true })).toHaveValue(email);
    await page.getByRole("button", { name: "انصراف", exact: true }).click();
    await row.getByRole("button", { name: "ویرایش دسترسی" }).click();
    await page.getByRole("button", { name: "نقش", exact: true }).click();
    await page.getByRole("option", { name: "مدیر", exact: true }).click();
    await page
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(row.getByText("مدیر", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "ویرایش دسترسی" }).click();
    await page.getByLabel("حساب فعال باشد").uncheck();
    await page
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(row.getByText("غیرفعال", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "ویرایش دسترسی" }).click();
    await page.getByLabel("حساب فعال باشد").check();
    await page
      .getByRole("button", { name: "ذخیره کاربر", exact: true })
      .click();
    await expect(row.getByText("فعال", { exact: true })).toBeVisible();
    for (let i = 0; i < 13; i++) {
      const response = await page.request.post("/api/v1/todos", {
        headers: { Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000" },
        data: {
          title: `صفحه‌بندی ${email} ${i}`,
          assigneeId: userId,
          status: "in_progress",
        },
      });
      expect(response.status()).toBe(201);
      ids.push((await response.json()).id);
    }
    await page.getByRole("link", { name: "وظایف", exact: true }).click();
    await page.getByRole("button", { name: "مسئول", exact: true }).click();
    await page.getByRole("option", { name: email, exact: true }).click();
    await page.getByRole("button", { name: "وضعیت", exact: true }).click();
    await page
      .getByRole("option", { name: "در حال انجام", exact: true })
      .click();
    await expect(page.locator(".task-card")).toHaveCount(12);
    await page.getByRole("button", { name: "صفحه بعد" }).click();
    await expect(page.locator(".task-card")).toHaveCount(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/board-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/board-desktop.png",
      fullPage: true,
    });
  } finally {
    for (const id of ids)
      expect(
        (
          await page.request.delete("/api/v1/todos/" + id, {
            headers: { Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000" },
          })
        ).status(),
      ).toBe(204);
    if (userId) {
      const { Client } = createRequire(
        path.resolve(process.cwd(), "package.json"),
      )("pg") as {
        Client: new (options: Record<string, unknown>) => {
          connect: () => Promise<void>;
          query: (sql: string, params: string[]) => Promise<unknown>;
          end: () => Promise<void>;
        };
      };
      const client = new Client({
        host: process.env.DATABASE_HOST,
        port: Number(process.env.DATABASE_PORT),
        database: process.env.DATABASE_NAME,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
      });
      await client.connect();
      try {
        await client.query("DELETE FROM users WHERE id=$1 AND email=$2", [
          userId,
          email,
        ]);
      } finally {
        await client.end();
      }
    }
  }
});

test("MEMBER: assigned task can be edited, cannot be deleted or assigned to another user", async ({
  page,
  request,
}) => {
  const headers = { Origin: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000" };
  expect(
    (
      await request.post("/api/v1/auth/login", {
        headers,
        data: {
          email: process.env.SEED_OWNER_EMAIL,
          password: process.env.SEED_OWNER_PASSWORD,
        },
      })
    ).ok(),
  ).toBeTruthy();
  const users = await (await request.get("/api/v1/users")).json();
  const member = users.find(
    (u: { email: string }) => u.email === process.env.SEED_MEMBER_EMAIL,
  );
  const response = await request.post("/api/v1/todos", {
    headers,
    data: { title: "وظیفه واگذارشده برای آزمون نقش", assigneeId: member.id, dueDate: "2026-10-20T16:04:56.789+03:30" },
  });
  expect(response.status()).toBe(201);
  const task = await response.json();
  try {
    await page.goto("/login");
    await page
      .getByLabel("ایمیل", { exact: true })
      .fill(process.env.SEED_MEMBER_EMAIL!);
    await page.getByLabel("رمز عبور").fill(process.env.SEED_MEMBER_PASSWORD!);
    await page.getByRole("button", { name: "ورود به حساب" }).click();
    await expect(
      page.getByRole("heading", { name: "برد وظایف", exact: true }),
    ).toBeVisible();
    await page.goto("/tasks/" + task.id);
    await expect(
      page.getByRole("heading", { name: task.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "حذف", exact: true }),
    ).toHaveCount(0);
    // Exercise server RBAC through the proxy, independently of hidden UI controls.
    expect(
      (
        await page.request.delete("/api/v1/todos/" + task.id, { headers })
      ).status(),
    ).toBe(403);
    const owner = users.find((u: { role: string }) => u.role === "OWNER");
    expect(
      (
        await page.request.patch("/api/v1/todos/" + task.id, {
          headers,
          data: { assigneeId: owner.id },
        })
      ).status(),
    ).toBe(403);
    await page.getByRole("button", { name: "ویرایش", exact: true }).click();
    await page.getByRole("button", { name: "مسئول", exact: true }).click();
    await expect(page.getByRole("option")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await page.getByLabel("عنوان وظیفه").fill(task.title + " ویرایش عضو");
    await page
      .getByRole("button", { name: "ذخیره وظیفه", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: task.title + " ویرایش عضو",
        exact: true,
      }),
    ).toBeVisible();
    const persisted = await (await page.request.get("/api/v1/todos/" + task.id)).json();
    expect(persisted.dueDate).toBe("2026-10-20T12:34:56.789Z");
    await page.goto("/users");
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "اجازه دسترسی",
    );
  } finally {
    expect(
      (await request.delete("/api/v1/todos/" + task.id, { headers })).status(),
    ).toBe(204);
    expect(
      (
        await request.post("/api/v1/auth/logout", { headers, data: {} })
      ).status(),
    ).toBe(204);
    expect((await request.get("/api/v1/auth/me")).status()).toBe(401);
  }
});

test("login: local Persian font, keyboard focus, accessibility and responsive layout", async ({
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      [...document.fonts].some(
        (font) =>
          font.family.toLowerCase().includes("vazirmatn") &&
          font.status === "loaded",
      ),
    ),
  ).toBeTruthy();
  expect(
    await page
      .locator("body")
      .evaluate((el) => getComputedStyle(el).fontFamily),
  ).toContain("vazirmatn");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      page.getByRole("button", { name: "ورود به حساب" }),
    ).toBeInViewport();
    await page.screenshot({
      path: "test-results/login-" + width + ".png",
      fullPage: true,
    });
  }
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("ایمیل", { exact: true })).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

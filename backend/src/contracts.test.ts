import "reflect-metadata";
import { test } from "node:test";
import * as assert from "node:assert/strict";
import { Body, Controller, Get, Post, UnauthorizedException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { configureApp } from "./configure-app";
import { LoginDto, EmptyDto } from "./auth/auth.dto";
import { CreateUserDto, UpdateUserDto } from "./users/users.dto";
import { CreateTaskDto, UpdateTaskDto } from "./tasks/tasks.dto";
import source from "./database/data-source";
import { assertTestDatabase } from "./database/local-guard";

void test("destructive tests fail closed for development and unmarked targets", () => {
  const previous = process.env.TEST_DATABASE;
  const options = source.options as { host?: string; port?: number; database?: string };
  const saved = { ...options };
  try {
    delete process.env.TEST_DATABASE;
    assert.throws(assertTestDatabase);
    process.env.TEST_DATABASE = "true";
    options.host = "localhost"; options.port = 5433; options.database = "taskboard";
    assert.throws(assertTestDatabase);
    options.port = 15434; options.database = "taskboard_test_fixture";
    assert.doesNotThrow(assertTestDatabase);
    options.host = "remote.example.com";
    assert.throws(assertTestDatabase);
  } finally {
    Object.assign(options, saved);
    if (previous === undefined) delete process.env.TEST_DATABASE; else process.env.TEST_DATABASE = previous;
  }
});

@Controller()
class ContractController {
  @Post("login") login(@Body() body: LoginDto) { return body; }
  @Post("empty") empty(@Body() body: EmptyDto) { return body; }
  @Post("users") users(@Body() body: CreateUserDto) { return body; }
  @Post("update-user") user(@Body() body: UpdateUserDto) { return body; }
  @Post("tasks") tasks(@Body() body: CreateTaskDto) { return body; }
  @Post("update-task") task(@Body() body: UpdateTaskDto) { return body; }
  @Get("401") unauthorized() { throw new UnauthorizedException(); }
  @Get("403") forbidden() { throw new ForbiddenException(); }
  @Get("404") missing() { throw new NotFoundException(); }
  @Get("500") internal() { throw new Error("sensitive SQL/password/stack"); }
}

void test("raw fields, nested documents and safe HTTP error contract", async () => {
  const module = await Test.createTestingModule({ controllers: [ContractController] }).compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  const send = (path: string, body: unknown) => fetch(`${base}/api/v1/${path}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    for (const [path, payload] of Object.entries({
      login: { email: "valid@example.com", password: "password" },
      empty: {}, users: { email: "valid@example.com", password: "long-password-123", role: "MEMBER" },
      "update-user": { isActive: true }, tasks: { title: "task" }, "update-task": { title: "updated" },
    })) {
      assert.equal((await send(path, payload)).status, 201, path);
      for (const key of ["unexpected", "__proto__", "constructor"] ) {
        const body = JSON.parse(JSON.stringify(payload).slice(0, -1) + `,"${key}":true}`.replace(/^,/, Object.keys(payload).length ? "," : ""));
        const response = await send(path, body);
        assert.equal(response.status, 400, `${path}/${key}`);
        const error = await response.json();
        assert.equal(error.statusCode, 400);
        assert.equal(typeof error.message, "string");
        assert.ok(Array.isArray(error.details));
      }
    }
    assert.equal((await send("tasks", { title: "nested", description: { type: "doc", unexpected: true } })).status, 400);
    assert.equal((await send("login", { email: {}, password: "x" })).status, 400);
    for (const status of [401, 403, 404, 500]) {
      const response = await fetch(`${base}/api/v1/${status}`);
      const body = await response.json();
      assert.equal(response.status, status);
      assert.deepEqual(Object.keys(body).sort(), ["details", "error", "message", "statusCode"]);
      assert.equal(body.statusCode, status);
      assert.equal(typeof body.message, "string");
      assert.ok(Array.isArray(body.details));
      assert.doesNotMatch(JSON.stringify(body), /sensitive|SQL|password|stack/);
    }
  } finally { await app.close(); }
});

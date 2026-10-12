import { InitialTaskBoard1791701867468 } from './migrations/1791701867468-InitialTaskBoard';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { compare } from 'bcryptjs';
import source from './data-source';
import { assertTestDatabase } from './local-guard';
import { seedUsers, seedAccounts } from './seed';
import { User, UserRole } from './entities/user.entity';
import { Task } from './entities/task.entity';
import { RefreshSession } from './entities/refresh-session.entity';

void test('Phase 2 PostgreSQL integration', async t => {
  assertTestDatabase();
  await source.initialize();
  try {
    await t.test('migration is recorded, rerun is empty, metadata matches schema', async () => {
      assert.equal(await source.showMigrations(), false);
      assert.deepEqual(await source.runMigrations(), []);
      const rows: unknown[] = await source.query('SELECT name FROM migrations WHERE name = $1', ['InitialTaskBoard1791701867468']);
      assert.equal(rows.length, 1);
      assert.equal((await source.driver.createSchemaBuilder().log()).upQueries.length, 0);
    });
    await t.test('initial migration creates a fresh schema transactionally', async () => {
      const fresh = source.createQueryRunner();
      await fresh.connect();
      await fresh.startTransaction();
      const schema = 'phase2_test_' + randomUUID().replaceAll('-', '');
      const originalQuery = fresh.query.bind(fresh);
      try {
        await originalQuery('CREATE SCHEMA "' + schema + '"');
        await originalQuery('SET LOCAL search_path TO "' + schema + '", public');
        fresh.query = ((sql: string, parameters?: unknown[]) => originalQuery(sql.replaceAll('"public".', '"' + schema + '".'), parameters)) as typeof fresh.query;
        await new InitialTaskBoard1791701867468().up(fresh);
        const tables: unknown[] = await originalQuery('SELECT table_name FROM information_schema.tables WHERE table_schema = $1', [schema]);
        assert.equal(tables.length, 3);
        const indexes: unknown[] = await originalQuery('SELECT indexname FROM pg_indexes WHERE schemaname = $1', [schema]);
        assert.equal(indexes.length, 9);
      } finally { fresh.query = originalQuery; await fresh.rollbackTransaction(); await fresh.release(); }
    });
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    const manager = runner.manager;
    const accounts = Object.values(UserRole).map(role => ({role, email: `${role.toLowerCase()}-${randomUUID()}@example.test`, password: 'Integration-only-password-123!'}));
    try {
      await t.test('seed hashes passwords, is idempotent and preserves changed roles/passwords/status', async () => {
        assert.ok((await seedUsers(manager, accounts)).every(result => result.created));
        const before = await manager.find(User, { select: { id: true, email: true, passwordHash: true, role: true, isActive: true } });
        const owner = before.find(user => user.email === accounts[0].email)!;
        assert.notEqual(owner.passwordHash, accounts[0].password);
        assert.ok(await compare(accounts[0].password, owner.passwordHash));
        assert.equal(await compare('wrong-password', owner.passwordHash), false);
        await manager.update(User, owner.id, { role: UserRole.MEMBER, isActive: false });
        assert.ok((await seedUsers(manager, accounts.map(a => ({...a, password: 'Another-password-123!'})))).every(result => !result.created));
        const after = await manager.findOneOrFail(User, { where: { id: owner.id }, select: { id: true, passwordHash: true, role: true, isActive: true } });
        assert.equal(after.passwordHash, owner.passwordHash);
        assert.equal(after.role, UserRole.MEMBER);
        assert.equal(after.isActive, false);
        assert.equal(await manager.countBy(User, {email: accounts[0].email}), 1);
      });
      const creator = await manager.findOneByOrFail(User, { email: accounts[0].email });
      const assignee = await manager.findOneByOrFail(User, { email: accounts[1].email });
      await t.test('relationships, jsonb, secret exclusion and delete policies', async () => {
        const task = await manager.save(Task, manager.create(Task, { title: 'Integration task', creatorId: creator.id, assigneeId: assignee.id, description: {type:'doc',content:[{type:'paragraph'}]} }));
        const session = await manager.save(RefreshSession, manager.create(RefreshSession, { userId: assignee.id, refreshTokenHash: 'test-hash', expiresAt: new Date(Date.now()+3600000) }));
        const loaded = await manager.findOneOrFail(Task, {where:{id:task.id},relations:{creator:true,assignee:true}});
        assert.equal(loaded.creator.id, creator.id);
        assert.equal(loaded.assignee?.id, assignee.id);
        assert.deepEqual(loaded.description, {type:'doc',content:[{type:'paragraph'}]});
        assert.equal(loaded.creator.passwordHash, undefined);
        assert.equal((await manager.findOneByOrFail(RefreshSession,{id:session.id})).refreshTokenHash, undefined);
        const user = await manager.findOneOrFail(User,{where:{id:assignee.id},relations:{assignedTasks:true,refreshSessions:true}});
        assert.equal(user.assignedTasks.length,1); assert.equal(user.refreshSessions.length,1);
        await manager.delete(User, assignee.id);
        assert.equal((await manager.findOneByOrFail(Task,{id:task.id})).assigneeId,null);
        assert.equal(await manager.countBy(RefreshSession,{id:session.id}),0);
      });
      async function rejects(sql: string, params: unknown[], code: string) {
        await runner.query('SAVEPOINT constraint_test');
        try { await assert.rejects(runner.query(sql,params), (error: {code?:string}) => error.code === code); }
        finally { await runner.query('ROLLBACK TO SAVEPOINT constraint_test'); await runner.query('RELEASE SAVEPOINT constraint_test'); }
      }
      await t.test('unique email, valid roles/status/priority, foreign keys and checks', async () => {
        await rejects('INSERT INTO users(email,password_hash,role) VALUES($1,$2,$3)', [creator.email,'hash','OWNER'],'23505');
        await rejects('UPDATE users SET role=$1 WHERE id=$2',['ADMIN',creator.id],'22P02');
        await rejects('UPDATE tasks SET status=$1 WHERE creator_id=$2',['invalid',creator.id],'22P02');
        await rejects('UPDATE tasks SET priority=$1 WHERE creator_id=$2',['urgent',creator.id],'22P02');
        await rejects('DELETE FROM users WHERE id=$1',[creator.id],'23503');
        await rejects('UPDATE tasks SET creator_id=$1 WHERE creator_id=$2',[randomUUID(),creator.id],'23503');
        await rejects('UPDATE tasks SET title=$1 WHERE creator_id=$2',[' ',creator.id],'23514');
        await rejects('UPDATE tasks SET description=$1::jsonb WHERE creator_id=$2',['{}',creator.id],'23514');
        await rejects('UPDATE users SET email=$1 WHERE id=$2',['UPPER@example.test',creator.id],'23514');
        await rejects('INSERT INTO refresh_sessions(user_id,refresh_token_hash,expires_at) VALUES($1,$2,now()-interval \'1 day\')',[creator.id,'hash'],'23514');
      });
      await t.test('seed rejects production and missing credentials', () => {
        assert.throws(() => seedAccounts({NODE_ENV:'production'}));
        assert.throws(() => seedAccounts({}));
      });
    } finally { await runner.rollbackTransaction(); await runner.release(); }
  } finally { await source.destroy(); }
});

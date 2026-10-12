// No development credentials or database are used by this runner.
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const id = randomBytes(5).toString('hex');
const container = `viraco-test-${id}`;
const secret = () => randomBytes(36).toString('base64url');
const env = { ...process.env, NODE_ENV: 'development', TEST_DATABASE: 'true',
  DATABASE_HOST: '127.0.0.1', DATABASE_PORT: '15434', DATABASE_NAME: `taskboard_test_${id}`,
  DATABASE_USER: 'taskboard', DATABASE_PASSWORD: secret(),
  JWT_ACCESS_SECRET: secret(), JWT_ISSUER: 'test-backend', JWT_AUDIENCE: 'test-browser',
  JWT_ACCESS_TTL_SECONDS: '300', REFRESH_TTL_SECONDS: '604800',
  APP_ORIGIN: 'http://localhost:3400', PLAYWRIGHT_BASE_URL: 'http://localhost:3400',
  BACKEND_URL: 'http://127.0.0.1:3401', PORT: '3401', COOKIE_SECURE: 'false',
  COOKIE_SAME_SITE: 'lax', ACCESS_COOKIE_NAME: 'tb_access', REFRESH_COOKIE_NAME: 'tb_refresh',
  PLAYWRIGHT_CHANNEL: 'msedge',
};
delete env.TEST_BASE_URL;
for (const role of ['OWNER', 'MANAGER', 'MEMBER']) {
  env[`SEED_${role}_EMAIL`] = `${role.toLowerCase()}@test.local`;
  env[`SEED_${role}_PASSWORD`] = secret();
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.status}`);
}
const npm = (...args) => run('npm', args, { shell: process.platform === 'win32' });
const children = [];
async function ready(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await delay(500);
  }
  throw new Error(`Service unavailable: ${url}`);
}
(async () => {
  try {
    run('docker', ['run', '-d', '--name', container, '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB',
      '-e', 'POSTGRES_USER', '-p', '127.0.0.1:15434:5432', '--tmpfs', '/var/lib/postgresql/data', 'postgres:16-alpine'],
      { env: { ...env, POSTGRES_PASSWORD: env.DATABASE_PASSWORD, POSTGRES_DB: env.DATABASE_NAME, POSTGRES_USER: env.DATABASE_USER } });
    let healthy = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'taskboard'], { stdio: 'ignore' }).status === 0) { healthy = true; break; }
      await delay(500);
    }
    if (!healthy) throw new Error('Disposable PostgreSQL unavailable');
    npm('run', 'migration:run'); npm('run', 'seed'); npm('run', 'seed');
    if (!process.argv.includes('--e2e-only')) {
      npm('test', '--workspace', 'backend');
      npm('test', '--workspace', 'frontend'); npm('run', 'test:configuration');
      npm('run', 'lint');
      env.NODE_ENV = 'production';
      npm('run', 'build');
      env.NODE_ENV = 'development';
      npm('run', 'typecheck', '--workspace', 'backend'); npm('run', 'typecheck', '--workspace', 'frontend');
    }
    npm('run', 'migration:show'); run('docker', ['compose', 'config', '--quiet']);
    children.push(spawn(process.execPath, ['backend/dist/main.js'], { cwd: root, env, stdio: 'inherit' }));
    children.push(spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', 'frontend', '-p', '3400'], {
      cwd: root, env: { ...env, NODE_ENV: 'production' }, stdio: 'inherit',
    }));
    await ready('http://127.0.0.1:3401/api/v1/health'); await ready('http://localhost:3400/login');
    npm('run', 'test:e2e', '--workspace', 'frontend');
  } finally {
    for (const child of children) child.kill();
    run('docker', ['rm', '-f', container]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

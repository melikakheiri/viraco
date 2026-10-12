const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

test('Compose rejects missing and empty database passwords without a default', () => {
  const compose = readFileSync('docker-compose.yml', 'utf8');
  assert.match(compose, /POSTGRES_PASSWORD: \$\{POSTGRES_PASSWORD:\?[^}]+\}/);
  assert.match(compose, /127\.0\.0\.1:5433:5432/);
  for (const password of [undefined, '']) {
    const env = { ...process.env };
    delete env.POSTGRES_PASSWORD;
    if (password !== undefined) env.POSTGRES_PASSWORD = password;
    const result = spawnSync('docker', ['compose', '--env-file', 'frontend/.env.example', 'config', '--quiet'], { env, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /POSTGRES_PASSWORD/);
  }
});

test('environment templates require developers to supply passwords', () => {
  const template = readFileSync('backend/.env.example', 'utf8');
  for (const name of ['DATABASE_PASSWORD', 'SEED_OWNER_PASSWORD', 'SEED_MANAGER_PASSWORD', 'SEED_MEMBER_PASSWORD']) {
    assert.match(template, new RegExp(`^${name}=REPLACE_WITH_YOUR_[A-Z_]+$`, 'm'));
  }
});

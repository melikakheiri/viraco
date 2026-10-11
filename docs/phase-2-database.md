# Phase 2 database

Run commands from the repository root (npm workspaces forward to backend):

```powershell
npm run migration:show
npm run migration:run
npm run seed
npm run test:database
npm run typecheck --workspace backend
npm run lint --workspace backend
npm run build --workspace backend
```

## Configuration and safety

Copy backend/.env.example to backend/.env only when no local file exists. Existing DATABASE_* values are required; the CLI no longer silently supplies database credentials. Migration and seed execution are restricted to taskboard on localhost/127.0.0.1/::1 port 5433. The migration CLI prints existing public tables before applying pending migrations in a transaction. synchronize remains false; the server does not run migrations automatically. Paths resolve relative to the data source, including compiled dist usage. The initial migration explicitly installs uuid-ossp if absent. Extension removal is deliberately excluded from rollback because it may be shared.

The initial up migration only creates schema objects and does not drop existing data. A conflicting existing object causes failure rather than replacement. The down migration is destructive and must never be run against retained application data without separate review. It was not executed on the application database.

## Model decisions

- User: UUID, normalized lowercase/trimmed unique email (254 characters), hidden password hash, required OWNER/MANAGER/MEMBER PostgreSQL enum, is_active boolean default true. Disable users rather than delete creators.
- Task: nonblank title up to 255 characters, status todo/in_progress/done (default todo), priority low/medium/high (default medium). Creator is required with RESTRICT deletion; assignee is optional with SET NULL deletion. Due date is optional timestamptz (an instant, not a date-only field). Indexes support creator, assignee/status, status/due queries.
- Description: jsonb, default empty TipTap doc. SQL validates a doc object and optional content array. Full recursive TipTap schema validation and safe rendering belong to future task input/rendering work; no task endpoint exists yet.
- Refresh session: required user with CASCADE deletion, hidden hash only, expiry after creation, optional revoked_at and reason (up to 255 characters). A reason requires a revocation timestamp; revocation cannot precede creation. User and expiry indexes support lookup/cleanup. No raw token field or authentication endpoints exist.
- Timestamps use timestamptz. TypeORM manages updated_at for ORM writes; direct SQL writers must update it themselves.
- Hash fields use select:false to reduce accidental disclosure; explicitly selected hashes still require careful handling.

## Development seed

backend/.env.example documents three development-only accounts:

| Role | Email | Development password |
| --- | --- | --- |
| OWNER | owner@taskboard.local | REPLACE_WITH_YOUR_OWNER_PASSWORD |
| MANAGER | manager@taskboard.local | REPLACE_WITH_YOUR_MANAGER_PASSWORD |
| MEMBER | member@taskboard.local | REPLACE_WITH_YOUR_MEMBER_PASSWORD |

Override SEED_OWNER_EMAIL/PASSWORD, SEED_MANAGER_EMAIL/PASSWORD, and SEED_MEMBER_EMAIL/PASSWORD in the environment. All are required; passwords must have at least 12 characters and at most 72 UTF-8 bytes (bcrypt limit). NODE_ENV=production rejects this seed. No public registration is added.

Passwords are bcrypt hashes with cost 12 and random salt. Seed inserts all accounts transactionally, skips existing emails without changing password/role/active state, and handles concurrent email conflicts with ON CONFLICT(email) DO NOTHING. If an existing account has a different role or is disabled, seed deliberately preserves it; the result displays its actual role. Change such accounts explicitly rather than expecting seed to repair them.

## Verification

Before migration, local taskboard had no user tables. InitialTaskBoard1791701867468 applied successfully. A subsequent run had no pending migrations. Seed run one created three active accounts; run two created zero accounts.

Integration tests use the configured local database only. Behavior fixtures run inside a rolled-back transaction with savepoints for rejected statements. Fresh migration DDL runs in a unique temporary schema inside another rolled-back transaction; no application tables are removed. Tests cover migration recording/rerun and metadata parity, fresh migration execution, seed preservation/idempotency, bcrypt verification, relationships/deletion policies, secret exclusion, unique emails, role/status/priority enums, foreign keys and validation constraints. TypeORM's schema introspection currently emits a pg client query deprecation warning; it does not affect test results.

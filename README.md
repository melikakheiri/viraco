# Task Board

A hiring-assignment monorepo with a Persian RTL interface, cookie authentication, three roles, rich task descriptions, assignment, filtering and pagination. Browser requests use relative `/api/v1/*` paths; NestJS owns validation and business logic.

## Stack and repository

- `frontend/`: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Headless UI, TipTap 2; login, board, task detail and user management pages.
- `backend/`: NestJS 11, TypeORM, PostgreSQL entities, migration, seed and HTTP integration tests.
- `docker-compose.yml`: PostgreSQL 16, health check and persistent named volume. Apps run on the host; no app container builds are supplied.
- `docs/`: [architecture](docs/architecture.md), [API](docs/api.md), [AI workflow](docs/ai-workflow.md), [limitations](docs/known-limitations.md), [Persian demo](docs/demo-script-fa.md), [verification](docs/delivery-readiness.md) and historical phase notes.

## Permissions

| Operation | OWNER | MANAGER | MEMBER |
| --- | --- | --- | --- |
| List/create users, change role/active status | Yes | No | No |
| List active assignees (ID/email) | Yes | Yes | No |
| View/update tasks | All | All | Created by or assigned to self |
| Create tasks | Yes | Yes | Yes |
| Assign active users | Any | Any | Self/null; may preserve existing assignment |
| Delete tasks | All | All | Only created by self |

Last active OWNER cannot be disabled/demoted. There is no public registration.

## Prerequisites and installation

Node.js 20+ (final checks used 22.19.0), npm with workspaces, Docker Engine/Desktop and Compose v2. Ports 3000, 3001 and 5433 must be available. Run from repository root, on a fresh checkout:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated randomness into `JWT_ACCESS_SECRET` in `backend/.env`: the example placeholder is deliberately rejected. Do not overwrite existing local env files. POSIX shells can use `cp` instead of `Copy-Item`. Create an ignored root `.env` containing `POSTGRES_PASSWORD=<your-own-database-password>` (replace the placeholder). Set `DATABASE_PASSWORD` in `backend/.env` to the same value. Compose requires a nonempty password with no default. For an existing volume, use its existing password in both files; do not change the user password or overwrite `backend/.env`. Local env files are ignored by Git.

```sh
docker compose config --quiet
npm run db:up
docker compose ps
# Wait for postgres to report healthy:
npm run migration:run
npm run migration:show
npm run seed
npm run dev
```

Open `http://localhost:3000`; backend binds to `127.0.0.1:3001`. Host PostgreSQL port is **5433**, mapped to Docker's internal **5432**. Compose uses `taskboard` for the database and user; the password comes only from your ignored root `.env`. The named volume survives restarts. `npm run db:down` stops Compose without deleting it; never use `down -v` when retaining data.

Migration/seed CLIs intentionally allow only local taskboard on port 5433. They are not production deployment tools. TypeORM synchronize is false; server startup never applies migrations. Seed creates missing accounts, preserves existing passwords/roles/status, and rejects production mode.

## Environment

| Variable | Location / meaning / example |
| --- | --- |
| PORT | backend, 3001 |
| DATABASE_HOST / DATABASE_PORT | backend, localhost / 5433 for host processes |
| DATABASE_NAME / DATABASE_USER | backend, taskboard for local Compose |
| DATABASE_PASSWORD | backend, your own password matching root POSTGRES_PASSWORD |
| POSTGRES_PASSWORD | root .env, required Compose password; no default |
| SEED_OWNER_EMAIL / SEED_MANAGER_EMAIL / SEED_MEMBER_EMAIL | backend, development accounts below |
| SEED_OWNER_PASSWORD / SEED_MANAGER_PASSWORD / SEED_MEMBER_PASSWORD | backend, your own local passwords; 12+ characters and at most 72 UTF-8 bytes |
| JWT_ACCESS_SECRET | backend, unique generated secret of at least 32 bytes; never commit |
| JWT_ISSUER / JWT_AUDIENCE | backend, taskboard-backend / taskboard-browser |
| JWT_ACCESS_TTL_SECONDS | backend, 300; allowed 30–900 |
| REFRESH_TTL_SECONDS | backend, 604800; allowed 3600–2592000 |
| APP_ORIGIN | backend, exact http://localhost:3000; no trailing slash |
| COOKIE_SECURE / COOKIE_SAME_SITE | backend, false / lax locally; SameSite allows lax or strict |
| ACCESS_COOKIE_NAME / REFRESH_COOKIE_NAME | backend, tb_access / tb_refresh; distinct alphanumeric/underscore names |
| BACKEND_URL | frontend, server-only http://localhost:3001; no NEXT_PUBLIC API URL |

Compose requires `${POSTGRES_PASSWORD:?...}` environment substitution. Changing backend env does not change container credentials or an initialized volume. Production needs securely generated secrets, new database credentials, NODE_ENV=production, COOKIE_SECURE=true and HTTPS APP_ORIGIN. Provision the initial production OWNER separately; development seed is not supported there. Deployment networking, TLS and production migrations require additional work.

## Sample seeded credentials

Configure your own unique passwords in the ignored backend/.env before seeding a fresh database. The following values are placeholders:

| Role | Email | Password |
| --- | --- | --- |
| OWNER | owner@taskboard.local | REPLACE_WITH_YOUR_OWNER_PASSWORD |
| MANAGER | manager@taskboard.local | REPLACE_WITH_YOUR_MANAGER_PASSWORD |
| MEMBER | member@taskboard.local | REPLACE_WITH_YOUR_MEMBER_PASSWORD |

## Running and production builds

`npm run dev` starts both watchers. Separately use `npm run dev --workspace frontend` and `npm run start:dev --workspace backend`.

```sh
npm run build
npm run start --workspace frontend
# Another terminal, with backend environment available:
node backend/dist/main.js
```

Root build runs frontend then backend; individual `npm run build --workspace frontend` / `backend` commands also exist. Backend `start` invokes Nest CLI; compiled startup above avoids rebuilding. Build success is not production deployment verification. Configure HTTPS and production env before production startup.

## Tests and checks

```sh
npm run test:configuration
npm test --workspace backend
npm test --workspace frontend
npm run typecheck --workspace backend
npm run typecheck --workspace frontend
npm run lint
npm run build
npm run migration:show
docker compose config --quiet
npm audit
npm audit --omit=dev
```

There is no root test/typecheck script. Backend tests need the migrated local PostgreSQL and backend env; fixtures use rollback or targeted cleanup, not database reset. Coverage includes migration/seed, authentication, CSRF, RBAC, last OWNER, concurrency and tasks. Frontend tests cover document validation, permissions and refresh coordination.

For browser tests, run both apps and keep seeded roles/passwords unchanged, then:

```sh
npx playwright install chromium
npm run test:e2e --workspace frontend
```

Alternatively set PLAYWRIGHT_CHANNEL=chrome to use installed Chrome (PowerShell: `$env:PLAYWRIGHT_CHANNEL='chrome'`). Tests cover role flows, CRUD, filters, pagination, focus, mobile/desktop overflow and automated axe checks. Reports are ignored. Audit findings remain; do not apply breaking forced fixes without review.

## API, authentication and security

All endpoints are under `/api/v1`: auth/login, auth/refresh, auth/logout, auth/me, users, assignees, todos and todos/:id. See [actual payloads and permissions](docs/api.md). Health: `GET http://localhost:3000/api/v1/health` (also available directly from backend).

Next.js uses a route-handler proxy, not rewrites. It preserves cookies, Origin and separate Set-Cookie headers. HttpOnly host-only cookies hold short-lived access JWTs and rotating opaque refresh tokens; browser storage holds no tokens. Backend checks current user/session state, validates mutation Origin, enforces RBAC/task ownership, hashes passwords and persists refresh hashes only. Strict DTOs reject extra fields. Restricted TipTap JSON is stored as JSONB and displayed without injected HTML. See [architecture](docs/architecture.md).

## Limitations and troubleshooting

[Known limitations](docs/known-limitations.md) disclose open dependency advisories, process-local rate limiting and deployment boundaries. Real production HTTPS was not tested.

- DB connection refused: check Docker health and host port 5433, not 5432. Existing volume credentials do not change with env edits.
- JWT startup failure: replace placeholder with generated randomness, check required variables, restart backend.
- Mutation 403: use exact configured Origin, including hostname/scheme/port; command-line mutations also need matching Origin and cookies.
- Login fails after seed: existing accounts are preserved. Seed is not a password reset. Inspect local configuration/status without deleting data.
- Proxy 503: start backend and check frontend BACKEND_URL; restart Next after env edits.
- Migration conflict: inspect schema/history; never enable synchronize to bypass migrations.
- Git dubious ownership on this shared checkout: inspect ownership before a per-command `git -c safe.directory=H:/projects/viraco ...` override. A normal fresh clone should not need it.

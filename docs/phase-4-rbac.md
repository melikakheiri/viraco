# Phase 4: RBAC and user management

NestJS owns authorization. The existing `UserRole` enum and schema are reused;
there are no migrations and TypeORM synchronization remains disabled.

## Authorization

`@Roles(...)` opts a handler/controller into the global `RolesGuard`. It invokes
the existing `AuthGuard`, which validates the access token/session and reloads the
user from PostgreSQL. JWT role claims and request payload roles do not authorize
requests. Inactive or unauthenticated users receive 401; authenticated users with
the wrong role receive 403. Role checks precede the global CSRF guard so missing
authentication still returns 401 on mutations without an Origin header. Existing
authentication routes retain their CSRF behavior.

## API

All routes below require an active OWNER and are reached by the browser through
the existing Next.js `/api/v1/*` proxy. Mutations require the configured Origin.

| Method | Route               | Payload / behavior                                        |
| ------ | ------------------- | --------------------------------------------------------- |
| GET    | `/api/v1/users`     | All users, ordered by creation timestamp then UUID        |
| POST   | `/api/v1/users`     | `email`, `password`, `role`; creates an active user (201) |
| PATCH  | `/api/v1/users/:id` | `role` and/or `isActive` (200)                            |

Responses contain only `id`, `email`, `role`, `isActive`, `createdAt`, `updatedAt`.
Explicit serialization excludes hashes and relations, even after a write.
Emails are trimmed/lowercased; existing database normalization and uniqueness
constraints enforce case-insensitive uniqueness. Duplicates return 409, including
concurrent creation. Passwords require 12+ characters and at most 72 UTF-8 bytes
and are hashed with bcrypt cost 12. Unknown fields, null update values, invalid
roles/booleans and empty updates return 400. Missing users return 404; malformed
UUIDs return 400. There is no public registration or management UI.

## Last active OWNER

Every user-management mutation acquires PostgreSQL transaction advisory lock
`(1791701867, 4)` before reading current state. Transactions use READ COMMITTED,
so a waiter sees the committed preceding mutation after acquiring the lock.
The service rechecks the actor's current role/status inside this critical section,
locks the target row for update and counts active owners before removing one.
Removing the last active owner by demotion/deactivation returns 409. Combined
payloads obey the same rule. Lock release follows transaction commit/rollback.

This invariant covers management API writes across processes sharing the database.
Future user mutation paths must use this protocol; direct administrative SQL can
bypass application invariants. Development seeding remains separate from the API.

## Phase 5 policy foundation

`TaskPolicyService` reloads the actor and provides `visibility()` filters for
database list/count queries and `authorize()` for individual operations. OWNER
and MANAGER can operate on all tasks. MEMBER visibility/update is limited to
created/assigned tasks, deletion to created tasks, and assignment to self or null.
Checks use the persisted task before applying changes. Creator identity is
immutable; creation must use the authenticated actor. New assignees must be active.

Phase 5 must invoke these policies with the transaction manager used to load and
write tasks, apply visibility before pagination, and explicitly map validated
payload fields. No task CRUD endpoints are implemented in Phase 4.

## Verification

- `npm test --workspace backend`: database, authentication, RBAC integration.
- `npm run test:rbac --workspace backend`: 18 behavioral subtests plus parent.
- Set `TEST_BASE_URL=http://localhost:3000` to run the same RBAC HTTP tests through
  a running Next.js proxy and NestJS server rather than an in-process Nest app.
- Backend/frontend: `typecheck`, `lint`, `build` scripts.

Tests require the existing local development database guarded by
`assertLocalDatabase()`. Run database-mutating suites sequentially, without other
development traffic. Last-owner tests temporarily deactivate existing owners,
then restore their roles/status/timestamps in `finally`. Only users/sessions
created by the tests are removed. Seed passwords and existing sessions are kept.
Seed accounts are checked for their intended roles and active status.

Verified on 2026-10-11 using the existing local PostgreSQL database:

- All 36 behavioral checks passed: 6 database, 12 authentication, 18 RBAC.
- All 18 RBAC checks also passed through `http://localhost:3000/api/v1/*` with
  the production Next.js server forwarding HTTP requests to NestJS.
- Backend and frontend typecheck, lint and build passed.
- Existing nonblocking tool warnings: pg concurrent-query deprecation in the
  database suite and Next.js ESLint plugin detection during frontend build.

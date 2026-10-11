# Phase 5: Task CRUD and TipTap validation

## API contract

NestJS owns task validation, authorization, persistence and filtering. The existing
Next.js `/api/v1/*` proxy forwards these endpoints without browser-to-backend calls.
No task UI or editor screen was added.

| Method | Route               | Result                                   |
| ------ | ------------------- | ---------------------------------------- |
| GET    | `/api/v1/todos`     | `{ items, total, page, pageSize }` (200) |
| POST   | `/api/v1/todos`     | Created task (201)                       |
| GET    | `/api/v1/todos/:id` | Task (200)                               |
| PATCH  | `/api/v1/todos/:id` | Updated task (200)                       |
| DELETE | `/api/v1/todos/:id` | Empty response (204)                     |

Create requires a trimmed nonempty title (maximum 255 characters). Optional
fields: status (`todo`, `in_progress`, `done`), priority (`low`, `medium`, `high`),
assigneeId (UUID or null), dueDate (strict ISO timestamp with timezone or null),
and description (validated TipTap JSON). Defaults: todo, medium, no assignee,
no due date and `{ "type": "doc", "content": [] }`. creatorId always comes from
the authenticated actor. PATCH accepts only these six fields and rejects an
empty update. Null only clears assigneeId/dueDate; other nulls are rejected.
Unknown fields, entity relations, creatorId and timestamps cannot be supplied.

Responses explicitly serialize only id, title, status, priority, creatorId,
assigneeId, dueDate, description, createdAt and updatedAt. User/session entities
and credential hashes are never joined or exposed. Responses are not cached.

## Filtering and pagination

GET accepts `status`, `assigneeId`, `page`, `pageSize`. Both filters can be combined.
Values are validated strictly; unknown/repeated query parameters are rejected.
Pagination defaults to page=1 and pageSize=20; maximum pageSize=100, page=1000000.
Ordering is createdAt DESC, id DESC, with UUID as a deterministic tie-breaker.
Filtering and visibility are applied in SQL before pagination and count. Empty
or out-of-range pages return an empty items array with the visible filtered total.

## Authorization and concurrency

All endpoints require an active authenticated user. The global RolesGuard reuses
AuthGuard and reloads current role/status from PostgreSQL; JWT role claims grant
no permissions. Mutations retain the existing Origin-based CSRF protection.

- OWNER/MANAGER: full CRUD and assignment to any existing active user.
- MEMBER: view/update created or assigned tasks; delete only created tasks;
  create tasks; assign only to self or clear assignment on an authorized task.
- creatorId is immutable for every role. Authorization uses the stored task before
  applying requested changes, preventing ownership/assignee payload bypasses.
- Every supplied non-null assigneeId must identify an active user, even if it
  matches the existing assignee. Updating unrelated fields can retain an existing
  inactive assignee; it cannot create a new assignment to an inactive user.

Task operations use READ COMMITTED transactions and acquire the shared variant
of the Phase 4 authorization advisory lock `(1791701867, 4)`. User mutations retain
the exclusive variant. Task operations therefore reload authorization after any
queued user mutation and retain that authorization state until their transaction
ends. Multiple task transactions can run concurrently. PATCH/DELETE additionally
lock the stored task row FOR UPDATE before task-level authorization and writing.
A waiting MEMBER sees the committed assignee change before authorization, and
concurrent partial updates preserve fields changed by earlier committed requests.

HTTP errors: 400 invalid DTO/query/document/UUID; 401 missing/invalid/disabled
identity; 403 forbidden task operation, CSRF or invalid/inactive assignee;
404 nonexistent task; 413 request bodies over the existing Express body limit.

## TipTap JSON schema

Description stays PostgreSQL jsonb and is returned as JSON without HTML conversion.
The supported subset is explicit, and full-tree validation occurs before
class-transformer recursively processes request data, then again via class-validator.

- Nodes: doc, paragraph, text, heading, bulletList, orderedList, listItem, blockquote.
- Marks on text only: bold, italic, link; duplicate marks are rejected.
- doc/blockquote contain blocks; lists contain listItems; listItems start with a
  paragraph and may contain subsequent blocks; paragraph/heading contain text.
- Empty doc, doc with empty content and empty paragraphs are accepted. Text nodes
  require nonempty text. Structural list/blockquote nodes cannot be empty.
- Attributes: heading.level is integer 1–6; orderedList.start is a positive 32-bit
  integer if provided. Link requires href with http:// or https://; relative,
  protocol-relative, mailto, data and javascript URLs are rejected, as are embedded
  credentials, controls and whitespace. Optional link target is null/_blank/_self;
  rel is null or tokens from noopener/noreferrer/nofollow/ugc; class may only be null.
  Other attributes and unknown object properties are rejected.
- Limits: 64 KiB serialized UTF-8 JSON, depth 20 (root depth zero), 2000 nodes,
  link URL length 2048. NUL and unpaired Unicode surrogates are rejected to avoid
  PostgreSQL jsonb encoding errors. Malformed HTTP JSON is rejected by the parser.
- Text containing angle brackets stays text in JSON. A future renderer must render
  text as text and use this supported schema rather than insert raw HTML.

Tiptap's persistence model supports storing editor JSON directly; see the
[official persistence documentation](https://tiptap.dev/docs/editor/core-concepts/persistence).
The allowlist above is the application contract, independent of additional editor extensions.

## Database and verification

Existing Task/User entities and the existing migration are reused. No migration,
schema reset or volume operation is needed; synchronize remains false.

Commands:

- `npm run test:tasks --workspace backend`
- `npm test --workspace backend` runs database/auth/RBAC/tasks sequentially.
- To verify actual Next.js forwarding, run both apps and set
  `TEST_BASE_URL=http://localhost:3000` before running test:tasks.
- `npm run typecheck --workspace backend` and the frontend equivalent.
- `npm run lint --workspace backend` and the frontend equivalent.
- `npm run build --workspace backend` and the frontend equivalent.

The task suite covers CRUD, all roles, SQL visibility with both filters,
pagination/totals/tied ordering, strict DTOs, empty/rich/invalid TipTap documents,
JSONB round-trips, limits, HTTP parser errors, stale roles, disabled tokens,
CSRF, ownership races, waiting actor revocation, partial updates and delete races.
Only test-created users/tasks/sessions are removed in finally; seed accounts and
existing development data are preserved. Run these local database-mutating suites
sequentially and without concurrent development activity.

Verified on 2026-10-11: all 60 behavioral checks passed (6 database, 12 auth,
18 RBAC, 24 tasks). All 24 task checks also passed through the actual Next.js
proxy at localhost:3000. Backend/frontend typecheck, lint and build passed.
Existing nonblocking warnings remain: pg concurrent-query deprecation during
schema inspection/database tests, and Next.js ESLint plugin detection during build.

## Files added or changed

- Added `backend/src/tasks/tasks.controller.ts`, `tasks.dto.ts`, `tasks.module.ts`,
  `tasks.service.ts`, `tasks.test.ts`, `tiptap.validator.ts`, `task-payload.pipe.ts`.
- Added `backend/src/auth/authorization-lock.ts` to share the Phase 4 lock protocol.
- Updated `backend/src/auth/task-policy.service.ts` to validate every explicit
  non-null assignee, including an unchanged assignment.
- Updated `backend/src/users/users.service.ts` to use the common lock helper.
- Updated `backend/src/app.module.ts` to register TasksModule and
  `backend/src/configure-app.ts` to validate raw task payloads before transformation.
- Updated `backend/package.json` with test:tasks and inclusion in the full test run.
- Added this document. No frontend source, entity or migration changes.

# API contract

Base path `/api/v1`, served through Next.js browser origin; NestJS implements identical paths on localhost:3001. JSON requests use Content-Type application/json. Send cookies and exact APP_ORIGIN as Origin on mutations, including login/refresh/logout. No bearer-token API or public registration.

## Response types

- SafeUser: `{ id, email, role, isActive }`; role OWNER/MANAGER/MEMBER.
- ManagedUser: SafeUser plus createdAt/updatedAt ISO strings.
- Task: `{ id, title, status, priority, creatorId, assigneeId, dueDate, description, createdAt, updatedAt }`. IDs are UUIDs; assigneeId/dueDate may be null. Dates serialize as ISO strings; description is TipTap JSON. Relations/password/token hashes are not returned.

## Authentication

| Method / path | Body | Success |
| --- | --- | --- |
| POST /auth/login | `{ "email": "owner@taskboard.local", "password": "..." }` | 200 `{ user: SafeUser }`, two Set-Cookie headers |
| POST /auth/refresh | `{}` | 200 `{ user: SafeUser }`, rotated cookies |
| POST /auth/logout | `{}` | 204, empty body, clears cookies |
| GET /auth/me | None | 200 `{ user: SafeUser }` |

Login email is trimmed/lowercased, valid and at most 254 characters. Password is 1–72 characters; successful authentication requires at most 72 UTF-8 bytes. Unknown credentials/disabled users receive generic 401. Refresh/logout require refresh cookie; me requires access cookie. Empty DTOs reject extra fields. Invalid logout may return 401 while clearing cookies.

Login uses process-local 60-second windows: 15 failed attempts per normalized account and 300 total attempts per peer. State is bounded; successful login releases account budget. Rejection is 429 with Retry-After.

## Users and assignees

All /users operations require active OWNER. Lists are arrays without pagination.

| Method / path | Input | Success |
| --- | --- | --- |
| GET /users | None | 200 ManagedUser[], createdAt then ID ascending |
| POST /users | Required email/password/role | 201 ManagedUser, initially active |
| PATCH /users/:id | role and/or isActive | 200 ManagedUser |
| GET /assignees | None; OWNER or MANAGER only | 200 `[{ id, email }]`, active users, email then ID ascending |

Create email is normalized/valid/max 254 characters; password 12–72 characters and at most 72 UTF-8 bytes; role exact enum. Update accepts only optional role/boolean isActive, rejects null/empty update. Email/password changes are unsupported. Duplicate normalized email and last-active-OWNER removal return 409. Missing user 404; invalid UUID 400. Disablement revokes sessions.

## Tasks

All methods require active authenticated user. OWNER/MANAGER manage all tasks. MEMBER reads/updates only created or assigned tasks, creates tasks and deletes only created tasks. Existing unrelated task returns 403, missing task 404.

| Method / path | Input | Success |
| --- | --- | --- |
| GET /todos | Query below | 200 `{ items: Task[], total, page, pageSize }` |
| POST /todos | Create fields below | 201 Task |
| GET /todos/:id | UUID | 200 Task |
| PATCH /todos/:id | At least one update field | 200 Task |
| DELETE /todos/:id | UUID | 204, empty body |

Only list queries status, assigneeId, page, pageSize are supported. Status is todo/in_progress/done; assigneeId UUID (no unassigned/null filter). Page defaults 1, range 1–1000000; pageSize defaults 20, range 1–100. Decimal integer strings accepted; unknown/repeated/invalid values rejected. Filters combine with AND plus MEMBER visibility. Order: createdAt then ID descending. Out-of-range page returns empty items and actual visible total. UI requests pageSize 12.

| Field | Create | Update | Validation |
| --- | --- | --- | --- |
| title | Required | Optional | Trimmed string, 1–255 characters, valid PostgreSQL text |
| status | Default todo | Optional | todo / in_progress / done |
| priority | Default medium | Optional | low / medium / high |
| assigneeId | Default null | Optional; null clears | UUID of active user, role policy applies |
| dueDate | Default null | Optional; null clears | Strict ISO timestamp with seconds/timezone, e.g. 2026-10-11T12:30:00Z |
| description | Default `{ "type": "doc", "content": [] }` | Optional | Supported TipTap JSON, never null |

Creator is derived from authenticated user, immutable and cannot be supplied. MEMBER may set assignee self/null or preserve existing assignment but cannot newly assign another user. Inactive/nonexistent assignee returns 403. Empty update returns 400. Only assigneeId/dueDate allow null.

Example create body:

```json
{
  "title": "Prepare demo",
  "priority": "high",
  "description": {
    "type": "doc",
    "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Review delivery notes" }] }]
  }
}
```

Description supports doc/paragraph/text/heading/blockquote/bulletList/orderedList/listItem, bold/italic/link marks. Heading level 1–6; orderedList start 1–2147483647. Link href: HTTP(S), max 2048 characters, no credentials/control characters/whitespace. Target absent/null/_blank/_self; rel tokens only noopener/noreferrer/nofollow/ugc; class absent/null. Unknown keys/attributes, prototype keys and unsupported embeds are rejected. Limits: serialized UTF-8 64 KiB, depth 20, 2000 nodes. See backend/src/tasks/tiptap.validator.ts for precise tree rules.

Due dates represent instants: ISO timestamps with timezone and up to millisecond precision, persisted as timestamptz and serialized in UTC. The minute-resolution local UI omits unchanged dueDate in PATCH; explicit changes use the browser timezone, and clearing sends null. No schema/API migration was needed.

## Error behavior

All Nest and proxy errors use `{ statusCode: number, error: string, message: string, details: string[] }`. Validation details contain constraint messages without target/value objects. Internal exceptions return a generic message and empty details; SQL, credentials and stacks are never serialized. Frontend continues to map HTTP statuses to Persian messages.

| Status | Meaning |
| --- | --- |
| 400 | Invalid DTO/JSON/UUID/query/document, unknown field, empty update |
| 401 | Missing/expired/invalid token, revoked session, inactive user |
| 403 | Role/task/assignee denial or rejected mutation Origin |
| 404 | Missing user/task or unsupported route |
| 409 | Duplicate email or last-active-OWNER protection |
| 413 | Oversized HTTP body, framework parser limit |
| 429 | Login rate limit, Retry-After |
| 503 | Proxy cannot reach backend or upstream exceeds 15 seconds |

Proxy invalid paths return the same envelope with 400. Proxy caps streamed request bodies at 100 KiB, matching the backend parser limit. Guard ordering affects precedence: unauthenticated protected mutations can return 401 before CSRF/input validation. Handle status codes rather than depending on exact error strings. API/proxy responses disable caching.

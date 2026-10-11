# Phase 3: authentication

## Architecture and endpoints

The browser calls Next.js `/api/v1/*` only. Its server-side proxy forwards cookies and the original Origin to NestJS. NestJS owns validation, bcrypt verification, JWT issuance, refresh rotation, revocation and user lookup. No registration, user management, RBAC, task CRUD or login screens were added.

| Endpoint | Success | Input |
| --- | --- | --- |
| POST /api/v1/auth/login | 200, safe user and two cookies | Email/password DTO |
| POST /api/v1/auth/refresh | 200, safe user and rotated cookies | Refresh cookie; empty body/object |
| POST /api/v1/auth/logout | 204, clears both cookies | Refresh cookie; empty body/object |
| GET /api/v1/auth/me | 200, safe user | Access cookie |

Safe user fields are id, email, role and isActive. Tokens and password/token hashes never appear in response JSON or application logs. Unknown DTO properties are rejected. Login normalizes email and rejects passwords exceeding bcrypt's 72 UTF-8 byte limit. Unknown email, wrong password and disabled user produce identical 401 errors; nonexistent users still perform a dummy bcrypt comparison. Authentication failures return 401; CSRF violations return 403. Auth responses use Cache-Control: no-store and Pragma: no-cache.

## Token lifecycle

- Access JWTs use HS256 only and validate signature, expiration, issuer and audience. Claims contain sub (user UUID) and sid (session UUID), without role. Default lifetime is 300 seconds; startup accepts 30–900 seconds.
- Reusable AuthGuard resolves the current session and user from PostgreSQL, checks session ownership/revocation/expiry, and rejects deleted or disabled users. Role comes from the current database row, even if a signed token contains a different role claim.
- Refresh tokens contain a session UUID plus 32 cryptographically random bytes. Only SHA-256 digests are stored and compared in constant time. Fast SHA-256 is appropriate for random 256-bit secrets; human passwords still use bcrypt.
- Refresh locks the old session row inside a transaction, verifies its hash/state, revokes it with reason `rotated`, and creates the replacement. Concurrent requests have exactly one winner. Losing requests return 401 without clearing the winner's cookies. Clients should serialize refresh requests across tabs.
- Rotation preserves the initial absolute expiry (seven days by default, configurable between one hour and 30 days).
- Logout revokes the matching session with reason `logout` and clears both cookies. Repeated logout with the same valid token is idempotent. Missing/invalid refresh tokens return 401 while clearing cookies. Logout works with an expired access JWT.
- Access JWTs are session-bound, so rotation/logout immediately invalidate the previous access JWT too.
- Reused revoked tokens are detected and rejected. Independent and replacement sessions are not automatically revoked on replay, avoiding denial of access to a legitimate concurrent winner. Automatic active-family revocation is not implemented.

Rotation/replay considerations were reviewed against [RFC 9700 section 4.14](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14). This implementation provides rotation and old-token rejection, but not the RFC's additional active-family revocation response to detected replay.

## Cookies, proxy and CSRF

Both cookies are HttpOnly and host-only (no Domain), with Max-Age/Expires. Access Path is `/api/v1`; refresh Path is `/api/v1/auth`. SameSite accepts lax (local default) or strict. Production startup requires Secure cookies and an HTTPS APP_ORIGIN. Clearing uses matching cookie options. No localStorage/sessionStorage token storage exists.

A global NestJS guard requires the exact configured APP_ORIGIN for all unsafe methods, including login. Missing/foreign/null Origin and Sec-Fetch-Site: cross-site are rejected. Host and forwarded-host headers are never used to infer a trusted Origin. Nonbrowser clients must send the configured Origin. Foreign-origin CORS access is not enabled.

The Next.js proxy forwards selected application headers only, preserves incoming Origin/Cookie, disables fetch caching and does not follow redirects. It appends each Set-Cookie separately using getSetCookie(), preserving Expires commas. Transport errors return generic 503 responses. Path segments are constrained to prevent traversal. No backend URLs/secrets are exposed to browser code. See [Next.js cookie guidance](https://nextjs.org/docs/app/api-reference/functions/cookies).

## Configuration

Database settings remain unchanged. backend/.env.example lists:

- JWT_ACCESS_SECRET: independently generated secret of at least 32 bytes; the placeholder is intentionally rejected.
- JWT_ISSUER and JWT_AUDIENCE: exact expected token issuer/audience.
- JWT_ACCESS_TTL_SECONDS and REFRESH_TTL_SECONDS: validated integer lifetimes.
- APP_ORIGIN: exact browser origin, e.g. http://localhost:3000, without trailing slash.
- COOKIE_SECURE: false locally over HTTP; true in production over HTTPS.
- COOKIE_SAME_SITE: lax or strict.
- ACCESS_COOKIE_NAME and REFRESH_COOKIE_NAME: distinct validated names.

A random secret was generated into the ignored local backend/.env. No production secret was added to source and no database credentials changed. New environments must generate their own secret before startup. Changing the secret invalidates access JWTs; refresh sessions persist until revoked/expired. Coordinate secret changes with session revocation when full logout is required.

The local NestJS server binds loopback. Container/multihost deployment must deliberately configure private service networking and binding.

## Verification

Run from the monorepo root:

```powershell
npm run test --workspace backend
npm run typecheck --workspace backend
npm run lint --workspace backend
npm run build --workspace backend
npm run typecheck --workspace frontend
npm run lint --workspace frontend
npm run build --workspace frontend
```

For actual proxy integration, run NestJS on 3001 and the production-built frontend with `npm run start --workspace frontend`, then set TEST_BASE_URL=http://localhost:3000 and run `npm run test:auth`. Omit TEST_BASE_URL to create an in-process NestJS application on an ephemeral local port.

Database tests: six checks plus parent, seven passing. Auth tests: twelve checks plus parent, thirteen passing, both directly and through the production-built Next.js proxy. Coverage includes all seeded roles, generic credential failures, disabled/deleted users, JWT expiry/issuer/audience, unauthenticated access, safe fields, unknown DTO properties, cookie flags/round trips, CSRF, concurrent rotation, replay rejection, logout and invalid/expired refresh sessions.

Runtime proxy results: login/me/refresh 200, logout 204, old refresh/access tokens 401, disabled-user requests 401, CSRF violations 403. Login and refresh preserved two separate Set-Cookie headers, authenticated subsequent requests worked, and logout forwarded both cookie deletions. Backend/frontend typecheck, lint and production builds passed.

Tests temporarily disable and restore the seeded MEMBER. Deletion testing uses a temporary user. Only sessions minted by these tests are removed; prior users/sessions are preserved.

No schema change or new migration was required. synchronize remains false. Automatic extension installation is disabled in both server and migration data source. No Docker volume was reset and no preexisting data was deleted.

## Remaining deployment considerations

- HTTPS, unique secrets, exact APP_ORIGIN and Secure cookies are required for production.
- Gateway rate limiting, token-free security audit events, expired-session retention cleanup and active-family revocation on replay are not implemented in this phase.
- Role authorization remains deferred to Phase 4.
- Existing tooling emits nonfatal pg introspection deprecation and Next ESLint-plugin detection warnings; standalone lint and builds pass.

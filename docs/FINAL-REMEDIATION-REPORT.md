# Final remediation report

Date: 2026-10-12 (Asia/Tehran). Repository: H:\projects\viraco. Base commit: b97a022 plus pre-existing working-tree changes. **Technical verdict: READY_WITH_RISKS.** All required application behavior and final automated checks pass. This is not a claim of zero vulnerabilities, production readiness, independent human approval, or completed manual delivery. No commit, push, remote change, history rewrite, development database reset/truncate, or schema/migration change was performed.

## 1. Original findings, verification and root causes

| Finding | Classification / confirmed cause | Disposition |
| --- | --- | --- |
| F01, G05 | Security dependency findings confirmed: 33 packages affected (27 moderate/6 high), propagating three advisories. | TipTap runtime and CSS selector parser patched; 6 high tooling-chain findings remain without a patched braces release. |
| F02, D15 | Local security configuration confirmed: PostgreSQL exposed on every interface and weak local credential. | Loopback binding applied to running Compose service. Role password rotated to a random 36-byte base64url secret; ignored root/backend env synchronized. Existing named volume, schema and application rows retained. |
| F03, A08/V01/G04 | Git/delivery preparation confirmed: current commit predates 16 existing UI/proxy/test edits and untracked required font/license. This is not an application authorization failure. | Existing edits retained, source artifact including font/OFL installed and built. Exact inclusion list below. A separate reviewed commit is intentionally pending. |
| F04, Q02/O08 | Actual assignment defect confirmed: class-transformer discards constructor/__proto__ before ValidationPipe can reject them. | Raw own-key and scalar checks run before transformation for login, empty auth bodies, create/update users; existing task/document checks retained. |
| F05, Q03/O08 | Actual assignment defect confirmed: default Nest errors and proxy-local errors differ; validation message could be an array. | Global safe filter and matching proxy contract; statusCode:number, error:string, message:string, details:string[]. |
| F06, T12 | Application defect confirmed: UI truncated date to minutes and sent it on every PATCH. PostgreSQL timestamptz was not the cause. | Unchanged dueDate omitted from PATCH. Genuine edits use browser local time and serialize UTC; clearing sends null. No migration or API contract change. |
| F07, O13/O15 | Documentation/test safety confirmed: obsolete counts/no-commits claim; tests temporarily disabled real seeded users/all OWNERs on development DB. | Fail-closed disposable test target guard, isolated runner, global browser guard, refreshed documentation. |
| F09, U10/U13 | Verification/configuration gap confirmed: fixed baseURL/Origin/DB prevented independent complete suite execution. | Configurable URL/Origin plus test-only DB; all six original Edge scenarios pass, including failure preservation. |
| F08, H12/H18 | Real optional hardening limitation, not a failure of mandatory token hashing/atomic rotation/disablement. No cross-tab exploit was established. | No risky session-schema redesign. Cross-tab race, replay descendants and cleanup limits remain explicitly documented. |
| F10 | Proxy resource hardening gap confirmed, beyond minimal endpoint behavior. | Streamed 100-KiB body cap before forwarding; 15-second upstream fetch deadline; matching 413/503 envelope; cookies/status semantics retained. |
| U14/H16, V02/V03/V04 | Manual/external evidence absent, rather than demonstrated application failure. | Screen-reader/complete manual RTL, HTTPS deployment, real Persian recording and email/deadline remain UNVERIFIED. |

No original blocker was dismissed without evidence. Severity was qualified: no critical RBAC bypass was established; propagated audit package counts are not independent exploits; uncommitted work is delivery preparation under the explicit no-commit instruction. The [fresh 133-item matrix](FINAL-HIRING-ASSIGNMENT-AUDIT.md) covers every original requirement with status, current source reference and evidence.

## 2. Exact implementation and security corrections

- `backend/src/raw-payload.pipe.ts:6`, `backend/src/configure-app.ts:9`: reject own unknown keys before transformation; retain whitelist:true, forbidNonWhitelisted:true and suppressed validation target/value. Auth/user scalar fields reject nested objects; task TipTap nested objects retain their strict allowlist.
- `backend/src/api-exception.filter.ts:6`: preserve HttpException statuses, normalize validation details, map PostgreSQL constraint codes 23505/23503/23514 to safe 409, parser errors to 400/413, unexpected exceptions to generic 500. No query, stack, token, credentials or raw database error is serialized.
- `frontend/app/api/v1/[...path]/route.ts:2`: matching error envelope, streamed cap and AbortSignal timeout; upstream response bytes/status and separate Set-Cookie remain preserved. Browser still calls only /api/v1; business logic stays in NestJS.
- `frontend/lib/due-date.ts:9`, `frontend/components/task-form.tsx:153`: timestamps represent instants with milliseconds and timezone. Unchanged minute-resolution input is omitted, preserving exact persisted timestamp. Three-zone unit coverage and full API-create/UI-edit/API-read coverage added.
- `frontend/components/editor.tsx:20`, `frontend/lib/task-link.ts:5`: adapt TipTap 3 without widening document validation. Disable duplicate/new link, underline, trailingNode defaults; remove unused new title attribute from Link schema. The first Edge run exposed title:null rejection; corrected schema and reran the complete suite. RTL toolbar, supported marks and safe HTTP(S) links remain.
- `backend/src/database/local-guard.ts:2`, `frontend/tests/application.spec.ts:7`, `scripts/verify-isolated.cjs:1`: TEST_DATABASE=true, loopback host, taskboard_test_* and non-5433 port required before destructive tests. Development migration/seed workflow remains supported. The runner creates only a random independent tmpfs database, generates independent credentials, applies migration/seed twice, checks all workspaces and Edge, and cleans up its own processes/container. --e2e-only reuses built assets for a focused independent browser rerun.
- `docker-compose.yml:10`: actual service now reports 127.0.0.1:5433->5432 only. Coordinated role-password rotation was performed without resetting the volume. Original local apps were restarted with the new ignored env and compiled fixes.

RBAC OWNER/MANAGER/MEMBER, disabled-user old-token invalidation, last active OWNER concurrency, refresh hash/rotation, HttpOnly/Secure configuration, Origin/CSRF, migration/schema parity, seed idempotency, safe links and JSON resource limits were reviewed and tested; no authorization weakening or migration was needed. Existing UI design/Vazirmatn/RTL changes were retained.

## 3. Dependency review

Before: full **33 = 27 moderate + 6 high**, production-classified **32 = 27 moderate + 5 high**. After: full **6 high**, production-classified **5 high**, **0 moderate/critical**. Both final audits return exit 1 because the remaining advisory is real.

| Advisory | Packages / graph | Exposure and action |
| --- | --- | --- |
| [GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh) | Direct @tiptap/react, starter-kit, extension-link and transitive core/extensions; old 2.x graph. | Browser editor runtime. All three direct packages upgraded together to ^3.31.4 (installed 3.31.4; advisory minimum patched 3.30.4), with schema adaptation and Edge formatting/link regression. |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Transitive postcss-selector-parser 6.1.4 through Tailwind/postcss-nested. | Repository CSS compilation. Root override ^7.1.6, installed 7.1.6; actual Tailwind production build and clean-install build pass. |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | braces 3.0.3 -> micromatch/fast-glob/chokidar -> Tailwind 3.4.19 and @next/eslint-plugin-next. 6 propagated high packages; plugin chain omitted in production audit leaves 5. | Stack exhaustion on deeply nested glob patterns. Registry latest braces is still 3.0.3, with no patched release. Patterns/config are repository-controlled; task/API inputs never become globs. No runtime exploit path was identified, but zero risk is not claimed. Do not compile untrusted repository/configuration inputs. Future alternative: evaluate Tailwind 4/ESLint tooling replacement or upstream patch in a separate compatibility change. No forced fix/downgrade or fabricated owner acceptance. |

package-lock.json is consistent: isolated npm ci installs successfully and npm ls resolves selector parser 7.1.6. [Official TipTap migration guidance](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) informed the major-version adaptation. Remaining limitations are in known-limitations.md.

## 4. Regression tests

- CONTRACT: valid login/create/update-user/create/update-task/empty payloads succeed. ordinary, constructor and JSON-origin __proto__ keys return 400 for all six DTOs. Nested unknown TipTap fields and object-valued scalar fields fail. Real HTTP 400/401/403/404/500 have consistent fields/types; internal secret-like exception text is absent. Test guard rejects unmarked, development and remote targets.
- CORE: unchanged due date preserves seconds/milliseconds/offset across UTC, Asia/Tehran and America/New_York; clear/new/null paths work. Proxy preserves upstream 400/401/403/404/500 payload/status, independently returns matching 400/413/503, and retains cookies/Origin/query behavior.
- EDGE MEMBER assigned-task scenario: API creates 2026-10-20T16:04:56.789+03:30, UI changes title, GET remains 2026-10-20T12:34:56.789Z. Existing OWNER rich-link formatting exposed and now guards the TipTap schema adaptation. All original security tests retained.

## 5. Commands and actual results

Final full command: npm run verify:isolated (with temporary Windows socket preload described below). Final browser-guard-only follow-up: npm run verify:isolated -- --e2e-only: 6/6 pass, 20.8 seconds. Frontend lint was rerun afterward and passed. No arbitrary timeout increases or weakened assertions.

| Command / check | Actual final result |
| --- | --- |
| npm test --workspace backend | **68 pass, 0 fail, 0 skipped**: CONTRACT 2 + DB 7 + AUTH 14 + RBAC 20 + TASK 25. Four suite parents included: 64 leaf tests. |
| npm test --workspace frontend | **7 pass, 0 fail, 0 skipped** |
| npm run test:configuration | **2 pass, 0 fail** |
| npm run test:e2e --workspace frontend, PLAYWRIGHT_CHANNEL=msedge | **6/6 pass**, complete original suite, 20.7 seconds in final full run. Includes role CRUD, OWNER management/filters/pagination/failure preservation, assigned MEMBER and login accessibility. |
| npm run typecheck --workspace backend / frontend | both exit 0 |
| npm run lint | frontend/backend both exit 0 |
| npm run build | frontend Next 15.5.27 and backend Nest both exit 0 |
| docker compose config --quiet | exit 0; missing/empty credential config also rejected in tests |
| fresh migration + seed twice, independent DB | initial migration applied; first seed 3 created=true, second all created=false |
| npm run migration:show, independent DB | [X] 1 InitialTaskBoard1791701867468, exit 0 |
| npm run migration:show, development DB (read-only) | same migration applied; exit 0 after credential rotation; no pending migration |
| npm audit --json / npm audit --omit=dev --json | exit 1 / exit 1: 6 high / 5 high; no moderate/critical |
| clean candidate npm ci --no-audit --no-fund | exit 0, 662 installed packages in independent temp source artifact |
| clean candidate npm run build, NODE_ENV=production | both workspaces exit 0, includes font/OFL and TaskLink fix |
| git diff --check; ls-files/check-ignore/status | whitespace check passes; original tracked count 92; source inclusion list below; env/build/log/audit/browser artifacts ignored |

Environment: Windows PowerShell, Node 22.19.0, npm 10.9.3, PostgreSQL 16 Docker, installed Microsoft Edge. Normal source-copy build uses production NODE_ENV. Test backend intentionally uses development authentication configuration, independent credentials and loopback origins.

### Failed attempts and Windows verification limit

The first isolated run passed the original 66 backend results plus the initial contract test, frontend/config checks and lint, then failed Next prerender because the runner inherited development NODE_ENV during build. Corrected the runner to use production only for build. Subsequent attempts failed with EADDRINUSE/failed fetch from Windows automatic source-port allocation (over 21,000 TIME_WAIT sockets observed), including seed/DB/auth concurrency failures. These were not passed, hidden or resolved through longer timeouts. A focused independent PostgreSQL diagnostic reproduced first connection success followed by EADDRINUSE; explicit distinct source ports succeeded.

A temporary socket-workaround.cjs outside the repository patches net.Socket.connect only when TEST_DATABASE=true and destination is loopback. Atomic per-port directory reservations allocate unused source ports 30000-47999. It changes neither destination host/port nor guards/logic/payloads/DB contents. NODE_OPTIONS preload was used for the final full run and removed afterward. The first partial workaround covered only pg and left HTTP fetch failing; expanded to all test loopback Node sockets. The first complete Edge run then had **5 pass/1 fail**: OWNER rich link received new title:null and was rejected locally. Fixed TaskLink schema (no allowlist weakening); next complete run had **6 pass**.

Temporary preload path for reproduction on this affected Windows host: C:\Users\gandi\AppData\Local\Temp\viraco-test-sockets-0e5c18794d6544bfa136c8c9f48b9626\socket-workaround.cjs. Its allocator directories must be retained while TIME_WAIT sockets persist, or use a fresh unused source-port range. Healthy hosts run the repository runner directly. OS networking settings were not changed. The limitation is explicit: final database/browser checks passed with test-only source-port instrumentation, not a claimed native-networking repair.

Final candidate-source check: 103 included files, zero byte mismatches. Comparing actual local password/secret values against candidate text found zero matches. Restarted development backend health, Next proxy health and login each returned HTTP 200.

Local ignored evidence: verification-remediation-final-success.log, verification-edge-final-guard.log, verification-delivery-install.log, verification-delivery-final-build.log, remediation-audit-after.json and remediation-audit-production.json. Earlier failed attempt logs are retained. Test traces/screenshots/logs are excluded from submission. Existing warnings remain: Next ESLint-plugin detection despite successful explicit lint, pg concurrent-query deprecation, npm tooling deprecation, Playwright color variables; clean temp artifact also warns about an unrelated parent lockfile root inference. No warning was counted as a failed test or suppressed to claim security.

## 6. Documentation, remaining issues and manual delivery

README explains Node 20+, Docker/env/credential configuration, migration/seed, idempotency, sample accounts, both apps, tests and architecture. It now directs destructive verification to a disposable database, explicitly disclosing temporary seeded-user mutations. API docs describe fixed error/date semantics. Architecture, AI workflow and limitations reflect implemented changes, not invented human approvals. demo-script-fa.md distinguishes configured local passwords from placeholders. delivery-readiness.md replaces stale no-commits/count assertions.

Remaining: the unpatched braces tooling advisory; optional cross-tab refresh coordination, family replay revocation, scheduled session cleanup and process-local rate limiting; manual complete NVDA/RTL review and real HTTPS deployment. Persian video (real file, <=5 minutes, required topic coverage) and email timestamp/60-hour deadline/receipt remain **UNVERIFIED**. No video exists in the reviewed source artifact and no deadline evidence was supplied.

## 7. Git submission readiness and precise inclusion list

The repository has an existing commit; changes were already present before remediation. Do not submit only b97a022 or an unfiltered folder zip. The following **46** new/modified files must accompany the eventual separate submission commit; this includes the original 16 edits and font/license, not only remediation edits. All other unchanged tracked files stay included as usual. No git add/commit/push or remote modification was performed.

```text
.gitignore
README.md
backend/package.json
backend/src/api-exception.filter.ts
backend/src/auth/auth.test.ts
backend/src/configure-app.ts
backend/src/contracts.test.ts
backend/src/database/database.test.ts
backend/src/database/local-guard.ts
backend/src/raw-payload.pipe.ts
backend/src/tasks/tasks.test.ts
backend/src/users/users.test.ts
docker-compose.yml
docs/FINAL-HIRING-ASSIGNMENT-AUDIT.md
docs/FINAL-REMEDIATION-REPORT.md
docs/ai-workflow.md
docs/api.md
docs/architecture.md
docs/delivery-readiness.md
docs/demo-script-fa.md
docs/known-limitations.md
frontend/.env.example
frontend/app/api/v1/[...path]/route.ts
frontend/app/fonts/OFL.txt
frontend/app/fonts/README.md
frontend/app/fonts/Vazirmatn-Variable.woff2
frontend/app/globals.css
frontend/app/layout.tsx
frontend/app/login/page.tsx
frontend/components/auth.tsx
frontend/components/board.tsx
frontend/components/editor.tsx
frontend/components/task-form.tsx
frontend/components/users.tsx
frontend/lib/due-date.ts
frontend/lib/task-link.ts
frontend/next.config.ts
frontend/package.json
frontend/playwright.config.ts
frontend/tailwind.config.ts
frontend/tests/application.spec.ts
frontend/tests/core.test.ts
package-lock.json
package.json
scripts/verify-isolated.cjs
tests/configuration.test.cjs
```

Ignored local .env and backend/.env contain the newly rotated credential and must stay excluded. Do not include node_modules, .next, dist, test-results, playwright-report, logs, raw audit JSON, tsbuildinfo, dumps or key material. Fonts/OFL and the isolated runner/regression tests are eligible and required. The independent candidate source artifact was built from git ls-files --cached --others --exclude-standard, rather than all local files.

## 8. Final verdict

**READY_WITH_RISKS technically, ready for a separate reviewed commit.** Mandatory application defects and unsafe development test behavior are corrected; all automated suites/checks pass under the disclosed Windows test-network workaround and the complete source artifact installs/builds. Remaining unpatched tooling risk is explicitly documented without fabricated acceptance. **Manual submission is incomplete/UNVERIFIED** until recording and 60-hour receipt evidence are checked. Not declared READY_FOR_SUBMISSION or production-ready.

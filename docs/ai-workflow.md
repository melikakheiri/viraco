# AI-assisted development workflow

The project was prepared with AI assistance under phase-based requests. The user reports Phases 1–7 implemented and tested; existing phase notes and tests evidence the resulting implementation. There was no commit history at the Phase 8 review. This document does not claim independently verified chronology, named reviewers or human approvals.

The final structure reflects foundation/workspaces, database migration/seed, authentication, RBAC/user management, task CRUD, Persian RTL frontend, integration/security checks, then final documentation/delivery review. Historical phase-2 through phase-5 notes remain. Final README/API/architecture describe current behavior, including active-assignee selection that supersedes early frontend notes.

AI assistance supports inspection, requested implementation, documentation and command execution. In Phase 8 the agent inspected scripts, DTOs, controllers, services, guards, proxy, entities, migrations, seed and tests; corrected stale documentation and reran verification. No business logic/schema changes were necessary. Raw local reports are excluded; delivery-readiness.md records current verification and limitations.

Tests combine PostgreSQL schema parity/fresh migration rollback/idempotent seed, HTTP auth/CSRF/RBAC/disabled-user/last OWNER/task/concurrency tests, frontend document/permission/refresh tests, TypeScript, ESLint and builds. Existing Playwright tests cover role flows, focus, RTL overflow and automated axe checks. Fresh execution is distinguished from historical logs in delivery-readiness.md.

Security review focuses on relative browser API routes, environment secrets, no registration, database-backed authorization, strict DTO/TipTap allowlists, safe React rendering and migration safety. Dependency restrictions mitigate exposure but do not fix dependencies. Automated accessibility checks do not replace manual assistive-technology/RTL review. Real HTTPS deployment remains unverified.

AGENTS.md is the project AI instruction file. Its final rules match the architecture: Next proxy, Nest business logic, synchronize disabled, reviewed migrations, env credentials, meaningful tests/build/lint, security and RTL review. No other project AI instruction files were found outside dependencies/generated directories.

The human owner remains responsible for reviewing changes, accepting risks, approving deployment/migrations and making the final submission. No such approval is fabricated. Phase 8 does not commit or push; successful tests are evidence, not a guarantee of security or production readiness.

## Final remediation - 2026-10-12

Codex read the supplied final remediation prompt and every audit finding, verified the code, implemented raw auth/user validation, a common error filter/proxy envelope, due-date preservation, dependency updates, loopback database binding and isolated test configuration. It generated and ran regression tests and inspected RBAC, cookies, CSRF, JSON limits, migrations and RTL behavior. No agents, custom skills or hooks were used. AGENTS.md rules and the user constraints governed the work; no commit, push or schema migration was made. Local database credentials were rotated without resetting the existing volume or changing application rows. Automated review/checks are recorded in FINAL-REMEDIATION-REPORT.md; independent human approval, video and deadline verification remain external.

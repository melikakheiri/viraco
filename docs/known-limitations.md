# Known limitations and security notes

## Dependency audit - 2026-10-12

Full audit: **6 high, 0 moderate, 0 critical**. Production-classified graph: **5 high**. Both audits exit 1. These are propagated package findings from one unpatched advisory, not six separate exploits.

TipTap runtime dependencies were upgraded together from 2.x to **3.31.4** (minimum advisory patch 3.30.4). StarterKit's new link/underline/trailingNode defaults are disabled; the unused new link title attribute is removed through TaskLink; the existing schema, RTL toolbar, safe link configuration and JSON renderer remain. [Official migration guide](https://tiptap.dev/docs/guides/upgrade-tiptap-v2), [prototype advisory](https://github.com/advisories/GHSA-cp6q-959q-f8rh). The transitive selector parser is overridden to **7.1.6** and build-tested: [selector advisory](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).

Remaining [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): braces 3.0.3 is transitive through micromatch/fast-glob/chokidar, Tailwind 3.4.19 and the Next ESLint plugin. No patched braces release exists in the registry at verification time. Installed braces code can exhaust stack on deeply nested glob patterns. The app never uses request fields as globs; patterns/CSS/config come from trusted repository sources. Tailwind is declared a production dependency but compilation is build-time; the ESLint chain is development-only. Do not process untrusted repositories/configuration through this toolchain. A Tailwind 4/ESLint toolchain replacement is a future compatibility project; forced fixes/downgrades were not applied. No owner risk acceptance is fabricated, and zero vulnerabilities is not claimed.

## Runtime and deployment

- Rate limiting is bounded process-local memory, resets on restart and is not shared across backend instances. Proxy shares a peer address; this is not distributed per-client-IP protection.
- Refresh rotation rejects old tokens but does not revoke active descendant family on replay. No scheduled expired/revoked session cleanup exists.
- Real HTTPS deployment was not tested. Auth tests verify production configuration rejects insecure cookies/non-HTTPS origin and sets Secure options. TLS/hostname/cookie behavior still needs deployment testing.
- Compose provides only PostgreSQL and binds 127.0.0.1:5433. The existing local database role password was rotated to a random secret and ignored env files synchronized without resetting data. Existing backend processes need to reload their environment after credential rotation. No database TLS, backup/restore or first production OWNER provisioning workflow is supplied.
- Backend binds loopback; migration/seed tools allow local taskboard:5433 or explicitly marked disposable test targets. Destructive tests refuse development targets. Production/container networking and migrations need explicit work. Development seed rejects production.
- Final checks used Node 22.19.0; Node 20 is the intended baseline but was not freshly tested on a separate runtime. Clean install scope is in delivery-readiness.md.
- Next build warns it did not detect the ESLint plugin despite explicit recommended/core-web-vitals rules and passing lint. PostgreSQL test emits pg concurrent-query deprecation warning: future pg 9 compatibility debt.

## Product and test scope

No public registration, password change/reset, email delivery, user deletion API, attachments, full-text search or real-time updates. User/assignee lists are unpaginated. Date inputs use native Gregorian controls with Persian display. Board pages contain 12 items, so demo pagination needs at least 13 visible tasks. MEMBER cannot browse the directory.

Automated browser accessibility checks cover selected scenarios, not full screen-reader compliance. The Persian script is a recording plan; no video was generated. No independent human security approval is claimed. Historical phase notes may predate final assignee flow; current API documentation describes implemented behavior.

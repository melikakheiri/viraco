# Known limitations and security notes

## Dependency audit — 2026-10-11

Fresh full audit: **33 findings: 27 moderate, 6 high, 0 critical**. Production-classified graph (`npm audit --omit=dev`): **32: 27 moderate, 5 high**. Counts include propagation through dependency chains, not 33 independent advisories, and can change. Audit exits nonzero because findings remain. Raw JSON reports are ignored local artifacts; rerun audit for current details.

- [TipTap GHSA-cp6q-959q-f8rh](https://github.com/advisories/GHSA-cp6q-959q-f8rh): affected mergeAttributes can carry prototype-manipulated attributes into executable DOM attributes. Installed TipTap 2 remains affected; advisory lists patched 3.30.4. Frontend/backend raw JSON allowlists reject __proto__, unknown attributes and embeds, restrict HTTP(S) links and resource usage, and render saved text with React rather than injected HTML. Regression tests reject JSON-origin prototype payloads. These restrictions reduce input exposure; they do not patch dependencies or prove complete safety for paste/editor/plugin behavior.
- [braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) propagates through glob tooling including fast-glob, Tailwind and Next ESLint tooling. Deep untrusted patterns can exhaust stack. Application inputs are not used as glob patterns; current exposure is primarily tooling processing repository configuration, but the dependency remains affected.
- [postcss-selector-parser GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) propagates through CSS tooling. Large flat selectors can exhaust CPU. CSS comes from repository sources; there is no user CSS compilation/upload endpoint. Some build tooling is classified as production by npm, so omit=dev counts alone do not establish browser/server runtime reachability or safety.

Forced audit fixes were not applied: proposed changes include major version changes/downgrades incompatible with the required Next.js 15/TipTap 2 setup. Upgrades require separate compatibility, editor-schema, security and regression review. Unresolved vulnerabilities are not claimed fixed.

## Runtime and deployment

- Rate limiting is bounded process-local memory, resets on restart and is not shared across backend instances. Proxy shares a peer address; this is not distributed per-client-IP protection.
- Refresh rotation rejects old tokens but does not revoke active descendant family on replay. No scheduled expired/revoked session cleanup exists.
- Real HTTPS deployment was not tested. Auth tests verify production configuration rejects insecure cookies/non-HTTPS origin and sets Secure options. TLS/hostname/cookie behavior still needs deployment testing.
- Compose provides only PostgreSQL and exposes host port on all interfaces with a required locally configured password. Restrict exposure and replace credentials before deployment. No database TLS, backup/restore or first production OWNER provisioning workflow is supplied.
- Backend binds loopback; migration/seed tools enforce local taskboard:5433. Production/container networking and migrations need explicit work. Development seed rejects production.
- Final checks used Node 22.19.0; Node 20 is the intended baseline but was not freshly tested on a separate runtime. Clean install scope is in delivery-readiness.md.
- Next build warns it did not detect the ESLint plugin despite explicit recommended/core-web-vitals rules and passing lint. PostgreSQL test emits pg concurrent-query deprecation warning: future pg 9 compatibility debt.

## Product and test scope

No public registration, password change/reset, email delivery, user deletion API, attachments, full-text search or real-time updates. User/assignee lists are unpaginated. Date inputs use native Gregorian controls with Persian display. Board pages contain 12 items, so demo pagination needs at least 13 visible tasks. MEMBER cannot browse the directory.

Automated browser accessibility checks cover selected scenarios, not full screen-reader compliance. The Persian script is a recording plan; no video was generated. No independent human security approval is claimed. Historical phase notes may predate final assignee flow; current API documentation describes implemented behavior.

# BBOS test results

Audit window: 2026-10-16 to 2026-10-17; Sprint 1 rerun: 2026-10-20. Windows/PowerShell, Bun 1.4.0. Tests used local fixtures, loopback HTTP servers and explicit local demo/emulator configurations. No production database or live external message was used.

## Final practical verification

| Command | Result | Scope / limit |
|---|---|---|
| `bun test` | **680 passed, 0 failed, 8 reported skipped; 2,721 assertions; 688 runner entries across 49 files; 6.52 s** | Unit/domain/HTTP/source-security tests; one Auth case, five substantive Firestore cases and two suite hooks account for the eight reported skips |
| `bun run test:e2e` | **56 passed, 0 failed; 3.1 min** | Chromium, one worker, explicit demo adapters; includes full Booking lifecycle, inventory, costing, approvals, shares/PDF/mobile layouts and simulated WhatsApp |
| `bun run test:auth-emulator` | **1 passed, 0 failed, 3 assertions** | Final run 2026-10-17; real emulator-issued Firebase token resolves a canonical employee ID distinct from UID; employee lookup fixture is injected |
| `bun run lint` | **Passed** | Actual script is `tsc --noEmit`; this is type checking, not a linter |
| `bun run build` | **Passed** | Frontend and backend bundles built; Vite large-chunk warning remains |
| `bun run test:rules` | **BLOCKED_NOT_RUN** | Java is unavailable; no system software was installed |
| `bun run test:e2e:firebase` | **BLOCKED_NOT_RUN** | Firestore emulator has the same missing-Java limitation |
| `bun audit` | **Failed advisory check (exit 1)** | 15 advisories: 1 critical, 7 high, 5 moderate, 2 low; no dependency changes |
| `git diff --check` | **Passed during final review** | Git warns about normal Windows LF/CRLF conversion; no whitespace defects |
| Standalone formatter / ESLint | **Not run; no configured command** | Do not interpret TypeScript success as formatting/lint success |

Sprint 1 executed **736 passing tests** (680 + 56). The earlier real Auth-emulator run remains recorded separately as one pass; it was not rerun in Sprint 1. This is not a coverage percentage. Executable Firestore cases remain unrun and are not counted as passing.

## Baseline and diagnostic failures

Baseline `bun test`: 651 passed, 1 skipped, 0 failed, 2,634 assertions, 652 entries across 43 files. Final passing count increased by 22. Four additional Firestore emulator cases were added but skipped locally. Five new test files were created; existing authorization, supplier-payable, customer-share and rule-source tests were also strengthened.

The first browser attempt produced 52 passes and four failures while source edits/HMR and session interruptions overlapped it. Failures involved occupancy navigation, optional activity navigation, Quote option setup and secure-share toast/navigation. After source editing stopped, the complete 56-case suite passed, including all four. The audit does not present that initial attempt as passing or establish HMR as the sole cause.

The first expanded unit run caught a stale source assertion expecting direct `pickupTime` rule handling. It was replaced with the stronger unconditional client denial assertion; full tests then passed. New rate HTTP tests initially used a draft/invalid Trip fixture; resource policy correctly denied it. The fixture now uses an assigned BOOKED Trip, preserving the actual authorization rule.

Sandbox execution blocked esbuild configuration reads and Firebase CLI's external settings file. Required retries outside the sandbox succeeded for build/browser/Auth. Dependency audit initially could not reach the registry; the approved retry returned the advisories. The rules and full-Firebase attempts still failed after permission was resolved because Java is absent.

## New regression evidence

| File | Executed invariants |
|---|---|
| `tests/server/audit-operational-integrity.test.ts` | Cross-assignment/inactive denial, idempotency authorization, concurrent cancellation/dispatch, audit rollback, cancellation validation/note retention, one linked voucher set, UUID collision protection, stale confirmation and partial-set rejection |
| `tests/server/audit-production-boundaries.test.ts` | Actual Express denies backend artifacts; actual Firestore SDK rejects old undefined shape and accepts normalized plain records; native sentinels/timestamps preserved |
| `tests/server/audit-rate-projection.test.ts` | Real routers, policy and costing engines hide generic amount/breakdown aliases from assigned Operations; retain scoped Sales/Reservations/Accounts costs; unknown roles fail closed; production config subprocesses disable demo |
| `tests/client/api-pagination.test.ts` | All pages loaded with filters retained; invalid or repeated cursor rejected |
| `tests/server/customer-directory.test.ts` | Customer OWN/TEAM/ALL and cross-scope denial, missing metadata, canonical employeeId instead of UID, protected owner/team/employee/role/financial input rejection, explicit DTO |
| `tests/server/audit-operational-integrity.test.ts` (Sprint 1 extension) | Booking-scoped voucher list denies inactive/unmapped/unassigned actors and excludes supplier cost, buying price, profit, margin and internal notes |
| `tests/security/firestore-rules-emulator.integration.test.ts` | Added but **not executed**: inactive/unmapped/mismatched identity denial, modern collection denial, voucher forgery denial, conversation delete restriction, actor binding and reserved audit actions |
| Existing suites extended | Nested financial alias projection, targeted supplier settlement independent of capped global listings, nested public share fields removed; rule assertions updated to enforce stronger restrictions |

## Build measurements

Sprint 1 Vite: 1,789 transformed modules; frontend JS **1,432.04 kB**, gzip **352.20 kB**; CSS **71.55 kB**, gzip **12.23 kB**. Backend approximately **1,011.9 kB**, source map **1.9 MB**. Backend artifacts remain outside the served public asset directory.

Baseline frontend JS: 1,738.31 kB / 427.35 kB gzip. Production demo exclusion reduced output, but a >500 kB chunk warning remains. No latency/load benchmark was run.

## Reproducibility and release prerequisites

Use the committed Bun lockfile and compatible local runtimes. Install/configure a Firebase-compatible Java runtime through the normal environment process, then run `bun run test:rules` and `bun run test:e2e:firebase`. New rule tests require a loopback emulator and synthetic `demo-bbos-audit-rules` project; they refuse non-loopback hosts. Do not point seed/clear operations at production.

Temporary local evidence logs are named `bbos-audit-final-tests.log`, `bbos-audit-final-e2e.log`, `bbos-audit-final-build.log`, `bbos-audit-final-auth.log`, `bbos-audit-rules.log`, `bbos-audit-firebase-e2e.log` and `bbos-audit-dependencies.log` under the user's temporary directory. Firebase CLI debug output can include environment values, so raw logs are not committed. This report records the relevant nonsecret outcomes.

No branch can be called production-ready on these results alone: named-database behavior, deployed rules/indexes/IAM, historical data, live provider integration, load, full accessibility and incomplete refund/amendment/commission journeys remain outside verified coverage.

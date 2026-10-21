# BBOS test results

Audit window: 2026-10-16 to 2026-10-17; Sprint 1–4 reruns through 2026-10-21. Windows/PowerShell, Bun 1.4.0. Tests used local fixtures, loopback HTTP servers and explicit local demo/emulator configurations. No production database or live external message was used.

## Final practical verification

| Command | Result | Scope / limit |
|---|---|---|
| `bun test` | **700 passed, 0 failed, 8 reported skipped; 2,809 assertions; 708 runner entries across 51 files; 16.83 s** | Includes A01 financial exception, topology, canonical identity and source-security tests; eight emulator-dependent entries skipped here and executed separately where applicable |
| `bun run test:e2e` | **56 passed, 0 failed; 2.9 min** | Chromium, one worker, explicit local topology/demo adapters; includes full Booking lifecycle, inventory, costing, approvals, shares/PDF/mobile layouts and simulated WhatsApp |
| `bun run test:auth-emulator` | **1 passed, 0 failed, 3 assertions** | Final run 2026-10-17; real emulator-issued Firebase token resolves a canonical employee ID distinct from UID; employee lookup fixture is injected |
| `bun run lint` | **Passed** | Actual script is `tsc --noEmit`; this is type checking, not a linter |
| `bun run build` | **Passed** | Frontend and backend bundles built; Vite large-chunk warning remains |
| `bun run test:rules` | **5 passed, 0 failed** | Firestore emulator; unchanged rules cover inactive/unmapped identities, modern collection denial, voucher forgery, conversation deletion and audit actor/action restrictions |
| `bun run test:e2e:firebase` | **1 passed, 0 failed; 23.6 s** | Auth + Firestore emulators; seeded Sales login and authoritative workflow/navigation |
| `bun audit --json` | **Failed advisory check (exit 1)** | Current registry feed: 13 advisories, 0 critical, 6 high, 6 moderate, 1 low. Seven post-Sprint-3 records are non-reachable MCP optional/tooling paths or Vite development-server paths; see [the dependency security review](BBOS_DEPENDENCY_SECURITY_REVIEW.md) |
| `git diff --check` | **Passed during final review** | Git warns about normal Windows LF/CRLF conversion; no whitespace defects |
| Standalone formatter / ESLint | **Not run; no configured command** | Do not interpret TypeScript success as formatting/lint success |

Sprint 4 executed **762 passing checks** across the requested suites (700 + 56 + 5 + 1). The earlier standalone Auth-emulator run remains recorded separately. This is not a coverage percentage.

## Baseline and diagnostic failures

Baseline `bun test`: 651 passed, 1 skipped, 0 failed, 2,634 assertions, 652 entries across 43 files. Final passing count increased by 22. Four additional Firestore emulator cases were added but skipped locally. Five new test files were created; existing authorization, supplier-payable, customer-share and rule-source tests were also strengthened.

The first browser attempt produced 52 passes and four failures while source edits/HMR and session interruptions overlapped it. Failures involved occupancy navigation, optional activity navigation, Quote option setup and secure-share toast/navigation. After source editing stopped, the complete 56-case suite passed, including all four. The audit does not present that initial attempt as passing or establish HMR as the sole cause.

The first expanded unit run caught a stale source assertion expecting direct `pickupTime` rule handling. It was replaced with the stronger unconditional client denial assertion; full tests then passed. New rate HTTP tests initially used a draft/invalid Trip fixture; resource policy correctly denied it. The fixture now uses an assigned BOOKED Trip, preserving the actual authorization rule.

Sandbox execution blocked esbuild configuration reads, registry access and Firebase CLI's external settings file. Required retries outside the sandbox succeeded. A configured Java 27 runtime then executed both Firestore emulator suites successfully. Firebase CLI emitted expected local authentication/metadata and emulator shutdown warnings without affecting either result.

## New regression evidence

| File | Executed invariants |
|---|---|
| `tests/server/audit-operational-integrity.test.ts` | Cross-assignment/inactive denial, idempotency authorization, concurrent cancellation/dispatch, audit rollback, cancellation validation/note retention, one linked voucher set, UUID collision protection, stale confirmation and partial-set rejection |
| `tests/server/audit-production-boundaries.test.ts` | Actual Express denies backend artifacts; actual Firestore SDK rejects old undefined shape and accepts normalized plain records; native sentinels/timestamps preserved |
| `tests/server/audit-rate-projection.test.ts` | Real routers, policy and costing engines hide generic amount/breakdown aliases from assigned Operations; retain scoped Sales/Reservations/Accounts costs; unknown roles fail closed; production config subprocesses disable demo |
| `tests/client/api-pagination.test.ts` | All pages loaded with filters retained; invalid or repeated cursor rejected |
| `tests/server/customer-directory.test.ts` | Customer OWN/TEAM/ALL and cross-scope denial, missing metadata, canonical employeeId instead of UID, protected owner/team/employee/role/financial input rejection, explicit DTO |
| `tests/server/firestore-topology.test.ts` | Explicit named/default selection, browser/Admin parity, a shared seeded nonproduction fixture, missing/invalid production configuration, project mismatch, and rules/index database targeting |
| `tests/server/financial-exception-workflows.test.ts` | Versioned and idempotent amendments, TEAM/OWN/ASSIGNED/ALL denials, immutable snapshots, conservative substitution approval, refund calculation/dual authority/paid ledger, original-owner commission earning/reversal/settlement, and A01 direct-client deny rules |
| `tests/server/audit-operational-integrity.test.ts` (Sprint 1 extension) | Booking-scoped voucher list denies inactive/unmapped/unassigned actors and excludes supplier cost, buying price, profit, margin and internal notes |
| `tests/security/firestore-rules-emulator.integration.test.ts` | **5 emulator tests passed:** inactive/unmapped/mismatched identity denial, modern collection denial, voucher forgery denial, conversation delete restriction, actor binding and reserved audit actions |
| Existing suites extended | Nested financial alias projection, targeted supplier settlement independent of capped global listings, nested public share fields removed; rule assertions updated to enforce stronger restrictions |

## Build measurements

Sprint 4 Vite: 1,793 transformed modules; frontend JS **1,449.14 kB**, gzip **355.81 kB**; CSS **71.88 kB**, gzip **12.25 kB**. Backend artifacts remain outside the served public asset directory.

Baseline frontend JS: 1,738.31 kB / 427.35 kB gzip. Production demo exclusion reduced output, but a >500 kB chunk warning remains. No latency/load benchmark was run.

## Reproducibility and release prerequisites

Use the committed Bun lockfile and compatible local runtimes. Firestore tests require a Java runtime on `PATH`, a loopback emulator and the synthetic `demo-bbos-audit-rules` project; they refuse non-loopback hosts. Do not point seed/clear operations at production.

Temporary local evidence logs are named `bbos-audit-final-tests.log`, `bbos-audit-final-e2e.log`, `bbos-audit-final-build.log`, `bbos-audit-final-auth.log`, `bbos-audit-rules.log`, `bbos-audit-firebase-e2e.log` and `bbos-audit-dependencies.log` under the user's temporary directory. Firebase CLI debug output can include environment values, so raw logs are not committed. This report records the relevant nonsecret outcomes.

No branch can be called production-ready on these results alone: authoritative production database selection, deployed rules/indexes/IAM, historical data, live provider integration, load, full accessibility and the documented A01 business-policy configuration remain outside verified coverage.

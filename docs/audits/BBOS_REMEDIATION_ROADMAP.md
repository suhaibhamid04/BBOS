# BBOS remediation roadmap

Reviewed 2026-10-17; Sprints 1–3 updated 2026-10-20. The current branch contains safe source repairs, not a production deployment. Findings and acceptance criteria below distinguish engineering work from decisions requiring approval.

## Completed in Production Readiness Sprint 1

- **S07/B06 source closure:** inventoried direct browser Firestore consumers; added scoped customer and Booking-voucher reads; reused M3/M6 APIs; retired obsolete task/company/global-voucher paths; removed the generic client repository; denied all production client collection access; removed UID-keyed rule helpers. OWN/TEAM/ALL/ASSIGNED, inactive/unmapped, forged-authority, pagination and financial projection tests pass. Five rule-emulator cases pass; deployment remains release work.

## Completed in Production Readiness Sprint 2

- **B05 source closure:** introduced shared project/database normalization; browser and Admin now select the exact same explicit database; production missing/invalid/mismatched topology fails startup; QA emulator, deployment-config generation and the Lead-team migration identify their target database. The production database remains undecided pending approved inspection, and no data/config/deployment operation occurred.

## Immediate

1. **Approve and validate the production topology (B05 production gate).** Inspect default and named databases, select the authoritative dataset, then follow `docs/firestore-topology.md`. **Acceptance:** reviewed inventory/backup/decision, approved runtime configuration, rules/index target review, nonproduction validation, rollback rehearsal and post-change checks. **Effort:** M-L. **Hard stop:** production inspection/configuration/migration/deployment approval.

2. **Run the local Firestore checks — CLOSED.** `test:rules` passes 5/5 and `test:e2e:firebase` passes 1/1 with loopback emulators. Production topology validation and reviewed rule/index deployment remain under item 1; A03 still tracks automating these gates in CI. **Effort:** S-M.

3. **Triage and patch dependencies (S08) — CLOSED.** Nine advisories were safely remediated; six were proven non-reachable or isolated to trusted development tooling with owners and controls. All practical and Firebase tests pass, and the before/after audit is recorded in [the dependency security review](BBOS_DEPENDENCY_SECURITY_REVIEW.md). **Effort:** M.

4. **Define and implement financial exception workflows (A01) — CLOSED IN SOURCE.** Versioned amendments, conservative supplier substitutions, calculated/dual-authority refunds with an immutable paid ledger, and original-owner commission earning/reversal/settlement are transactional and audited. Focused and full regressions pass. Production policy owners still need to configure cancellation deductions and approve any broader substitution range or partial-refund commission formula; current behavior fails closed. See [the A01 workflow review](A01_FINANCIAL_EXCEPTION_WORKFLOWS.md). **Effort:** L.

## Next

| Work | Acceptance criteria | Effort / dependencies |
|---|---|---|
| Scalable financial/approval registries (A02, B04 residual) | >200 Bookings, >500 snapshots/inventory rates, >1,000 services and >2,000 payment fixtures produce complete paginated results or explicit bounded failure; no partial monetary total; overlap checks never silently miss conflicting rates | M-L; query/index design |
| CI and meaningful static checks (A03) | Pinned Bun/Java/browser toolchain, unit/HTTP/rules/typecheck/build on every change; browser smoke/full policy; real lint command; test types checked | M; CI platform choice |
| Stronger API schemas and projections (A05) | Malformed/null/array/oversized/nonfinite inputs give documented 4xx; safe error mapping; full allowlisted Trip projections; regression for unknown financial aliases | M; version public contracts where necessary |
| Correct AI tool contract (B10) | Response explicitly says validation-only or a real approved executor produces verified side effects, idempotency and audit; no false success | M; business/API design review |
| Frontend concurrency and accessibility (B08 residual, A06) | Delayed auth/data response tests across logout/user change; keyboard dialogs with Escape, Tab containment and return focus; named controls and error announcements; manual screen-reader review | M; reusable component scope |

## Later

- Split eager views and load scoped domain data on demand. Measure bundle size, initial reads, payload and p95 interaction latency before/after using representative data. Keep the dependency graph comprehensible.
- Extract DataContext and large Trip/Quote workflows by domain boundary with behavior-preserving tests. Avoid merging distinct Reservations/Sales/Operations authority just because code looks similar.
- Add backup/restore exercises, observability and provider deadline/retry tests in a controlled environment. Verify public-route rate limiting and deployment headers with the actual proxy configuration.
- Remove dead code only after static references, dynamic imports, route registration, scripts, tests and migration usage prove it unused. Sprint 1 applied that proof before removing the generic repository and obsolete Company/global Voucher screens.

## Release/approval boundaries

The user explicitly required stopping before production migrations/configuration changes, destructive data operations, real production credentials, materially risky dependency upgrades, API breaks and ambiguous business-rule changes. Those items were investigated and recorded; no such operation was performed.

Source rule tightening, transaction changes and financial projection fixes need normal code review plus production topology and deployment validation. Existing incomplete voucher records require reviewed reconciliation; the new service refuses to disguise them as a successful generation. A global supplier summary may now return 503 at its safety cap; individual settlement remains available. These are material release behaviors to communicate to operators.

The four immediate actions above are the highest-value remaining work. A passing demo/browser suite does not resolve their production dependencies.

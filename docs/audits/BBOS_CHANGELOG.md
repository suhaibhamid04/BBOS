# BBOS audit changelog

Branch: `audit/bbos-comprehensive-remediation`. Baseline: `4997f47`. Audit window: 2026-10-16 to 2026-10-17; remediation sprints through 2026-10-20. Application code and dependency resolution changed; production configuration did not.

## C1 — Server authorization, persistence and financial integrity

Commit: `8269b3b` — `fix(security): enforce operational scope and atomic financial workflows` (37 files).

- Central BOOKING dispatch/voucher actions and assignment checks; authorization precedes idempotency.
- Atomic lifecycle and voucher state/link/audit writes; canonical actors; preserved cancellation notes; UUID identifiers; real service-confirmation validation; explicit incomplete-voucher error; correct demo voucher storage.
- Firestore-safe optional plain-object serialization on conversion/payment/voucher writes.
- Shared supplier/profit field classification and explicit operational calculator projection; nested public transport-day projection.
- Modern client Firestore denials; active identity and legacy audit actor binding; corrected conversation delete grant.
- Restricted public static assets; JSON 404 for unknown APIs; production demo-mode guard.
- Targeted supplier payable/settlement reads and explicit registry overflow failure.
- New security/workflow/persistence/HTTP regressions; stronger existing projection/rule assertions; executable local rules command. Generated test artifacts ignored.

Findings: S01-S06, S09; B01-B04, B09. Source rules remain unverified in the emulator because Java is missing.

## C2 — Client loading and session reliability

Commit: `66f4210` — `fix(client): load complete registries and guard stale sessions` (4 files).

- Follow API cursors, preserve filters and reject nonadvancing pagination.
- Abort/discard obsolete data loads, replace empty arrays and protect authoritative identity from stale responses.
- Prevent duplicate sign-in submission; label credentials and announce errors.
- Added pagination regressions; retained established demo behavior.

Findings: B07/B08. No full component-level delayed-auth or assistive-technology certification is claimed.

## C3 — Evidence and remaining-work documentation

Commit: the documentation commit containing this report, titled `docs(audit): record findings, verification and remediation roadmap`. Its hash is available in `git log -1` when checking out the audit branch at completion; it is not self-embedded in its own content.

- Eight audit deliverables, complete API route index and source/verification limitations.
- Historical handoff and architecture documents marked as historical and linked to the current audit.
- No dead code/files removed without proof. No migrations, production data reconciliation, provider sends or deployment occurred.

## C4 — Production Readiness Sprint 1: S07/B06 boundary closure

Commit: `a459d8e` — `fix(security): close legacy Firestore client boundary` (31 files).

- Added `/api/customers` list/detail/create/update with canonical OWN/TEAM/ALL scope, protected-field rejection, explicit PII DTOs and cursor pagination; customer matching/linking now applies the same scope.
- Reused M6A/M6B Lead conversation APIs, replaced legacy tasks with M3 Lead follow-ups, and added assignment-checked `GET /api/bookings/:bookingId/vouchers` with an allowlisted Voucher DTO.
- Migrated production DataContext loading to authenticated APIs; removed the generic browser Firestore repository and proved the Company/global Voucher views had no remaining route, import or dynamic consumer before deletion.
- Tightened every enumerated Firestore collection, including audit logs, historical services, conversion markers and Booking financial snapshots, to direct-client deny. Removed the UID-keyed rule helpers; no rule deployment occurred.
- Added/extended customer, identity, pagination, voucher assignment/projection and deny-rule regressions. Final Sprint 1 results: 680 unit/service/HTTP passes, 56 Chromium passes, TypeScript/build/diff checks pass. Firestore suites are **BLOCKED_NOT_RUN** because Java is unavailable.

Findings: S07 and B06 closed in source. B05 was not changed and did not block source closure; deployment topology remains open.

## C5 — Production Readiness Sprint 2: B05 topology closure

Commit: `011bdcf` — `fix(config): unify Firestore database topology` (17 files).

- Added one normalized Firestore topology contract for browser, Admin, emulator fixtures, deployment config generation and migration utilities.
- Removed the checked-in browser-only database literal; both SDK adapters now receive the exact configured ID, including explicit `(default)` handling.
- Added production startup failure for missing, invalid or project-mismatched configuration; safe startup logs expose only topology identifiers and runtime mode.
- Added named/default/parity/fail-closed tests and retained canonical employee, inactive/unmapped identity and S07 direct-client denial regressions.
- Documented Firebase CLI database targeting plus the production inventory, backup, migration, validation and rollback hard stop. No production inspection, data movement, config change or deployment occurred.

Finding: B05 closed in source. `PRODUCTION_DATABASE_SELECTION_REQUIRES_APPROVAL`; B05 is not production-closed.

## C6 — Production Readiness Sprint 3: S08 dependency advisory closure

- Inventoried direct, transitive, runtime, browser, build and Firebase CLI dependency paths and classified all 15 original audit records by vulnerable operation and BBOS reachability.
- Applied compatible patches for grpc-js's supported Admin copy, proxy-addr, source-map-js and brace-expansion. Added a same-major `qs` 6.16.0 override because public Express query parsing reaches both affected conditions while Express 4's patch range excludes the fix.
- Reduced the live audit from 15 advisories (1 critical, 7 high, 5 moderate, 2 low) to 6 (0 critical, 3 high, 2 moderate, 1 low). Remaining records are non-invoked gRPC server/UUID buffer APIs or Firebase CLI-only paths with documented controls.
- Passed 687 unit/service/HTTP tests, 56 Chromium tests, 5 Firestore rule tests and 1 Firebase-backed browser test. WhatsApp server and browser flows pass; Firestore rules were not weakened.

Finding: **S08 closed**. The audit still exits 1 and no zero-vulnerability claim is made; see [the dependency security review](BBOS_DEPENDENCY_SECURITY_REVIEW.md).

## C7 — Production Readiness Sprint 4: A01 financial exception workflows

- Added server-authoritative versioned amendments with immutable before/proposed/approved snapshots, TEAM/ALL approval, separate idempotent application, and rejection without Booking mutation.
- Added assigned Reservations supplier substitution with exact-category/exact-cost automatic policy, ALL-scope approval for material changes, preserved frozen economics, and supplier discrepancy evidence.
- Added cancellation refund calculation, request, dual approval, explicit Accounts payment, and a deterministic immutable refund ledger without rewriting customer payments.
- Added original-Sales-owner commission earning at confirmation, full cancellation reversal, authorized adjustments and explicit settlements with immutable ledger history and employee-specific commission configuration.
- Added authenticated API routes, a compact role-filtered Booking detail UI, explicit Firestore client-deny blocks for all A01 collections, and complete audit events.
- Passed 700 unit/service/HTTP tests, 56 Chromium tests, 5 Firestore rule tests and 1 Firebase-backed E2E; TypeScript, build and diff checks pass.

Finding: **A01 closed in source**. Production cancellation deductions, a broader supplier substitution range, and any partial-refund commission reversal formula remain explicit business-policy/configuration decisions. See [the A01 workflow review](A01_FINANCIAL_EXCEPTION_WORKFLOWS.md).

## Verification and review

Original audit verification recorded 673 unit/service/HTTP passes, 56 Chromium passes and one Auth-emulator pass. Sprint 3 records 687 unit/service/HTTP passes, 56 Chromium passes, 5 Firestore rule passes and 1 full Firebase browser pass; TypeScript/build/diff checks pass. The dependency audit remains nonclean with six explicitly dispositioned residual advisories. Details and initial failed attempts are retained in [test results](BBOS_TEST_RESULTS.md).

Security/financial diffs were re-reviewed for authorization before idempotency, canonical IDs, transaction read/write ordering, audit atomicity, role-specific financial distinctions and client access paths. Changes are ready for code review, not an assertion of production readiness.

## Release-visible behavior

- Unassigned/inactive operational actors now receive denial.
- Incomplete historical voucher links return 409 and require reviewed reconciliation.
- Oversized global supplier summaries return 503 rather than incomplete financial totals; individual settlement reads remain targeted.
- Production ignores demo opt-in flags.
- Backend bundles/source maps are no longer public assets.
- Firestore deployment must be coordinated with the API/client version and successful executable rule tests. Legacy access/identity source paths and B05 source selection are closed; the authoritative production database decision remains explicitly open.

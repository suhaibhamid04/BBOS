# BBOS audit changelog

Branch: `audit/bbos-comprehensive-remediation`. Baseline: `4997f47`. Audit window: 2026-10-16 to 2026-10-17. Application code changed; dependency versions/lockfile and production configuration did not.

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

## Verification and review

Final unit/service/HTTP tests: 673 passed; Chromium: 56 passed; Auth emulator: 1 passed; TypeScript/build passed. Four new Firestore regression cases and the full Firebase browser suite remain blocked by absent Java. Dependency audit remains nonclean (15 advisories). Details and initial failed attempts are retained in [test results](BBOS_TEST_RESULTS.md).

Security/financial diffs were re-reviewed for authorization before idempotency, canonical IDs, transaction read/write ordering, audit atomicity, role-specific financial distinctions and client access paths. Changes are ready for code review, not an assertion of production readiness.

## Release-visible behavior

- Unassigned/inactive operational actors now receive denial.
- Incomplete historical voucher links return 409 and require reviewed reconciliation.
- Oversized global supplier summaries return 503 rather than incomplete financial totals; individual settlement reads remain targeted.
- Production ignores demo opt-in flags.
- Backend bundles/source maps are no longer public assets.
- Firestore deployment must be coordinated with the API/client version and successful executable rule tests. Legacy access/identity/database issues remain explicitly open.

# BBOS bug register

Reviewed 2026-10-16 to 2026-10-17. Baseline `4997f47`. Security findings are tracked separately as S01-S09; architecture/workflow gaps are A01-A06. Counts in the executive report do not double-count cross-references. Commit batches are resolved in [the changelog](BBOS_CHANGELOG.md).

## B01 — Booking lifecycle lost updates and partial audits

- **Priority / status / confidence:** P1 / fixed / high, confirmed.
- **Files:** [bookingLifecycleService.ts](../../server/services/bookingLifecycleService.ts), [demoBookingWorkflow.ts](../../server/services/demoBookingWorkflow.ts).
- **Root cause / trigger:** Dispatch/cancel read a Booking, wrote its state, then separately wrote audit history. Concurrent transitions could use the same old state. An audit failure left a committed transition; cancellation overwrote guest notes.
- **Impact:** Cancelled bookings could be restored by a stale dispatch, and durable state could lack its audit evidence.
- **Reproduction:** Start cancel and dispatch together; inject failure at audit write; cancel a Booking containing dietary notes.
- **Fix:** Read, authorize, validate, write and audit in one storage transaction. Preserve existing guest notes; validate cancellation reason type/length; use canonical employee IDs and UUID audit IDs.
- **Test:** `audit-operational-integrity.test.ts` checks no resurrection, rollback, note preservation and invalid reason rejection. Existing lifecycle cases pass.
- **Commit / effort / dependencies:** C1 / M / Firestore transaction support; executable production-adapter concurrency still needs the emulator.

## B02 — Inconsistent voucher sets

- **Priority / status / confidence:** P1 / fixed / high, confirmed.
- **Files:** [voucherService.ts](../../server/services/voucherService.ts), [demoBookingWorkflow.ts](../../server/services/demoBookingWorkflow.ts), [bookings.ts](../../server/routes/bookings.ts).
- **Root cause / trigger:** Read/check/create/link/audit were separate operations. Two requests could both see no vouchers; a later write failure left partial links. Timestamp plus four-digit random IDs could collide. The demo route selected the production voucher provider. A Booking's allConfirmed flag could disagree with actual service states.
- **Impact:** Duplicate or overwritten vouchers, misleading success on incomplete records, and demo calls requiring real persistence.
- **Reproduction:** Concurrent generation; failure at audit; repeated random/clock values for multiple services; stale progress flag; seeded partial vouchers.
- **Fix:** Transactional linked generation; correct demo adapter; UUID IDs; inspect actual service states; reject incomplete historical voucher sets with 409 for reconciliation.
- **Test:** Concurrent callers receive the same set; injected failure rolls back; two services remain distinct under frozen clock/legacy randomness; stale states reject. Existing lifecycle tests retained.
- **Commit / effort / dependencies:** C1 / M / historical partial sets are not repaired automatically; that would require a reviewed data operation.

## B03 — Undefined optional fields break Firestore writes

- **Priority / status / confidence:** P1 / fixed / high, confirmed.
- **Files:** [firestoreData.ts](../../server/storage/firestoreData.ts), [conversionStorageProvider.ts](../../src/services/conversion/conversionStorageProvider.ts), [paymentStorageProvider.ts](../../src/services/payment/paymentStorageProvider.ts), voucher writes.
- **Root cause / trigger:** In-memory providers JSON-cloned records and silently removed undefined properties; Admin Firestore rejects those properties by default. Optional notes/demo/rate fields therefore behaved differently outside demo.
- **Impact:** Otherwise valid conversion, payment or voucher operations could fail only with real persistence.
- **Reproduction:** Construct an actual Admin SDK batch with an optional undefined object property; local SDK validation throws before RPC.
- **Fix:** A narrow storage serializer removes undefined plain-object properties recursively, preserves native Firestore values, and retains invalid array positions so malformed arrays still fail.
- **Test:** `audit-production-boundaries.test.ts` invokes the actual SDK serializer without credentials/network and checks Timestamp, FieldValue, null, immutability and invalid array rejection.
- **Commit / effort / dependencies:** C1 / S / no global ignoreUndefinedProperties setting and no dependency change.

## B04 — Supplier balances derived from truncated registries

- **Priority / status / confidence:** P1 / fixed for individual settlements; global summary safely bounded / high, confirmed.
- **Files:** [supplierPayableService.ts](../../server/services/supplierPayableService.ts).
- **Root cause / trigger:** Individual details used a global scan capped independently at 200 Bookings, 500 snapshots, 1,000 records per service collection and 2,000 supplier payments. An older Booking could disappear; omitted verified payments inflated outstanding balances.
- **Impact:** Incorrect Accounts settlement views or false not-found responses as data grew.
- **Reproduction:** Make global registry/payment listing empty or unavailable while the targeted source bundle and obligation ledger contain a verified payment.
- **Fix:** Read the specific Booking/snapshot/services and obligation payments in a transaction. Global summaries now read cap+1 and reject overflow with `PAYABLE_LIST_CAPACITY` rather than report partial money totals.
- **Test:** `supplier-payables.test.ts` proves both detail and Booking settlement remain correct independently of global listings. Existing anti-self-verification and amount tests pass.
- **Commit / effort / dependencies:** C1 / M / paginated scalable summaries remain A02. No claim of unlimited reporting capacity.

## B05 — Different Firestore databases selected

- **Priority / status / confidence:** P1 / **closed in source** / high source confidence; production target approval and validation remain.
- **Files:** [firebase.ts](../../src/lib/firebase.ts), [firebaseAdmin.ts](../../server/firebaseAdmin.ts), [firestoreTopology.ts](../../shared/firestoreTopology.ts), [topology guide](../firestore-topology.md).
- **Root cause / trigger:** The checked-in browser config selects a named database; Admin initialization calls default `getFirestore()`. Emulator mode uses the default database for both and therefore does not reproduce this deployment distinction.
- **Impact:** Employees/data may be visible to one layer but missing from the other; rules/index deployment may target the wrong database.
- **Reproduction:** Compare database selection in source; then, in an approved nonproduction project, seed one known record in the intended database and assert both layers resolve it. No live project was queried here.
- **Fix / test:** `FIREBASE_PROJECT_ID` and `BBOS_FIRESTORE_DATABASE_ID` now feed browser, Admin, startup validation, QA emulator fixtures, rules/index config generation and migration confirmation. Both SDKs receive the normalized ID explicitly. Tests cover named/default selection, browser/Admin parity, missing/invalid production config, project mismatch and the existing active/inactive/unmapped canonical identity cases.
- **Commit / effort / dependencies:** Sprint 2 / M-L / `PRODUCTION_DATABASE_SELECTION_REQUIRES_APPROVAL`; no data, live config, rules or indexes were changed.

## B06 — Employee identity mismatch in remaining client rules

- **Priority / status / confidence:** P1 / **closed in source** / high, confirmed; deployment verification remains.
- **Files:** [auth.ts](../../server/middleware/auth.ts), [firestore.rules](../../firestore.rules), [DataContext.tsx](../../src/context/DataContext.tsx), [customers.ts](../../server/routes/customers.ts).
- **Root cause / trigger:** API identity supports a stable employeeId distinct from Firebase UID, while legacy rules loaded `employees/{request.auth.uid}`.
- **Fix:** Production browser workflows no longer use direct Firestore authorization. All client grants are deny-all, the UID-keyed rule helpers were removed, and authenticated APIs resolve exactly one active canonical employee before applying resource policy. Customer ownership, Lead ownership, voucher assignment and audit actors use employeeId.
- **Test:** Identity middleware rejects unmapped, inactive, duplicate and invalid-role identities; customer tests prove UID is not the owner key and reject forged employee/owner/team fields; voucher tests reject inactive/unmapped/unassigned actors. Static rule tests prove no `request.auth.uid` employee lookup remains. Firestore emulator execution is **BLOCKED_NOT_RUN** because Java is unavailable.
- **Commit / effort / dependencies:** Sprint 1 / L / no B05 production database decision or data movement was needed for source closure. Rule deployment remains a separate reviewed release action.

## B07 — First-page-only data loading

- **Priority / status / confidence:** P1 / fixed / high, confirmed.
- **Files:** [DataContext.tsx](../../src/context/DataContext.tsx), [readApiPages.ts](../../src/services/auth/readApiPages.ts).
- **Root cause / trigger:** Production registry loading consumed one `data` array while list APIs returned `hasMore` and `nextCursor`. Records beyond the first page disappeared from client views.
- **Impact:** Missing Trips, Quotes or Bookings and misleading dashboard/search totals.
- **Reproduction:** Return two list pages, preserving filter parameters; check whether the second page is loaded.
- **Fix / test:** Follow scoped cursors, preserve query parameters, reject malformed/repeated cursors. `api-pagination.test.ts` checks full traversal and failure behavior.
- **Commit / effort / dependencies:** C2 / S / this repairs completeness; eager retrieval of all pages still has a scaling cost (A02).

## B08 — Stale frontend state and sign-in usability

- **Priority / status / confidence:** P2 / fixed / high source confidence, partial runtime verification.
- **Files:** [AuthContext.tsx](../../src/context/AuthContext.tsx), [DataContext.tsx](../../src/context/DataContext.tsx).
- **Root cause / trigger:** Earlier async identity/data requests could finish after a new identity or cleanup; empty responses did not always replace old lists. Sign-in allowed another submission while its promise was pending and used placeholders without labels.
- **Impact:** Stale employee/data presentation, duplicate sign-in calls and poor form accessibility. Server authorization still governs requests; this is not evidence of server-side impersonation.
- **Fix:** Generation guard for identity state, AbortController/disposed guard for list loading, unconditional empty-list replacement, synchronous submission guard, labels/autocomplete and announced errors.
- **Verification:** TypeScript and full browser suite pass; pagination behavior has executable tests. Delayed React identity/logout interleavings and assistive-technology behavior were source-reviewed, **not separately exercised by a new component test**.
- **Commit / effort / dependencies:** C2 / M / full accessibility coverage remains A06.

## B09 — Production demo-store mismatch

- **Priority / status / confidence:** P1 / fixed / high, confirmed.
- **Files:** [config.ts](../../src/config.ts), authentication/provider consumers.
- **Root cause / trigger:** Authentication prohibited demo bypass when NODE_ENV=production, but APP_CONFIG could still enable in-memory providers from demo flags.
- **Impact:** A genuinely authenticated production employee could interact with ephemeral demo data and lose writes at restart.
- **Reproduction / fix:** Launch config in production with both demo flags true. Demo selection now requires a nonproduction runtime/build as well as explicit opt-in.
- **Test:** Separate Bun subprocesses assert production=false and development=true with identical opt-in flags. Production build and development browser flows pass.
- **Commit / effort / dependencies:** C1 / S / no deployment environment changed.

## B10 — Tool execution success is misleading

- **Priority / status / confidence:** P2 / open / high, confirmed.
- **Files:** [api.ts](../../server/routes/api.ts), [toolGateway.ts](../../server/ai/toolGateway.ts).
- **Root cause / trigger:** `POST /api/tools/execute` validates a tool name/role and returns `EXECUTED_SAFELY`; it does not dispatch domain work or honor a required approval through an execution transaction.
- **Impact:** Consumers may believe a business action occurred. This is a stub, not evidence that the named dangerous action actually runs.
- **Reproduction:** Trace a permitted call: no executor is invoked before the success response.
- **Fix proposal / test:** Specify a validation-only response or implement a versioned, approved execution contract with audit/idempotency. Add tests asserting real side effects or explicitly nonexecuting status.
- **Commit / effort / dependencies:** Deferred / M / public response semantics and intended AI business authority require review; no API-breaking behavior introduced.

## Verification interpretation

In-memory rollback/concurrency tests protect service invariants but do not prove Firestore indexes, deployed rules, transaction limits or IAM. Those are release checks. [Firebase transaction documentation](https://firebase.google.com/docs/firestore/manage-data/transactions) informed the read-before-write and atomic-commit review.

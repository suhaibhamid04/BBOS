# BBOS security register

Audit window: 2026-10-16 to 2026-10-17. Branch: `audit/bbos-comprehensive-remediation`. Baseline: `4997f47`.

Severity is application priority, not a package advisory's CVSS score. “Fixed” means repaired in this branch, not deployed. Firestore rule changes have static checks and five passing executable emulator regressions. No production data, credentials or configuration were accessed or changed. Effort: S = focused patch; M = several coordinated changes; L = migration/workflow project.

## S01 — Operations assignment bypass

- **Priority / confidence / status:** P1 / high / confirmed, fixed.
- **Attack path / role / data:** An active Operations employee changes the booking ID in dispatch or voucher generation, including an idempotent request for an already-processed booking. Previously a role check admitted the request without checking assignment; dispatch also returned the raw Booking.
- **Evidence:** [bookingLifecycleService.ts](../../server/services/bookingLifecycleService.ts), [voucherService.ts](../../server/services/voucherService.ts), [bookings.ts](../../server/routes/bookings.ts). Compare with baseline `4997f47`.
- **Exploitability / impact:** Authenticated horizontal privilege escalation; unauthorized workflow mutation, voucher enumeration and commercial field disclosure.
- **Remediation:** Central BOOKING assignment authorization before every state/idempotency branch; active canonical employee identity; role-specific Booking DTO at dispatch.
- **Verification:** `audit-operational-integrity.test.ts` exercises assigned/unassigned/inactive actors and repeated dispatch/voucher calls; existing authorization and Booking query suites exercise projection. Effort M; dependency: authoritative assignment metadata. No production backfill performed.

## S02 — Direct client access bypassed modern APIs

- **Priority / confidence / status:** P1 / high / confirmed, fixed in source; emulator verification and deployment outstanding.
- **Attack path / role / data:** Direct browser SDK reads of Trips/itinerary and service collections bypassed API financial projection. Limited-field service writes could change another booking's confirmation/operational fields without parent assignment policy. Clients could forge voucher documents.
- **Evidence:** [firestore.rules](../../firestore.rules), compared against the scoped Trip, Booking, confirmation and voucher services. A Firestore role-only grant cannot enforce the service's transactional state machine.
- **Exploitability / impact:** Authenticated users permitted by the old role rules could bypass resource scope; supplier confidentiality and service integrity were at risk.
- **Remediation:** Deny direct client reads/writes to modern Trips, itinerary days, booking service records and vouchers. Established API-backed flows retain server access through Admin SDK. Sprint 1 also removed the remaining legacy browser readers under S07.
- **Verification:** Existing source-rule assertions now require unconditional denial; new `firestore-rules-emulator.integration.test.ts` attempts real reads/updates and forged voucher writes for Operations and Admin. **These emulator cases have not run.** Effort M; release dependency: successful emulator suite and coordinated rule deployment.

## S03 — Inactive and unmapped Firebase identities

- **Priority / confidence / status:** P1 / high / confirmed, fixed in source and superseded by the complete direct-client deny boundary; executable verification pending.
- **Attack path / role / data:** Legacy collections using `isAuthenticated()` admitted any signed-in Firebase account; the helper previously checked only `request.auth != null`. Employee deactivation did not revoke these rule grants.
- **Evidence:** [firestore.rules](../../firestore.rules), [auth.ts](../../server/middleware/auth.ts). API authentication already requires an active employee, so the two boundaries disagreed.
- **Exploitability / impact:** A valid Firebase account without current BBOS employment could read or change legacy conversations/tasks and other broadly granted collections.
- **Remediation:** Sprint 1 removed all production client grants, including financial snapshots and conversion markers. Production access now resolves the active canonical employee through authenticated APIs; Firestore rules do not use UID-keyed employee documents.
- **Verification:** API identity tests reject absent, inactive, duplicate and invalid-role mappings. Passing executable rule tests cover absent, inactive, mismatched and anonymous identities and the deny-all result.

## S04 — Alternate supplier-cost exposure

- **Priority / confidence / status:** P1 / high / confirmed, fixed.
- **Attack path / role / data:** Assigned Operations could call activity/transport calculators on an operational Trip and recover supplier prices from `totalAmount` and nested breakdowns, even when `supplierCost` was removed. Accommodation supplement amounts and legacy Trip aliases were additional projection gaps.
- **Evidence:** [financialGuard.ts](../../server/middleware/financialGuard.ts), [resourceDto.ts](../../server/authorization/resourceDto.ts), [financialFields.ts](../../server/authorization/financialFields.ts), the three inventory route files.
- **Exploitability / impact:** Read-only authenticated financial disclosure. An OWN/TEAM/ASSIGNED decision does not itself authorize every financial field.
- **Remediation:** Explicit operational metadata projection for supplier calculators; share the known supplier/profit field classification between existing redactors. Scoped Sales and Reservations retain their established cost visibility; generic customer `totalAmount` is not globally removed.
- **Verification:** Real Express router/policy/calculation/projection tests in `audit-rate-projection.test.ts` verify hidden amounts for assigned Operations and preserved values for scoped Sales, Reservations and Accounts. Authorization-policy regression verifies nested legacy aliases. Effort M. Residual: generic Trip denylist requires ongoing schema discipline (A05).

## S05 — Public transport-day passthrough

- **Priority / confidence / status:** P2 / high / confirmed projection defect, fixed.
- **Attack path / data:** A stored customer snapshot containing extra financial/internal fields inside `transport.serviceDays` was copied wholesale into a public token response. An attacker cannot directly write these snapshots; exposure depends on stored schema drift/imported fields.
- **Evidence:** [customerShareProjection.ts](../../src/services/quote/customerShareProjection.ts) used `{ ...day }` inside an otherwise explicit projection.
- **Impact / exploitability:** Conditional public disclosure of fields accidentally placed in that nested object; no demonstrated leak from currently deployed data.
- **Remediation:** Enumerate the existing customer-facing day fields and copy only those.
- **Verification:** `customer-share.test.ts` seeds nested supplier/future internal fields, exercises share creation and public opening, and proves they disappear while the itinerary title survives. Effort S; no migration required.

## S06 — Public backend build artifacts

- **Priority / confidence / status:** P1 / high / confirmed, fixed.
- **Attack path / role / data:** An unauthenticated GET of `/server.js` or `/server.js.map` reached Express static serving of the entire `dist` directory. The build puts backend code and its source map there.
- **Evidence:** [server.ts](../../server.ts), [package.json](../../package.json); [frontend.ts](../../server/frontend.ts) now constrains the public root.
- **Exploitability / impact:** Direct disclosure of server implementation and source-map source content; this audit did not find or claim embedded production secrets.
- **Remediation:** Serve only `dist/assets` plus the SPA HTML fallback; reject other file paths. Unknown API paths return JSON 404 rather than SPA HTML.
- **Verification:** `audit-production-boundaries.test.ts` starts real Express, confirms SPA/customer deep links and assets, and denies direct/encoded backend artifact paths. Production build passed. Effort S.

## S07 — Remaining legacy direct-access scope

- **Priority / confidence / status:** P1 / high / confirmed, **closed in source**; rule deployment and emulator execution remain release checks.
- **Former attack path / data:** Collection-level browser grants exposed global customer PII, conversations/messages, tasks, vouchers and historical inventory/service documents without OWN/TEAM/ASSIGNED scope; old schemas could contain supplier costs, margin or profit aliases.
- **Remediation:** Production DataContext now loads domain data only through authenticated APIs. Customer list/detail/create/update uses canonical OWN/TEAM/ALL policy, cursor pagination and an explicit DTO. Conversations use M6A/M6B Lead endpoints; follow-ups derive from M3 `nextFollowUpAt`; vouchers are read only under an authorized Booking and assigned Operations scope. Obsolete Company/global Voucher screens and the generic Firestore repository were removed after reference, route and dynamic-import searches. Historical inventory/service collections are no longer loaded by the browser.
- **Rules end state:** Every listed production collection, plus conversion markers and Booking financial snapshots, denies direct browser read/write. The only remaining browser Firestore mutations are two `APP_CONFIG.DEMO_MODE`-guarded itinerary mirrors; they are classified DEMO_ONLY and are unreachable in production mode.
- **Verification:** OWN/TEAM/ALL, cross-owner/team denial, missing metadata, inactive/unmapped identity, forged authority fields, pagination, assigned voucher scope and financial-alias projection tests pass. The 56-case Chromium suite and all five executable Firestore rule cases pass. No rules were deployed.

## S08 — Dependency advisories

- **Priority / confidence / status:** P1 triage priority / high / **S08 closed**.
- **Evidence:** The initial `bun audit` reported **15 advisories: 1 critical, 7 high, 5 moderate, 2 low**. Safe lockfile updates and one tested same-major `qs` override reduced this to **6 advisories: 0 critical, 3 high, 2 moderate, 1 low**.
- **Relevant paths:** Express query/proxy parsing; Firebase/Admin gRPC and UUID chains; Vite/PostCSS source maps; Firebase CLI FTP, file-watching and OpenTelemetry chains. The complete 15-row analysis is in [the dependency security review](BBOS_DEPENDENCY_SECURITY_REVIEW.md).
- **Exploitability:** Both `qs` advisories were confirmed reachable through public query parsing and remediated. The proxy finding was not exploitable under BBOS's default-disabled `trust proxy` setup and was patched. Remaining findings require absent gRPC server/UUID buffer APIs or are isolated to trusted local Firebase CLI inputs.
- **Remediation / effort:** Nine advisories remediated. Six are retained with explicit non-reachability or dev-tooling controls because supported transitive ranges do not contain their major fixes (and `braces` has no reported fixed release). All requested unit, build, browser, Firestore-rule and Firebase-backed regressions pass.
- **Sources:** [proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h), [grpc-js advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Their descriptions inform conditions, not an asserted exploit.

## S09 — Legacy deletion and audit identity

- **Priority / confidence / status:** P1 / high / confirmed, fixed in source and emulator verified; deployment pending.
- **Attack path / role / data:** The conversation `allow read, write` grant included delete, overriding the intended admin-only delete restriction because matching allows are additive. Legacy audit creation accepted another actorId and certain server workflow event names.
- **Evidence:** [firestore.rules](../../firestore.rules). API-generated audit events use canonical employee IDs; browser-generated audit claims did not enforce that binding.
- **Exploitability / impact:** Active employees could delete conversations and impersonate audit actors or authoritative transitions.
- **Remediation:** All direct conversation/message and audit-log access is denied. M6A/M6B and server business workflows create canonical records/audits through Admin SDK.
- **Verification:** Source regressions require deny-all blocks; five passing executable cases cover unauthorized deletion, audit writes and the wider retired collection set. Effort S.

## Abuse-case conclusions

| Attempt | Evidence and conclusion |
|---|---|
| Sales changes another owner's Trip/Quote/Customer ID | Modern APIs reject through OWN policy; missing metadata fails closed. Customer cross-owner/team tests and existing policy/domain tests cover this. |
| Sales directly invokes Admin routes | Route gates plus services reject employee/inventory/assignment mutations. Client navigation is not the control. |
| Operations recovers supplier cost elsewhere | Calculator, Trip alias, raw dispatch, voucher DTO and historical direct-client paths are restricted; role projections retain the Operations/Reservations distinction. |
| Reservations changes selling price/margin | Commercial mutation policy denies; discrepancy confirmation records differences without changing frozen economics. Approved amendment execution remains A01. |
| Employee supplies owner/team metadata | Modern creation derives identity server-side and service validators reject protected updates; legacy collection gaps are not covered by that claim. |
| Direct browser writes protected Booking/Quote/payment state | Existing denials retained; service/voucher gaps tightened. Executable rule verification remains required. |
| Token/public webhook bypass | Customer shares use hashed high-entropy capabilities, expiry and revocation. Meta POST validates raw-body HMAC. No live external send was made. |

The final source review found no new deliberate authentication bypass. It does not establish the security of deployment configuration, historical data or every future field. Firestore Admin SDK bypasses client rules, so server policy and rules must both be verified; see [Firebase rule structure](https://firebase.google.com/docs/firestore/security/rules-structure).

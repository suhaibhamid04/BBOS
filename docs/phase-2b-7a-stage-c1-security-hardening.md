# Phase 2B-7A Stage C.1 — Security Hardening

## Scope

Stage C.1 fixes the audited trip/quote list exposure, protects Trip cost
calculation before computation and Admin-SDK mutation, makes `employeeId`
authoritative in the prioritized legacy services, and reconciles Sales
financial visibility with resource authorization. It does not begin broad
Stage D migration.

## Scoped collection reads

`GET /api/trips` and `GET /api/quotes` resolve a Stage C query descriptor before
calling Firestore. The descriptor is translated to `where` clauses before
`.get()`:

| Resource / role | Firestore scope |
| --- | --- |
| Trip / Sales Executive | `assignedSalesEmployeeId == employeeId` |
| Trip / Sales Manager | `salesTeamId == principal.salesTeamId` |
| Trip / Reservations | assignment plus supported workflow statuses |
| Trip / Operations | assignment plus supported workflow statuses |
| Quote / Sales Executive | `salesEmployeeId == employeeId` |
| Quote / Sales Manager | `salesTeamId == principal.salesTeamId` |
| Founder/Admin/Accounts | ALL according to Stage C read policy |

Marketing has no raw list scope. Reservations and Operations have no raw Quote
scope. A principal missing required TEAM data is denied before Firestore is
queried. Records missing owner, team, or assignment fields do not match scoped
queries. Every returned record is re-checked by the resource policy; an
unexpected record fails the entire request instead of being filtered after a
broad read.

The endpoints accept an optional document-ID cursor and bounded `limit`
(1–100, default 20), returning `nextCursor` and `hasMore`. A cursor must itself
be authorized for the requesting scope.

Composite indexes were added for the new Trip and Quote scope/order
combinations. Index deployment must accompany these endpoint changes.

## Trip cost calculation boundary

`POST /api/trips/calculate-costs` now executes in this order:

1. validate the Trip ID;
2. load the authoritative stored Trip;
3. normalize stored owner/team/state context;
4. authorize `TRIP + UPDATE_COMMERCIAL`;
5. validate and calculate itinerary supplier cost;
6. calculate profit from the stored `totalSellingPrice`, never the request;
7. persist through Admin SDK only in production and only after authorization;
8. return the Stage C resource DTO.

Marketing, Operations, Reservations, another Executive, another-team Manager,
missing owner/team metadata, and unsupported workflow states fail before the
calculation loop and write. Demo mode performs no Firestore write.

## Canonical identity

`PaymentActor` and `ConversionActor` now carry explicit `employeeId`. The
compatibility `id` and `uid` fields remain, but the following use stable BBOS
identity:

- BookingQueryService assignment filters and IDOR comparisons;
- PaymentService booking assignment, self-verification, attribution, and audit
  actor fields;
- Quote conversion ownership fallback, conversion marker, financial snapshot,
  and audit actor fields.

Regression fixtures deliberately use different compatibility IDs and employee
IDs.

## Sales financial policy

Sales visibility is no longer expressed as an unconditional role-only denial:

- Sales Executive with an allowed `OWN` decision receives supplier cost,
  selling price, profit, and margin.
- Sales Manager with an allowed `TEAM` decision receives the same fields.
- Sales without an allowed resource decision fail closed.

This prevents the guard from granting company-wide supplier inventory simply
because a user has a Sales role. Scoped Trip/Quote lists and Trip cost responses
use the resource DTO directly. Legacy inventory calculations without package
context remain conservatively redacted.

## Deferred to Stage D

- broad migration of all list/detail/mutation endpoints;
- Firestore rules redesign;
- BookingQueryService conversion from its legacy role rules to full Stage C
  TEAM query semantics;
- lifecycle, confirmation, voucher, lead, and inventory authorization rollout;
- destructive or automatic metadata backfill.

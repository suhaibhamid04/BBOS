# Phase 2B-7A Stage C — Centralized Authorization Policy

## Scope

Stage C adds the server-side BBOS business authorization decision model and
proves it on trip and quote detail reads. It does not migrate every endpoint,
change Firestore rules, rewrite `DataContext`, or introduce a new role.

```text
Authenticated principal
  -> Resource + action
  -> Role scope
  -> Normalized resource context
  -> Workflow/approval checks
  -> Authorization decision
  -> Resource-specific DTO
```

Firebase UID remains authentication identity only. Every OWN or ASSIGNED
comparison uses the stable BBOS `employeeId`.

## Canonical policy concepts

- Resources: `TRIP`, `QUOTE`, `BOOKING`, `INVENTORY`, `ATTRIBUTION_REPORT`.
- Actions: detail/financial/inventory/operational reads, commercial update,
  quote conversion, Reservations update, Operations update, aggregate read.
- Scopes:
  - `ALL`: organization-wide access for the supported resource/action.
  - `TEAM`: exact `principal.salesTeamId == resource.salesTeamId` match.
  - `OWN`: exact `principal.employeeId == resource.ownerEmployeeId` match.
  - `ASSIGNED`: exact stable employee ID match against the role-specific
    Reservations or Operations assignment.
  - `DEPARTMENT`: reserved in the typed model for a future department head;
    no current role receives it.
  - `AGGREGATE`: attribution output only, never raw commercial detail.
  - `NONE`: denied.

Unknown roles, inactive/malformed principals, unsupported resource/action
pairs, malformed context, and missing scope metadata fail closed.

## Current scope rules

| Role | Current Stage C resource policy |
| --- | --- |
| Founder / Admin | `ALL` for supported actions |
| Accounts | `ALL` commercial/financial reads; no commercial-edit authority |
| Sales Manager | `TEAM` commercial reads/financial reads/edits/conversion |
| Sales Executive | `OWN` commercial reads/financial reads/edits/conversion |
| Reservations | `ALL` inventory reads; `ASSIGNED` trip/booking work after confirmation |
| Operations | `ASSIGNED` trip/booking operational reads/updates in supported live states |
| Marketing | `AGGREGATE` attribution only; raw commercial detail denied |

`TEAM` never falls back to a frontend permission such as `canViewAllSales`.
Missing team data denies access. Unassigned Reservations or Operations records
also deny access.

## Resource context mapping

| Resource | Canonical owner | Team | Reservations assignment | Operations assignment | State |
| --- | --- | --- | --- | --- | --- |
| Trip | `assignedSalesEmployeeId` | `salesTeamId` | `assignedReservationsEmployeeId` | `assignedOperationsEmployeeId` | `status` |
| Quote | `salesEmployeeId` | `salesTeamId` | n/a | n/a | `status` |
| Booking | `assignedSalesEmployeeId` | `salesTeamId` | `assignedReservationsEmployeeId` | `assignedOperationsEmployeeId` | `status` |

The policy receives canonical names through resource adapters, so existing
business field names are preserved and Firebase UID is not introduced into
historical ownership.

The optional context `approval` hook contains `{ required, state }`. A required
approval that is not `APPROVED` denies the action. This is only a policy hook;
Stage C does not implement an approval workflow.

## Representative integrations

- `GET /api/trips/:id`
- `GET /api/quotes/:id`

Both integrations load the resource, normalize its context, call
`assertAuthorizedResource`, and only then build the response DTO. An
authenticated scope mismatch returns a generic 403. A missing document returns
404. The legacy collection list routes remain unchanged for Stage D query-scope
rollout.

## DTO foundation

Authorization and projection are separate operations. `buildResourceDto`
refuses a denied decision.

- Sales Executive `OWN`: supplier cost, selling price, profit, and margin.
- Sales Manager `TEAM`: supplier cost, selling price, profit, and margin.
- Reservations `ASSIGNED`: supplier cost and selling price; profit/margin removed.
- Operations `ASSIGNED`: operational data; supplier costs, commercial amounts,
  profit, and margin removed.
- Accounts: full financial read projection, without edit authority.
- Founder/Admin: full projection.
- Marketing: no raw detail DTO because raw detail authorization is denied.

`financialGuard` remains a coarse defense for legacy endpoints and now has an
explicit entry for all eight roles. It intentionally remains more restrictive
than resource-aware detail DTOs until Stage D migrates those endpoints.

## Query scope foundation

`resolveQueryScope` produces structured constraints rather than loading and
redacting unauthorized records. Examples include:

- quote OWN -> `salesEmployeeId == principal.employeeId`
- trip/booking TEAM -> `salesTeamId == principal.salesTeamId`
- booking Reservations ASSIGNED ->
  `assignedReservationsEmployeeId == principal.employeeId`
- booking Operations ASSIGNED ->
  `assignedOperationsEmployeeId == principal.employeeId`

Reservations and Operations descriptors also include supported status
constraints. Stage D will translate these descriptors into each list query and
add any required composite indexes.

## Missing metadata and Stage D backfill

No production data is rewritten by Stage C. Before broad API cutover, inventory
and backfill must identify:

1. trips/bookings missing `assignedSalesEmployeeId`;
2. quotes missing `salesEmployeeId`;
3. sales-owned trips, quotes, and bookings missing immutable `salesTeamId`;
4. active Reservations work missing `assignedReservationsEmployeeId`;
5. live Operations work missing `assignedOperationsEmployeeId`;
6. employee records missing canonical `salesTeamId`;
7. demo/legacy identifiers such as preset IDs that do not match stable employee
   records;
8. records with status values outside the canonical workflows.

Backfill `salesTeamId` as the team snapshot applicable to the record, not the
employee's current team if they later transferred. All ownership and assignment
fields remain stable BBOS employee IDs.

## Safe deployment order

1. Inventory employee document keys and explicit `firebaseUid`/`employeeId`
   links; resolve duplicates before rollout.
2. Backfill employee `salesTeamId` and resource owner/team/assignment fields in
   staging through a reviewed, auditable migration. Do not deploy an automatic
   destructive rewrite.
3. Deploy the server policy code and representative detail endpoints while
   retaining current Firestore rules and legacy list behavior.
4. Verify every role against real staging records, including Operations screens
   that formerly read supplier rates and all Reservations inventory reads.
5. In Stage D, add required indexes, apply structured query scopes endpoint by
   endpoint, and migrate response DTOs.
6. Only after server paths and clients are cut over should Firestore rules be
   tightened to the same employee lookup and ownership model.

Deploying the current Stage B rules before employee lookup/backfill and scoped
API cutover can break workflows; rules deployment must therefore wait for the
matching Stage D plan.

## Remaining risks before Stage D

- Legacy list routes still use broad collection reads plus coarse redaction.
- `BookingQueryService`, payment, lifecycle, confirmation, and voucher services
  still contain pre-Stage-C authorization branches and require deliberate
  endpoint-by-endpoint convergence.
- Current Firestore rules still contain Firebase UID/business-ID assumptions.
- Existing records may not have `salesTeamId` or department assignments.
- Query descriptors are not yet translated into all Firestore list queries or
  backed by every required composite index.
- Full mutation DTOs and audit requirements remain deferred.

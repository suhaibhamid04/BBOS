# Phase 2B-7A Stage B — Roles and Organizational Model

## Scope

Stage B introduces the eighth production role, `Reservations`, and only the
minimum schema needed for later OWN, TEAM, and ASSIGNED authorization. It does
not implement the Stage C policy engine or query scoping.

## Canonical role model

`src/types/index.ts` exports the single application role enumeration:

```text
Founder
Admin
Accounts
Sales Manager
Sales Executive
Reservations
Operations
Marketing
```

`UserRole` is derived from that constant. Server middleware, employee identity
validation, permission definitions, demo identities, role switching, governance
display, navigation tests, and policy tests consume the derived type or list.
Firestore rules cannot import TypeScript; their `isReservations()` helper is a
deliberate DSL mirror covered by tests.

## Temporary Stage B Reservations permissions

Reservations currently has:

- authenticated access as a recognized employee role;
- read-side accommodation, transport, and activity inventory navigation;
- standard, negotiated, and contracted supplier-rate visibility;
- supplier-cost visibility in server-sanitized calculations and validation;
- supplier-facing accommodation internal notes;
- no package profit, gross profit, or gross margin visibility.

Reservations does not currently have:

- all-booking or all-trip access;
- quote conversion authority;
- payment recording, verification, rejection, or void authority;
- booking cancellation, dispatch, service-confirmation, or voucher authority;
- employee, settings, approval, audit-log, Operations, CRM, or Sales powers;
- supplier-rate mutation/override controls.

Supplier-rate overrides remain read-only for Reservations in Stage B. Enabling
them safely requires Stage C mutation DTOs, validation, audit requirements, and
an explicit authorization policy. Frontend permission flags are UX controls,
not a security boundary.

## Operations boundary

Operations remains responsible for live-trip execution. Stage B removes its
supplier-rate and supplier-cost visibility from the financial sanitizer,
calculation engines, client rate loading, protected rate endpoints, and rate
collection Firestore rules. Existing live booking dispatch, service execution,
driver, voucher, and guest-issue behavior is otherwise preserved.

## Employee organizational model

The authenticated employee model now supports:

```text
employeeId: string              # stable BBOS business identity
firebaseUid: string             # Firebase authentication identity
role: UserRole
active: true | false
salesTeamId?: string            # sales roles only when applicable
managerEmployeeId?: string      # stable employeeId of the manager
```

`SalesTeam` is the minimum team record:

```text
id: string
name: string
managerEmployeeId: string
active: boolean
```

Membership is stored once on the employee through `salesTeamId`. Sales
Executives may identify their manager through `managerEmployeeId`. Non-sales
roles do not need either field. The identity resolver accepts legacy `teamId`
as an input fallback but emits only canonical `salesTeamId`.

## Future authorization scopes

- Sales Executive OWN: compare record ownership employee ID with
  `req.user.employeeId`.
- Sales Manager TEAM: resolve employees sharing the manager's `salesTeamId`.
- Founder/Admin ALL: organization-wide access.
- Reservations ASSIGNED: compare `assignedReservationsEmployeeId` with the
  authenticated stable `employeeId`.

Stage B adds optional `assignedReservationsEmployeeId` to the top-level
`Booking` and tailored `Trip` models. Child booking services inherit assignment
through `bookingId`; duplicating the assignment on every service document is
unnecessary until a proven Stage C query requires it.

## Migration and backfill

No automatic migration is included. Before Stage C rollout:

1. Backfill `salesTeamId` for Sales Managers and Sales Executives.
2. Backfill `managerEmployeeId` for Sales Executives where known.
3. Create one stable team record per real sales team.
4. Add `assignedReservationsEmployeeId` only to active bookings/trips that have
   an approved Reservations owner.
5. Preserve all existing sales and operations ownership fields as BBOS
   employee IDs; never rewrite them to Firebase UIDs.
6. Remove legacy employee `teamId` only after every environment has been
   verified against the canonical field.

## Deferred seven-role assumptions

The following remain intentionally unchanged until scoped authorization is
implemented:

- booking and trip list/detail routes do not admit Reservations;
- quote list/conversion routes do not admit Reservations;
- payment, cancellation, dispatch, confirmation, and voucher role lists remain
  unchanged;
- BookingQueryService has no Reservations branch because adding one would be
  premature ASSIGNED scoping;
- Firestore booking/service access remains on the earlier role model;
- non-rate inventory master writes that still reference Operations remain for
  compatibility and require a later domain-policy review;
- Firestore's employee-document lookup architecture remains deferred to the
  planned authorization/rules stage.

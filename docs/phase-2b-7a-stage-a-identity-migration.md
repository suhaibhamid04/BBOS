# Phase 2B-7A Stage A — Employee Identity Migration

## Identity contract

BBOS keeps two distinct identifiers:

- `firebaseUid`: Firebase Authentication identity. It may change if an Auth
  account is replaced and must not be used as the historical business owner.
- `employeeId`: stable BBOS business identity used by lead, package, quote,
  booking, assignment, reporting, commission, and audit records.

The employee record links the two. New and backfilled records should use:

```text
employees/{employeeDocumentId}
  firebaseUid: string
  employeeId: string
  role: current BBOS UserRole
  active: true | false
  name: string
  email: string
  salesTeamId?: string
  managerEmployeeId?: string
```

The document ID is not required to equal either identifier. Using the stable
`employeeId` as the document ID is acceptable, but not required.

## Current repository evidence

- Preset employees use IDs such as `emp-sales-01` and `emp-mgr-01`.
- Leads use `assignedEmployeeId` and optionally `assignedManagerId`.
- Trips use `assignedSalesEmployeeId` and `assignedOperationsEmployeeId`.
- Quotes use `salesEmployeeId`.
- Bookings use `assignedSalesEmployeeId`, `assignedSalesManagerId`, and
  `assignedOperationsEmployeeId`.
- Audit and payment records store employee actor IDs.
- Existing Firestore rules assume `employees/{request.auth.uid}`, but the
  TypeScript employee profile did not previously contain a Firebase UID link.

Those business ownership fields must continue to store BBOS `employeeId`.

## Compatibility lookup implemented in Stage A

The server resolves an employee using both:

1. Preferred explicit link: `employees.where('firebaseUid', '==', uid)`.
2. Legacy document layout: `employees/{firebaseUid}`.

The matches are de-duplicated by document ID. Zero matches and multiple matches
are rejected. The internal employee ID is resolved in this order:

1. `employee.employeeId`
2. `employee.id`
3. employee document ID (legacy fallback only)

No ownership records are rewritten by Stage A.

## Production backfill procedure

Before enabling the new middleware in an environment with real users:

1. Export or otherwise inventory the `employees` collection read-only.
2. For each approved employee, identify the correct Firebase Auth UID.
3. Verify that each Firebase UID maps to exactly one employee and each employee
   maps to at most one active Firebase account.
4. Add `firebaseUid` and explicit `employeeId` fields to the employee record.
5. Preserve all existing assignment/ownership values; do not replace them with
   Firebase UIDs.
6. Mark former staff `active: false` instead of deleting historical employees.
7. Resolve duplicate UID links before deployment—the server deliberately denies
   ambiguous identities.
8. Test `/api/auth/me` for every active role in staging.

This backfill is intentionally manual/controlled. Stage A contains no automatic
or destructive production-data migration.

## Rollback

Code rollback does not require a data rollback. The added `firebaseUid` and
`employeeId` fields are additive. Do not remove them if application code is
rolled back; they remain the canonical identity link for the next deployment.

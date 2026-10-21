# A01 — Financial and commercial exception workflows

Reviewed and implemented on 2026-10-21 on `audit/bbos-comprehensive-remediation`. This review covers source behavior only. It does not deploy rules, migrate production data, or execute financial payments.

## Status

**A01 CLOSED IN SOURCE.** Post-confirmation amendments, supplier substitutions, cancellation refunds, and Sales commissions now use server-authoritative workflows with immutable history, explicit approvals, separation of duties, and idempotent financial transitions.

## Authoritative data model

| Collection | Purpose | Mutability |
|---|---|---|
| `bookings/{id}/financial_snapshot/{id}` | Original confirmation economics | Immutable source snapshot; never updated by A01 |
| `booking_amendments` | Versioned before, proposed, approved, delta, decision, and application history | State transitions only through the server service |
| `supplier_substitutions` | Original/replacement supplier service evidence and materiality decision | State transitions only through the server service |
| `refund_requests` | Calculation, request, approval, and processing state | State transitions only through the server service |
| `refund_ledger` | Actual paid refund event | Immutable deterministic entry per approved refund |
| `commission_ledger` | Earned, reversal, adjustment, and settlement entries | Append-only immutable entries |
| `financial_policies/current` | Optional Booking Bridge cancellation deduction | Server-read configuration; browser access denied |
| `audit_logs` | Actor, action, before/after state, reason, and timestamp | Immutable server-side events |

All listed collections are denied to browser Firestore clients. Authenticated Express endpoints resolve the canonical employee identity and run the transitions.

## Amendment workflow

State machine:

```text
PENDING_APPROVAL -> APPROVED -> APPLIED
                 -> REJECTED
```

The type reserves `DRAFT` and `CANCELLED` for future controlled transitions, but the current UI creates a complete proposal directly in `PENDING_APPROVAL`. Sales Executive may propose for an OWN Booking, Sales Manager for a TEAM Booking, and Founder/Admin under ALL scope. Every proposal records an incrementing version, reason, proposer, timestamps, service changes, and immutable `before`, `proposed`, and `delta` values. The server derives supplier cost, profit, and margin from the frozen financial snapshot and rejects client-supplied authoritative fields.

Sales Manager TEAM approval or Founder/Admin ALL approval is required. The proposer cannot self-approve. Approval copies the proposed snapshot into `approved`; it does not change the Booking. A separate `apply` transaction updates the Booking and operational service dates/guest counts once. Repeating apply returns the already-applied result without another mutation. Rejection preserves the proposal and reason and changes no Booking or financial value.

## Supplier substitutions

Assigned Reservations, Founder, or Admin may propose a replacement using an active authoritative inventory rate. A replacement is automatically eligible only when its category and calculated supplier cost exactly match the frozen service line. This conservative definition avoids silently inventing a commercial-range threshold. Any category or cost difference requires Founder/Admin approval.

Application is explicit and idempotent. It updates the operational service reference while leaving the original financial snapshot, customer selling price, and package margin unchanged. Accommodation cost differences preserve the existing supplier-confirmation behavior by recording frozen cost, replacement cost, difference, reason, actor, and `requiresCommercialApproval`. A customer-facing economic change must use the amendment workflow.

## Refund calculation and release

Refunds require a cancelled Booking. The server calculates:

```text
verified customer payments
- supplier cancellation charges
- verified supplier payments explicitly evidenced as non-refundable
+ recoverable supplier amounts
- configured Booking Bridge cancellation deduction
- prior paid refund-ledger amounts
= suggested refund (floor 0)
```

Supplier charges and recoveries carry an amount, source reference, and reason. A referenced supplier payment must exist on the Booking and be VERIFIED. The optional `financial_policies/current` document may provide `cancellationDeductionFlat` and/or `cancellationDeductionPercent`; absence is recorded as `NO_CONFIGURED_BOOKING_BRIDGE_DEDUCTION` and applies zero Booking Bridge deduction.

State machine:

```text
CALCULATED -> PENDING_APPROVAL -> APPROVED -> PAID
                               -> REJECTED
```

The types reserve `DRAFT`, `PROCESSING`, and `CANCELLED`. Accounts or ALL scope calculates and submits. Founder/Admin approves, may not approve their own request, and cannot approve above the server suggestion. Approval does not mean paid. A different Accounts employee records method/reference and creates the deterministic immutable refund-ledger entry. The requester and approver cannot record payment. Historical customer payment records are never changed to represent a refund.

## Sales commission lifecycle

The original `assignedSalesEmployeeId` owns commission throughout the Booking lifecycle. Later amendment, Reservations, Operations, cancellation, or support actors never receive the credit.

```text
CONFIRMED -> EARNED
CANCELLED -> REVERSAL linked to EARNED
manual authorized correction -> ADJUSTMENT
explicit finance action -> SETTLED
```

Payment verification writes one deterministic `EARNED` entry in the same transaction that first moves a Booking from `PENDING_PAYMENT` to `CONFIRMED`. The default is INR 500. A finite non-negative `employees/{employeeId}.commissionPerConfirmedBooking` value overrides that default for the selected employee. Repeated payment verification cannot duplicate it.

Cancellation writes a deterministic full `REVERSAL`, linked to the original earned entry, without deleting either record. A legacy confirmed Booking without an earned entry receives the deterministic earned record before reversal. Settlement records the current positive outstanding balance with an explicit reference; earning and settlement remain separate. Founder/Admin can add an immutable adjustment with a caller-provided idempotency key. Accounts, Founder, or Admin can settle; Sales cannot.

## Authorization matrix

| Action | Authority | Scope and separation |
|---|---|---|
| Propose amendment | Sales Executive, Sales Manager, Founder/Admin | OWN, TEAM, ALL |
| Approve/reject/apply amendment | Sales Manager, Founder/Admin | TEAM or ALL; proposer cannot approve |
| Propose/apply safe substitution | Reservations, Founder/Admin | ASSIGNED or ALL |
| Approve material substitution | Founder/Admin | ALL |
| Calculate/submit refund | Accounts, Founder/Admin | Financial/ALL scope |
| Approve/reject refund | Founder/Admin | Requester cannot approve |
| Record refund paid | Accounts | Processor differs from requester and approver |
| Adjust commission | Founder/Admin | ALL |
| Settle commission | Accounts, Founder/Admin | Financial/ALL scope |

Inactive or incomplete actors fail closed. Operations and Marketing have no A01 routes or UI financial projection. Reservations sees assigned substitution costs but not amendments, refunds, or commission data. The UI consumes a role-filtered overview from the server.

## Audit events

The server writes `AMENDMENT_REQUESTED`, `AMENDMENT_APPROVED`, `AMENDMENT_REJECTED`, `AMENDMENT_APPLIED`, `SUPPLIER_SUBSTITUTION_PROPOSED`, `SUPPLIER_SUBSTITUTION_APPROVED`, `SUPPLIER_SUBSTITUTION_REJECTED`, `SUPPLIER_SUBSTITUTION_APPLIED`, `REFUND_CALCULATED`, `REFUND_REQUESTED`, `REFUND_APPROVED`, `REFUND_REJECTED`, `REFUND_PAID`, `COMMISSION_EARNED`, `COMMISSION_REVERSED`, `COMMISSION_ADJUSTED`, and `COMMISSION_SETTLED`. Actors come from authenticated employee identity; clients cannot supply the event action, actor, or authoritative before/after values.

## Idempotency

- Amendment apply returns the stored APPLIED result on retry.
- Substitution apply returns the stored APPLIED result on retry.
- Refund submission and decision return an existing matching state; payment uses `refund-ledger-{refundId}` and returns the immutable ledger on retry.
- Commission earning and cancellation reversal use deterministic Booking IDs.
- Adjustments and settlements use explicit idempotency keys; a retry returns the original entry.
- Financial transitions and their audit records execute in storage transactions.

## UI

Booking detail now contains a compact financial-exceptions panel. Authorized users can see current states, before/proposed amendment economics, rejection reasons, substitution materiality, refund calculation and release state, commission ledger totals, immutable refund count, and the audit timeline. The panel provides only the actions allowed for the current role and sends proposals/evidence rather than authoritative calculated values.

## Business-policy hooks

- `BUSINESS_POLICY_REQUIRED_FOR_PARTIAL_COMMISSION_REVERSAL`: no approved partial-refund commission formula exists. A full Booking cancellation creates a full reversal. A partial refund does not create an automatic additional reversal; Finance may use an authorized, audited adjustment after policy approval.
- `BUSINESS_POLICY_REQUIRED_FOR_SUBSTITUTION_RANGE_THRESHOLD`: no BBOS percentage/absolute “same commercial range” threshold exists. The safe automatic policy is exact supplier-cost equality. Any difference requires Founder/Admin approval.
- Booking Bridge cancellation deductions default to zero when `financial_policies/current` is absent. Production owners must approve and configure any flat or percentage deduction before relying on it.

These open policy choices do not permit a silent financial mutation: each current fallback is conservative and fail-closed.

## Verification

The focused A01 suite covers OWN/TEAM scope, unrelated-team and unassigned-Reservations denial, forged economics, rejection with no mutation, explicit/idempotent apply, immutable confirmation snapshot, substitution materiality/discrepancy, refund deductions and already-refunded amounts, dual authority, immutable ledger, commission configuration/ownership/reversal/settlement, and direct Firestore denial. Final repository regression results are recorded in `BBOS_TEST_RESULTS.md`.

# Phase 2B-7A Stage D1 — Quotes and Quote Conversion

## Scope

Stage D1 makes Quote reads, commercial mutations, pricing, and conversion
server-authoritative. It uses the Stage C policy engine and stable BBOS
`employeeId`. It does not migrate Booking, Payment, Reservations, Operations,
supplier accounting, commissions, or other Stage D domains.

## Quote architecture before vs after

| Before | After |
| --- | --- |
| Production Quote creation and updates could write Firestore from React. | Production React code calls authenticated Express create/update APIs. Quote client reads and writes are denied by the Quote-specific Firestore rule. |
| Client payloads supplied ownership and derived financial fields. | Server assigns owner, team snapshot, creator/updater, timestamps, initial status, version, supplier-cost provenance, profit, and margin. |
| Quote list/detail responses depended on generic sanitization and could pass unknown Firestore fields. | Quote list/detail/create/update use an explicit allowlist DTO after resource authorization. |
| Conversion used a role gate without enforcing OWN or TEAM against the stored Quote. | Conversion loads and authorizes the stored Quote before inventory validation and re-authorizes the transaction snapshot before writes. |
| Production conversion could fall back to demo inventory. | Production routes use the Firestore-backed inventory provider for authoritative validation and supplier costs. |
| Conversion audit was written after the conversion transaction. | Conversion marker, Booking/services/snapshot, Quote/Lead/Trip transitions, and audit record commit atomically. |
| Quote updates overwrote the current commercial state. | Every API update increments `version` and archives the previous commercial revision in the minimum D1 history foundation. |

## Files changed for D1

- `server/routes/quotes.ts`
- `server/services/quoteService.ts`
- `server/services/firestoreInventoryProvider.ts`
- `server/authorization/quoteDto.ts`
- `src/services/conversion/quoteConversionService.ts`
- `src/services/conversion/conversionStorageProvider.ts`
- `src/services/db/repositories.ts`
- `src/context/DataContext.tsx`
- `src/components/sales/QuotesView.tsx`
- `src/components/crm/LeadDetailView.tsx`
- `src/components/crm/LeadDetailDrawer.tsx`
- `src/types/index.ts`
- `firestore.rules`
- `tests/server/quote-domain-service.test.ts`
- `tests/quotes/quote-conversion.test.ts`
- `tests/server/authorization-policy.test.ts`
- `tests/server/stage-c1-security-hardening.test.ts`
- `tests/security/firestore-rules.test.ts`
- `docs/phase-2b-7a-stage-d1-quotes.md`

## Quote authorization matrix

| Role | List/detail | Create | Update | Convert |
| --- | --- | --- | --- | --- |
| Founder | ALL | Yes | ALL, workflow permitting | ALL |
| Admin | ALL | Yes | ALL, workflow permitting | ALL |
| Accounts | ALL financial/business read | No | No | No |
| Sales Manager | TEAM | Yes, linked Lead must be in TEAM | TEAM, workflow permitting | TEAM |
| Sales Executive | OWN | Yes, linked Lead and Trip must be OWN | OWN, workflow permitting | OWN |
| Reservations | Denied | No | No | No |
| Operations | Denied | No | No | No |
| Marketing | Denied | No | No | No |

Missing Quote owner/team, principal team, Lead assignment/team, or Trip scope
metadata fails closed. `salesEmployeeId` stores stable BBOS employee identity,
not Firebase UID. The current Customer model has no ownership field and package
templates are global, so authoritative customer scope is established through
the linked assigned Lead and, when present, the linked Trip.

Creation derives Quote owner/team from the Lead's assigned active Sales
employee. The employee is resolved by its canonical `employeeId` field; its
Firestore document ID may differ. Sales Managers and Founder/Admin remain the
authenticated creator/audit actor and do not become the sales owner merely by creating the
Quote. A matching Trip must carry the same owner/team attribution. Relinking an
existing Quote cannot silently transfer ownership.

List queries remain bounded and cursor-compatible. OWN and TEAM filters are
translated to Firestore constraints before reads, and every returned record is
authorized again before DTO construction.

## Selling-price authority

Sales controls the proposed gross package selling price (`totalAmount`) and
`discountAmount`. The canonical customer price is:

`finalAmount = totalAmount - discountAmount`

The server validates that both inputs are finite and non-negative, the discount
does not exceed the gross price, and the resulting price does not fall below
authoritative supplier cost. The server obtains `totalSupplierCost` from the
linked authoritative Trip, records its source, and calculates `finalAmount`,
`grossProfit`, and `grossMargin`. Client supplier cost, profit, margin, final
amount, nested supplier-cost fields, and supplier-oriented `quotedRate` are
rejected.

An uncosted preliminary Quote may remain `DRAFT`. It cannot move to a commercial
state until it has authoritative supplier cost and a positive selling price.

## Workflow and low-margin preparation

The server owns initial `DRAFT` status and validates the existing lifecycle:

- `DRAFT` → `DRAFT`, `PENDING_APPROVAL`, or `SENT`
- `PENDING_APPROVAL` → `PENDING_APPROVAL`, `DRAFT`, or `SENT`
- `SENT` → `SENT`, `VIEWED`, `ACCEPTED`, `REJECTED`, or `EXPIRED`
- `VIEWED` → `VIEWED`, `ACCEPTED`, `REJECTED`, or `EXPIRED`
- terminal states remain terminal through the Quote update API

Conversion accepts the supported customer-acceptance states `SENT`, `VIEWED`,
or an unconverted `ACCEPTED` Quote. `DRAFT`, `PENDING_APPROVAL`, `REJECTED`,
`EXPIRED`, unknown, and date-expired Quotes are rejected.

The existing policy context supports `approval.required` and `approval.state`.
When approval is required and not `APPROVED`, update/conversion fails closed.
`requiresLowMarginApproval` and the approval context are server-controlled hooks;
D1 does not invent a threshold or implement the Approval Engine.

## Quote conversion authorization

The conversion sequence is:

1. verify the authenticated active actor has stable `employeeId`;
2. load the stored Quote;
3. authorize `CONVERT_TO_BOOKING` against stored owner/team/approval context;
4. require owner/team attribution and validate workflow/expiry;
5. validate services and rates against production Firestore inventory;
6. begin the transaction and reload/re-authorize the Quote;
7. detect concurrent changes and enforce the idempotency marker;
8. create Booking, service records, restricted financial snapshot, state changes,
   and server-authored audit event atomically;
9. return an explicit conversion DTO.

The Booking carries the stored Quote's stable owner/team attribution. The
Booking root retains the invariant of zero supplier-cost/profit/margin fields;
those values remain in the restricted financial snapshot.

## Direct Firestore paths removed

- `DataContext.createQuote`, `updateQuote`, and `convertQuoteToBooking` use
  authenticated APIs in production.
- The generic frontend `QuoteRepo` export was removed.
- Production Quote state is initialized empty, populated by scoped API results,
  and no longer persisted to browser local storage.
- The `quotes` Firestore rule denies all client reads and mutations; only the
  server Admin SDK path can access Quote documents.
- Demo-only local Quote creation, editing, conversion, role switching, and local
  storage remain isolated behind explicit `DEMO_MODE`.

## Financial DTO behavior

Quote DTOs are positive allowlists at the root, service-item, version-history,
supplier-provenance, and approval levels. A DTO cannot be built from a denied
authorization decision. Authorized Sales OWN/TEAM, Founder/Admin, and Accounts
receive Quote supplier cost, selling price, profit, and margin. An out-of-scope
Quote is denied rather than redacted. Unknown Firestore fields cannot pass
through.

Conversion uses a separate operational/commercial allowlist. It excludes the
financial snapshot, all supplier costs, profit, margin, and unknown Booking or
service fields.

## Audit and version behavior

Create and update audits are written in the same transaction as the Quote.
Actor identity comes only from authenticated `employeeId`; before/after values,
event type, timestamps, and reasons are server-generated. Conversion audit is
part of the conversion transaction and uses a deterministic conversion-key ID,
so retries do not create duplicate success events.

The targeted Firestore audit rule also rejects direct client creation of
`QUOTE_CREATED`, `QUOTE_UPDATED`, and `QUOTE_CONVERTED_TO_BOOKING`; those event
types can only originate from server Admin SDK transactions.

Every server update automatically snapshots the prior commercial version and
increments the version. This is a minimum D1 safety foundation, not the final
immutable versioning product. A later milestone should move unbounded history
to immutable version documents/subcollections with retention and reporting.

## Missing metadata and backfill

No data was rewritten automatically. Before production rollout, run a read-only
report and reviewed backfill for:

- Quotes missing `salesEmployeeId` or `salesTeamId`;
- Leads missing `assignedEmployeeId`, or whose assigned Employee lacks canonical
  `employeeId`, active Sales role, or canonical `salesTeamId` (legacy `teamId`
  is read only as a compatibility source);
- Quotes/Trips with inconsistent customer or Lead links;
- Trips missing finite `totalSupplierCost`;
- legacy Quotes using `totalCost` instead of `totalSupplierCost`;
- Quote service items missing inventory/rate identifiers required for conversion.

Legacy list/detail reads normalize `totalCost` to `totalSupplierCost` in the DTO,
but mutations and conversion do not silently migrate or trust legacy values.

## Verification

- `bun run lint`: passed (`tsc --noEmit`).
- `bun test`: 357 passed, 0 failed, 1,206 assertions across 22 files.
- `bun run build`: passed. Vite reports the existing large-bundle advisory for
  the approximately 1.47 MB main JavaScript chunk.
- `git diff --check`: passed. Git emitted Windows LF-to-CRLF working-copy
  notices only; no whitespace errors were reported.

## Remaining D1 risks and deferred work

- Deploy the Stage C.1 composite indexes and updated Firestore rules together
  with the API; otherwise scoped production queries or the server-only Quote
  boundary will not match the reviewed code.
- Existing legacy/preliminary Quote items may lack inventory identifiers and
  will correctly fail conversion until reviewed/backfilled.
- `versionHistory` is bounded only by Firestore document size; immutable version
  documents are the next Quote product milestone.
- The duplicated global financial-key registries in `financialGuard.ts` and
  `resourceDto.ts` remain technical debt. D1 does not expand them and uses the
  Quote-specific DTO instead.
- Firestore authorization for non-Quote domains is unchanged and belongs to
  later approved Stage D slices.

Stage D2 has not started.

# BBOS API inventory

Inventory from the TypeScript syntax tree of all route files, reviewed against router mounting in [api.ts](../../server/routes/api.ts). **157 method/path registrations**, updated 2026-10-21. This is a code inventory and contract review, not a generated OpenAPI specification.

Every route in the index below inherits the authentication, scope, request/response, financial, collection, audit and error profile in the matching section. Subroute exceptions are explicit. The index supplies actual method/path, route roles, directly observed request fields, service calls and source location; a field passed inside `req.body` to a service is defined by that service's linked input validator, not inferred to be optional or unrestricted.

## Global boundary and response conventions

All `/api` routes require a verified Firebase token and a unique active recognized employee **except** the two public router families. Production demo bypass is disabled. Identity/role/employeeId come from authentication, never the request body. The role column is only the route gate; service resource authorization can further deny the request.

Most reads return `{success:true,data:...}`; several Booking/payment/payable endpoints spread a domain result at the top level. List endpoints with cursors return `data`, `hasMore`, `nextCursor`; do not assume every registry implements pagination. Domain errors generally return `{error,code,details?}` with 400 invalid input, 401 missing/invalid authentication, 403 role/scope denial, 404 missing resource, 409 stale/conflict/idempotency conflict, 422 invalid workflow/business precondition, and 500 persistence/provider failure. Public share expiry/revocation uses 410; bounded supplier registry overflow now uses 503.

GET usually has no audit mutation, except public share opening (view tracking) and explicitly generated delivery artifacts/history. Mutation audit names and exact payloads are authoritative in the linked service. No request body may directly set an authoritative financial snapshot, employee actor or server audit record.

## Inventory profiles: /accommodation, /transport, /activities

- **Roles/scope:** Master reads: Founder/Admin/Accounts/SM/SE/Reservations/Operations. Supplier/rate reads: Founder/Admin/Accounts/Reservations. Create/update masters/rates/suppliers: Founder/Admin. These are global inventory privileges, not ownership-scoped financial reads.
- **Request schemas:** Property inputs include name, propertyType, location/city, supplierId, amenities/status; rooms identify property, category/capacity and occupancy rules. Accommodation rates identify property/room/meal plan, validity, base rate and supplements. Vehicles identify name/category/capacity/features. Transport rates identify vehicle, supplier, serviceType, pricingUnit, baseRate and validity. Activities identify name/category/destination/supplier and description; rates carry pricingModel/pricingComponents/validity. PATCH accepts the relevant allowed subset. [InventoryManagementService](../../server/services/inventoryManagementService.ts) owns field/type/range/reference/overlap validation.
- **Calculation scope/schema:** Accommodation accepts propertyId, roomCategoryId, checkInDate, nights, mealPlan, party counts, optional rateId, tripId, roomAllocations and packageRate. Transport accepts vehicleCategoryId, startDate, serviceType and applicable quantities; activity accepts activityId, date and applicable counts/units. Transport/activity require an authorized Trip for scoped roles. Accommodation can calculate unscoped, but redacts costs without a qualifying decision. Sales uses READ_FINANCIALS on OWN/TEAM Trip; Reservations/Operations use assigned READ_DETAIL in allowed states.
- **Responses/financial fields:** Masters use role-shaped inventory objects. Authorized raw rate readers receive supplier rates. Calculators return availability/confirmation metadata; Founder/Admin/Accounts, assigned Reservations and authorized scoped Sales receive applicable supplier costs, totals and breakdowns. Operations receives only the explicit safe metadata projection. Profit/margin remains excluded for Reservations.
- **Collections:** accommodation_properties, room_categories, rate_periods, vehicle_categories, transport_rate_periods, activity_masters, activity_rate_periods, suppliers; calculations may read trips. Inventory mutations also write audit_logs. Demo supplements use fixtures.
- **Audit/errors:** Create/update/disable inventory events; calculator reads create no money record. Invalid fields/references, inactive masters, mismatched selected rate and overlapping active rate periods reject. Registry and overlap-query caps remain A02.

## Lead/communication profile: /leads

- **Roles/scope:** Lead CRUD, queue, interaction and conversation: Founder/Admin ALL, SM TEAM, SE OWN. Assignment additionally requires Founder/Admin/SM and validates eligible recipients. Distribution administration, unresolved WhatsApp linking and demo event simulation: Founder/Admin; demo event simulation additionally requires demo mode.
- **Schemas:** Lead create/update is allowlisted through `buildEnquiryFields` and route validation: customer/contact/source/priority, destination/date/duration, adults/children/ages, room/meal/vehicle preferences, services, budget, specialRequirements/notes/tags and optional creationRequestId. Actor/ownership are server-derived. Customer matching takes normalized phone/email, applies customer/linked-Lead OWN/TEAM/ALL scope, and returns at most five projected identity/contact matches.
- **Subresources:** Distribution config/assignment inputs use [leadDistributionService.ts](../../server/services/leadDistributionService.ts); interactions use [leadInteractionService.ts](../../server/services/leadInteractionService.ts); timeline entries use [conversationTimelineService.ts](../../server/services/conversationTimelineService.ts); WhatsApp send/retry/link use [whatsappMessagingService.ts](../../server/services/whatsappMessagingService.ts) through [whatsappRuntime.ts](../../server/services/whatsappRuntime.ts). Queue construction and exact input validators are linked from the route source.
- **Responses/financial fields:** Lead/contact/enquiry objects, assignment options/history, queue summaries, timeline pages and messaging context/delivery state. Customer budgets are visible within CRM scope; these responses do not grant Booking supplier-cost/profit authority.
- **Collections/audit:** leads, customers, employees, sales_teams, lead_distribution_configs/state, lead_assignment_history, lead_events, conversation_entries, unmatched_whatsapp, whatsapp_webhook_events and whatsapp_pending_statuses; related quote/share reads and audit_logs. Assignment, interactions, internal notes and messaging create named immutable history/audit events. Ordinary lists do not.
- **Errors:** Missing team metadata, invalid contact/source/enquiry, duplicate/stale request, unauthorized owner/team, invalid assignee, unknown provider entry and disabled/missing provider configuration. Lead list currently caps at 100 and has no cursor (A02).

## Customer directory profile: /customers

- **Roles/scope:** Founder/Admin ALL, Sales Manager TEAM, Sales Executive OWN. Scope can be established by server-owned customer metadata or an authoritative linked Lead; missing owner/team evidence fails closed.
- **Schema:** List accepts cursor and limit 1-100. Create/update accepts only name, phone, WhatsApp, email, city, B2C/B2B type, preferences, notes and optional companyId. Owner employee, team, role, actor, normalized lookup values, counts and financial fields are rejected from the body and derived server-side where applicable.
- **Response:** Explicit Customer directory DTO containing identity/contact, customer type/preferences/notes, booking count/lifetime selling value, company link and timestamps. It excludes owner/team, normalized lookup keys, audit metadata, supplier costs, profit and margin.
- **Collections/audit:** customers and scoped linked leads; create/update writes canonical employeeId audit events. Ordinary list/detail reads do not audit.
- **Errors:** Invalid cursor/limit/contact/type, protected fields, missing team metadata, inactive/malformed principal, not found or out-of-scope record.

## Trip profile: /trips

- **Scope:** READ_DETAIL/READ_OPERATIONAL uses ALL/TEAM/OWN/ASSIGNED as appropriate; Operations/Reservations require BOOKED/IN_OPERATIONS/COMPLETED Trip state. Commercial mutations are Founder/Admin or scoped Sales in editable states. Accounts can read but does not inherit Sales mutation authority.
- **Schema:** Create/update and from-lead/reconcile inputs are validated by [TripService](../../server/services/tripService.ts): destination/party/dates, selected inventory identifiers, itinerary service selections and permitted commercial intent. Ownership/team/economic authority derive from stored resources and authenticated actor. Itinerary day/item CRUD accepts its specific allowlist; customer-content composition/review is separate from pricing. `calculate-costs` takes tripId/items and authorizes the loaded Trip before financial mutation.
- **Response:** Scoped Trip DTO or itinerary DTO, recalculated cost/commercial totals, updated costing freshness, or delete result. Supplier/profit fields are available to authorized full-financial viewers; Reservations gets supplier work data without profit; Operations receives operational projection.
- **Collections/audit:** trips, itinerary_days, leads, relevant inventory/rates/suppliers, audit_logs. Create/update/delete, itinerary and costing changes produce domain audit events; reads do not.
- **Errors:** Scope/metadata denial, invalid dates/counts/occupancy, inactive/missing/mismatched inventory, missing rates, stale Lead/package revisions and forbidden postconfirmation commercial edits. Generic Trip DTO remains a schema-evolution risk.

## Quote, option and share profile: /quotes

- **Scope:** Reads: Founder/Admin/Accounts ALL, SM TEAM, SE OWN. Mutations/options/shares/conversion: Founder/Admin or scoped Sales; source Trip and Quote are both validated when required.
- **Schema:** Create/update allowlisted Quote commercial/customer/selected-service intent through [QuoteService](../../server/services/quoteService.ts). Option routes accept option metadata/order/recommendation/refresh intent. Group reorder validates option IDs/order. Share creation accepts expiry intent; revoke/pdf/delivery identify shareId. Delivery preparation validates channel/recipient/message intent. Conversion takes path quote ID and server-owned current time, not a client-supplied clock.
- **Response/financial:** Quote DTO and version/history; customer-package/comparison DTOs deliberately omit supplier/internal fields; share metadata/public path; PDF bytes for the PDF endpoint; prepared delivery result. Conversion uses a dedicated result projection. Internal scoped Sales may see supplier costs and margin; public projections never inherit those rights.
- **Collections/audit:** quotes, trips, itinerary_days, customer_shares, quote_conversions, bookings, booking_accommodations/transports/activities, Booking financial_snapshot subcollection, audit_logs; inventory reads during building/refresh. Quote creation/update/share/version/conversion and customer-share lifecycle events are audited. Conversion atomically creates the commercial root/services/snapshot and records the marker.
- **Errors:** Stale economics/content/version, low-margin approval missing or tied to old values, invalid option group, expiry, duplicate conversion/idempotency conflict, unauthorized share/group and missing frozen snapshot.

## Booking, payment and service profile: /bookings

| Subroute | Resource policy / request contract | Response and financial visibility | Persistence and audit |
|---|---|---|---|
| List/detail | BOOKING read scope: ALL/TEAM/OWN/ASSIGNED; filters status/paymentStatus/query/cursor/limit | Booking list/detail DTO; Operations gets operational/customer-payment summary without supplier economics; Reservations gets supplier-work projection | bookings/services and authorized financial/assignment reads; no audit mutation |
| financial-snapshot | Founder/Admin/Accounts; Booking ID | Immutable full financial snapshot | bookings/{id}/financial_snapshot; no mutation |
| reservations-assignees / reservations-assignment | Founder/Admin; eligible employee and assignment reason validated by assignment service | Eligible list or updated assignment | employees/bookings/audit_logs; assignment/reassignment audit |
| payments POST/GET | RECORD_PAYMENT or authorized Booking read; amount, currency?, paymentDate, paymentMethod, referenceNumber, paymentType, notes?, idempotencyKey? | PaymentRecord/result/receipt; these are customer payments, not supplier costs | payments/bookings/audit_logs; PAYMENT_RECORDED and subsequent status events |
| payments verify/reject/void | Verify/reject Founder/Admin/Accounts with anti-self-verification; void Founder/Admin; rejectionReason/voidReason required as applicable | Updated payment/Booking/receipt; ledger aggregates recomputed | Transactional ledger/state/audit, e.g. PAYMENT_VERIFIED/REJECTED/VOIDED |
| dispatch | Founder/Admin or assigned Operations; no commercial body | Role-projected Booking with success/message | Transactional bookings/audit_logs; BOOKING_DISPATCHED_TO_OPERATIONS |
| cancel | Founder/Admin; cancellationReason string 5-2000 chars | Cancel result; existing guest notes preserved | Transactional bookings/audit_logs; BOOKING_CANCELLED; no automatic refund |
| accommodations PATCH | Founder/Admin or assigned Reservations; ConfirmAccommodationDTO | confirmationProgress, supplierConfirmation, commercial-review flags | Booking/accommodation/audit; supplier evidence and discrepancy events; frozen economics preserved |
| transports/activities PATCH | Founder/Admin or assigned Operations; ConfirmTransportDTO/ConfirmActivityDTO | Confirmation/operational result with restricted financial projection | Booking/service/audit updates; timestamp conflict checks where defined |
| vouchers GET | Founder/Admin or assigned Operations; stored Booking is authoritative | Explicit Voucher identity/type/status/file DTO; no supplier cost, buying price, profit, margin or internal notes | vouchers read after Booking assignment policy; no audit mutation |
| vouchers/generate | Founder/Admin or assigned Operations; IN_OPERATIONS and actually confirmed services | Voucher set/result; no raw cost snapshot | Transactional vouchers/service links/audit; VOUCHERS_GENERATED |

Exact service confirmation schemas in [serviceConfirmationService.ts](../../server/services/serviceConfirmationService.ts): accommodation confirmation code/status, allocated rooms, supplier notes, confirmed room/meal/date/guest/count/rate and discrepancy reason; transport driver/vehicle/pickup/operational fields plus expectedUpdatedAt; activity tickets/guide/operational fields plus expectedUpdatedAt. Unlisted protected fields must not become commercial authority.

Booking errors additionally include invalid state transition, incomplete confirmation, incomplete historical vouchers, mismatched service/Booking linkage, missing assignment and payment state/idempotency conflicts. Cancellation/refund are separate business operations.

## Financial exception profile: /financial-exceptions

- **Identity/scope:** Every route uses canonical authenticated employee identity. Amendments apply OWN/TEAM/ALL Sales scope; substitutions apply ASSIGNED Reservations or ALL scope; refunds and commission settlement use financial/ALL scope. Requester/approver/processor separation is enforced where required.
- **Schema/authority:** Proposal bodies accept reasons and narrowly allowlisted evidence. Supplier cost, profit, margin, commission owner/amount, refund suggestion, approval actor, workflow status and audit actor are derived by the server. Unknown or authoritative fields are rejected.
- **Response:** Role-filtered workflow overview plus typed amendment, substitution, refund and commission transition results. Operations and Marketing have no route access. Reservations cannot see amendment/refund/commission financial data.
- **Collections/audit:** booking_amendments, supplier_substitutions, refund_requests, refund_ledger, commission_ledger, financial_policies, bookings/services/payments/supplier_payments and audit_logs. All A01 browser Firestore access is denied.
- **State/errors:** Explicit approval and application/payment states; 403 for role/scope/self-approval violations, 409 for missing frozen data or invalid transition, 422 for business preconditions such as non-cancelled refund requests or an amount above the calculated suggestion. Critical transitions are transactional and retry-safe.

## Supplier-payable profile: /supplier-payables

- **Policy:** SUPPLIER_PAYABLE read: Founder/Admin/Accounts ALL; Reservations/Operations ASSIGNED. Record/verify/reject: Founder/Admin/Accounts; void: Founder/Admin. Verify cannot be performed by the recording employee.
- **Schema:** Booking/obligation/payment path IDs plus `RecordSupplierPaymentInput`: amount, paymentDate, paymentMethod, referenceNumber, paymentType (ADVANCE/PARTIAL/FINAL_SETTLEMENT), notes?, idempotencyKey?. Reject/void use reasons. Obligation amounts are derived from frozen snapshots rather than client amounts.
- **Response/financial:** Payable/settlement ledger and summary; Operations gets an operational view without supplier amounts. Other authorized financial readers receive permitted obligation/payment/balance values. [SupplierPayableService](../../server/services/supplierPayableService.ts) constructs projections.
- **Collections/audit:** bookings, financial_snapshot, booking service collections, supplier_payments, audit_logs. SUPPLIER_PAYMENT_RECORDED/VERIFIED/REJECTED/VOIDED and settlement events. Details now use targeted transactions; global list fails 503 on overflow.
- **Errors:** Missing obligation/source snapshot, unauthorized booking, invalid/nonpositive/over-limit money, duplicate request conflict, self-verification, already-final payment state and summary capacity.

## Operations and approvals profiles

`/operations` reads/control room use Founder/Admin or assigned Operations. Assignment mutation is Founder/Admin. Issues, change requests and spend requests load and authorize the Booking; spend decisions admit Founder/Admin/Accounts and validate business state. Inputs include the corresponding issue/change/spend fields and expected revisions defined in [LiveOperationsService](../../server/services/liveOperationsService.ts). Responses are operational issue/request/control-room DTOs; request spend amounts do not reveal supplier baseline cost.

Collections: bookings/services/employees, booking_operational_issues, operational_change_requests, emergency_spend_requests, audit_logs. Events include OPERATIONS_ASSIGNED/REASSIGNED, OPERATIONS_ISSUE_CREATED/UPDATED/RESOLVED, OPERATIONAL_CHANGE_ESCALATED and EMERGENCY_SPEND_REQUESTED/APPROVED/REJECTED. Errors include scope, stale expectedUpdatedAt, invalid status/amount and invalid decision.

`/approvals` admits the route roles shown below, then filters items/actions by underlying policy. List returns inbox items+summary; summary returns only summary. Decision accepts the allowlisted decision/reason/revision contract in [ApprovalInboxService](../../server/services/approvalInboxService.ts); only supported approval types are executable. Reads aggregate quotes, Booking/service discrepancy records and operational requests; decisions update their authoritative domain and audit, not a browser-writable generic approvals collection. Reservations discrepancy review does not silently apply amended economics. Queries remain capped.

## Employee, AI and utility profiles

- **/employees:** Founder/Admin; list/detail/create/update through [EmployeeManagementService](../../server/services/employeeManagementService.ts). Create input: employeeId, name, email, optional firebaseUid, role, active and optional team/manager/department/designation/phone/joiningDate/reason. Update cannot rename employeeId. Response is projected employee/directory data with no financial amounts. Reads/writes employees, reads sales_teams and login identity directory; writes employee audit events. Rejects invalid/duplicate identity, role/team/manager references, prohibited self/last-admin changes and unauthorized actor.
- **/health, /auth/me:** Any authenticated active employee; no request body. Health returns status/AI configuration/current-user summary/time; auth/me returns public employee identity. No domain writes or audit. Health is not anonymous.
- **/ai/sales-analyze:** Founder/Admin/SM/SE; lead required plus messages/packageContext. Client-provided context, financial sanitizer, Gemini recommendation response; no authoritative commercial mutation. Body validation is limited.
- **/ai/marketing-strategy:** Founder/Admin/Marketing; destination, season and objective or defaults; Gemini response. No domain financial access or persistence.
- **/ai/command-center:** Route roles excluding Reservations; question and optional contextData. Server supplies actual role/name and sanitizes context. Recommendation response, not an approved financial mutation.
- **/tools/execute:** Active employee plus tool-specific coarse role validation; toolName/parameters. Returns validation/execution-shaped status but performs no domain execution (B10). No payment/Booking write should be inferred. No authoritative execution audit.
- **AI/errors:** Provider/configuration failure may surface an internal error.message; schema/error/timeout work remains A05. No real provider send was used for this audit.

## Public profiles

| Route | Authentication / schema | Response / financial scope | Collections, effects and errors |
|---|---|---|---|
| GET /public/quote-shares/:token | High-entropy token capability, stored hashed; no employee auth | Frozen customer option/package DTO; selling price only, explicit nested projection; no-store/no-referrer headers | customer_shares lookup/view counters; invalid token 404, expired/revoked 410, failure 500 |
| GET /public/meta-whatsapp/webhook | Provider verification token and hub mode/challenge query | Challenge response; no financial fields | No commercial write; invalid verification rejected |
| POST /public/meta-whatsapp/webhook | HMAC over exact raw bytes, signed provider payload | Acknowledgment/status; no protected read DTO | Idempotent webhook receipts, normalized conversation/delivery/unmatched records; invalid signature/payload rejected |

## Complete route index

Abbreviations: F Founder; D Admin; A Accounts; SM Sales Manager; SE Sales Executive; R Reservations; O Operations. “Active employee; service policy” means no narrower `requireRole` at that registration, not an authorization bypass. Paths below are relative to the deployed origin. The request-field column is an AST observation; nested DTO validation remains in the profiles/source.

| Method / path | Roles at route | Request fields observed / contract source | Service calls | Code |
|---|---|---|---|---|
| GET `/api/accommodation/properties` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `inventoryManagementService.listProperties` | [accommodation.ts:49](../../server/routes/accommodation.ts#L49) |
| GET `/api/accommodation/properties/:id` | F, D, A, SM, SE, R, O | params.id | `inventoryManagementService.listProperties` | [accommodation.ts:54](../../server/routes/accommodation.ts#L54) |
| POST `/api/accommodation/properties` | F, D | See linked handler and domain contract | `inventoryManagementService.createProperty` | [accommodation.ts:61](../../server/routes/accommodation.ts#L61) |
| PATCH `/api/accommodation/properties/:id` | F, D | params.id | `inventoryManagementService.updateProperty` | [accommodation.ts:65](../../server/routes/accommodation.ts#L65) |
| GET `/api/accommodation/properties/:id/rooms` | F, D, A, SM, SE, R, O | params.id | `inventoryManagementService.listRooms` | [accommodation.ts:70](../../server/routes/accommodation.ts#L70) |
| GET `/api/accommodation/rooms` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `inventoryManagementService.listAllRooms` | [accommodation.ts:74](../../server/routes/accommodation.ts#L74) |
| POST `/api/accommodation/rooms` | F, D | See linked handler and domain contract | `inventoryManagementService.createRoom` | [accommodation.ts:78](../../server/routes/accommodation.ts#L78) |
| PATCH `/api/accommodation/rooms/:id` | F, D | params.id | `inventoryManagementService.updateRoom` | [accommodation.ts:82](../../server/routes/accommodation.ts#L82) |
| GET `/api/accommodation/properties/:id/rates` | F, D, A, R | params.id | `inventoryManagementService.listAccommodationRates` | [accommodation.ts:87](../../server/routes/accommodation.ts#L87) |
| GET `/api/accommodation/rates` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listAllAccommodationRates` | [accommodation.ts:91](../../server/routes/accommodation.ts#L91) |
| POST `/api/accommodation/rates` | F, D | See linked handler and domain contract | `inventoryManagementService.createAccommodationRate` | [accommodation.ts:95](../../server/routes/accommodation.ts#L95) |
| PATCH `/api/accommodation/rates/:id` | F, D | params.id | `inventoryManagementService.updateAccommodationRate` | [accommodation.ts:99](../../server/routes/accommodation.ts#L99) |
| GET `/api/accommodation/suppliers` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listSuppliers` | [accommodation.ts:104](../../server/routes/accommodation.ts#L104) |
| POST `/api/accommodation/suppliers` | F, D | See linked handler and domain contract | `inventoryManagementService.createSupplier` | [accommodation.ts:108](../../server/routes/accommodation.ts#L108) |
| PATCH `/api/accommodation/suppliers/:id` | F, D | params.id | `inventoryManagementService.updateSupplier` | [accommodation.ts:112](../../server/routes/accommodation.ts#L112) |
| POST `/api/accommodation/calculate-rate` | F, D, A, SM, SE, R, O | body.packageRate, body.childAges, body.propertyId, body.roomCategoryId, body.checkInDate, body.nights, body.mealPlan, body.adults, body.children, body.childrenWithBed, body.childrenWithoutBed, body.rateId, body.tripId, body.roomAllocations | `inventoryManagementService.accommodationCalculationData`, `inventoryManagementService.accommodationCalculationDataForRooms`, `inventoryManagementService.supplierSnapshot` | [accommodation.ts:117](../../server/routes/accommodation.ts#L117) |
| GET `/api/activities/masters` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `inventoryManagementService.listActivities` | [activities.ts:41](../../server/routes/activities.ts#L41) |
| POST `/api/activities/masters` | F, D | See linked handler and domain contract | `inventoryManagementService.createActivity` | [activities.ts:42](../../server/routes/activities.ts#L42) |
| PATCH `/api/activities/masters/:id` | F, D | params.id | `inventoryManagementService.updateActivity` | [activities.ts:43](../../server/routes/activities.ts#L43) |
| GET `/api/activities/rates` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listActivityRates` | [activities.ts:45](../../server/routes/activities.ts#L45) |
| POST `/api/activities/rates` | F, D | See linked handler and domain contract | `inventoryManagementService.createActivityRate` | [activities.ts:46](../../server/routes/activities.ts#L46) |
| PATCH `/api/activities/rates/:id` | F, D | params.id | `inventoryManagementService.updateActivityRate` | [activities.ts:47](../../server/routes/activities.ts#L47) |
| GET `/api/activities/providers` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listSuppliers` | [activities.ts:49](../../server/routes/activities.ts#L49) |
| POST `/api/activities/providers` | F, D | See linked handler and domain contract | `inventoryManagementService.createSupplier` | [activities.ts:50](../../server/routes/activities.ts#L50) |
| PATCH `/api/activities/providers/:id` | F, D | params.id | `inventoryManagementService.updateSupplier` | [activities.ts:51](../../server/routes/activities.ts#L51) |
| POST `/api/activities/calculate-rate` | F, D, A, SM, SE, R, O | body.activityId, body.date, body.adults, body.children, body.infants, body.vehicles, body.groups, body.tickets, body.hours, body.days, body.sessions, body.units | `inventoryManagementService.activitySnapshot`, `inventoryManagementService.activityCalculationData`, `inventoryManagementService.supplierSnapshot` | [activities.ts:53](../../server/routes/activities.ts#L53) |
| GET `/api/health` | Active employee; service policy | See linked handler and domain contract | Local handler / adapter; see source | [api.ts:58](../../server/routes/api.ts#L58) |
| GET `/api/auth/me` | Active employee; service policy | See linked handler and domain contract | Local handler / adapter; see source | [api.ts:69](../../server/routes/api.ts#L69) |
| POST `/api/ai/sales-analyze` | F, D, SM, SE | body.lead, body.messages, body.packageContext | Local handler / adapter; see source | [api.ts:79](../../server/routes/api.ts#L79) |
| POST `/api/ai/marketing-strategy` | F, D, Marketing | body.destination, body.targetMonthOrSeason, body.primaryObjective | Local handler / adapter; see source | [api.ts:104](../../server/routes/api.ts#L104) |
| POST `/api/ai/command-center` | F, D, A, SM, SE, O, Marketing | body.question, body.contextData | Local handler / adapter; see source | [api.ts:125](../../server/routes/api.ts#L125) |
| POST `/api/tools/execute` | Active employee; service policy | body.toolName, body.parameters | Local handler / adapter; see source | [api.ts:159](../../server/routes/api.ts#L159) |
| GET `/api/approvals` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `approvalInboxService.getInbox` | [approvals.ts:51](../../server/routes/approvals.ts#L51) |
| GET `/api/approvals/summary` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `approvalInboxService.getInbox` | [approvals.ts:64](../../server/routes/approvals.ts#L64) |
| PATCH `/api/approvals/:itemId/decision` | F, D, A, SM | params.itemId | `approvalInboxService.decide` | [approvals.ts:77](../../server/routes/approvals.ts#L77) |
| GET `/api/bookings/:bookingId/financial-snapshot` | F, D, A | params.bookingId | `quoteConversionService.getBookingFinancialSnapshot` | [bookings.ts:152](../../server/routes/bookings.ts#L152) |
| GET `/api/bookings` | F, D, A, SM, SE, R, O | query.status, query.paymentStatus, query.query, query.cursor, query.limit | `bookingQueryService.listBookings` | [bookings.ts:192](../../server/routes/bookings.ts#L192) |
| GET `/api/bookings/reservations-assignees` | F, D | See linked handler and domain contract | `reservationsAssignmentService.listEligibleEmployees` | [bookings.ts:218](../../server/routes/bookings.ts#L218) |
| GET `/api/bookings/:bookingId` | F, D, A, SM, SE, R, O | params.bookingId | `bookingQueryService.getBookingDetail` | [bookings.ts:240](../../server/routes/bookings.ts#L240) |
| PATCH `/api/bookings/:bookingId/reservations-assignment` | F, D | params.bookingId | `reservationsAssignmentService.assign` | [bookings.ts:264](../../server/routes/bookings.ts#L264) |
| POST `/api/bookings/:bookingId/payments` | F, D, A, SM, SE | params.bookingId | `paymentService.recordPayment` | [bookings.ts:291](../../server/routes/bookings.ts#L291) |
| GET `/api/bookings/:bookingId/payments` | F, D, A, SM, SE, O | params.bookingId | `paymentService.getPaymentsForBooking` | [bookings.ts:317](../../server/routes/bookings.ts#L317) |
| POST `/api/bookings/:bookingId/payments/:paymentId/verify` | F, D, A | params.bookingId, params.paymentId | `paymentService.verifyPayment` | [bookings.ts:344](../../server/routes/bookings.ts#L344) |
| POST `/api/bookings/:bookingId/payments/:paymentId/reject` | F, D, A | params.bookingId, params.paymentId, body.rejectionReason | `paymentService.rejectPayment` | [bookings.ts:366](../../server/routes/bookings.ts#L366) |
| POST `/api/bookings/:bookingId/payments/:paymentId/void` | F, D | params.bookingId, params.paymentId, body.voidReason | `paymentService.voidPayment` | [bookings.ts:390](../../server/routes/bookings.ts#L390) |
| POST `/api/bookings/:bookingId/dispatch` | F, D, O | params.bookingId | `bookingLifecycleService.dispatchToOperations` | [bookings.ts:418](../../server/routes/bookings.ts#L418) |
| POST `/api/bookings/:bookingId/cancel` | F, D | params.bookingId, body.cancellationReason | `bookingLifecycleService.cancelBooking` | [bookings.ts:440](../../server/routes/bookings.ts#L440) |
| PATCH `/api/bookings/:bookingId/services/accommodations/:serviceId` | F, D, R | params.bookingId, params.serviceId | `serviceConfirmationService.confirmAccommodation` | [bookings.ts:463](../../server/routes/bookings.ts#L463) |
| PATCH `/api/bookings/:bookingId/services/transports/:serviceId` | F, D, O | params.bookingId, params.serviceId | `serviceConfirmationService.confirmTransport` | [bookings.ts:485](../../server/routes/bookings.ts#L485) |
| PATCH `/api/bookings/:bookingId/services/activities/:serviceId` | F, D, O | params.bookingId, params.serviceId | `serviceConfirmationService.confirmActivity` | [bookings.ts:507](../../server/routes/bookings.ts#L507) |
| GET `/api/bookings/:bookingId/vouchers` | F, D, O | params.bookingId | `voucherService.listVouchers` | [bookings.ts:526](../../server/routes/bookings.ts#L526) |
| POST `/api/bookings/:bookingId/vouchers/generate` | F, D, O | params.bookingId | `voucherService.generateVouchers` | [bookings.ts:547](../../server/routes/bookings.ts#L547) |
| GET `/api/financial-exceptions/bookings/:bookingId` | F, D, A, SM, SE, R | params.bookingId | `financialExceptionService.getBookingOverview` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/bookings/:bookingId/amendments` | F, D, SM, SE | params.bookingId + amendment proposal | `financialExceptionService.proposeAmendment` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/amendments/:amendmentId/decision` | F, D, SM | params.amendmentId + decision/note | `financialExceptionService.decideAmendment` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/amendments/:amendmentId/apply` | F, D, SM | params.amendmentId | `financialExceptionService.applyAmendment` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/bookings/:bookingId/substitutions` | F, D, R | params.bookingId + inventory rate evidence | `financialExceptionService.proposeSubstitution` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/substitutions/:substitutionId/decision` | F, D | params.substitutionId + decision/note | `financialExceptionService.decideSubstitution` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/substitutions/:substitutionId/apply` | F, D, R | params.substitutionId | `financialExceptionService.applySubstitution` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/bookings/:bookingId/refunds/calculate` | F, D, A | params.bookingId + deduction/recovery evidence | `financialExceptionService.calculateRefund` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/refunds/:refundId/submit` | F, D, A | params.refundId | `financialExceptionService.submitRefund` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/refunds/:refundId/decision` | F, D | params.refundId + decision/amount/note | `financialExceptionService.decideRefund` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/refunds/:refundId/pay` | A | params.refundId + method/reference | `financialExceptionService.markRefundPaid` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/bookings/:bookingId/commissions/adjust` | F, D | params.bookingId + amount/reason/idempotencyKey | `financialExceptionService.adjustCommission` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| POST `/api/financial-exceptions/commissions/:employeeId/settlements` | F, D, A | params.employeeId + reference/reason/idempotencyKey | `financialExceptionService.settleCommission` | [financialExceptions.ts](../../server/routes/financialExceptions.ts) |
| GET `/api/customers` | F, D, SM, SE | query.cursor, query.limit | Local scoped handler | [customers.ts:240](../../server/routes/customers.ts#L240) |
| GET `/api/customers/:id` | F, D, SM, SE | params.id | Local scoped handler | [customers.ts:284](../../server/routes/customers.ts#L284) |
| POST `/api/customers` | F, D, SM, SE | Explicit customer write allowlist | Local scoped handler | [customers.ts:304](../../server/routes/customers.ts#L304) |
| PATCH `/api/customers/:id` | F, D, SM, SE | params.id, explicit customer write allowlist | Local scoped handler | [customers.ts:337](../../server/routes/customers.ts#L337) |
| GET `/api/public/quote-shares/:token` | Public capability/signature | params.token | `quoteService.openCustomerShare` | [customerSharesPublic.ts:17](../../server/routes/customerSharesPublic.ts#L17) |
| GET `/api/employees` | F, D | See linked handler and domain contract | `employeeManagementService.listEmployees` | [employees.ts:39](../../server/routes/employees.ts#L39) |
| GET `/api/employees/:employeeId` | F, D | params.employeeId | `employeeManagementService.getEmployee` | [employees.ts:52](../../server/routes/employees.ts#L52) |
| POST `/api/employees` | F, D | See linked handler and domain contract | `employeeManagementService.createEmployee` | [employees.ts:68](../../server/routes/employees.ts#L68) |
| PATCH `/api/employees/:employeeId` | F, D | params.employeeId | `employeeManagementService.updateEmployee` | [employees.ts:81](../../server/routes/employees.ts#L81) |
| GET `/api/leads` | F, D, SM, SE | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:324](../../server/routes/leads.ts#L324) |
| GET `/api/leads/customer-matches` | F, D, SM, SE | query.phone, query.email | Local handler / adapter; see source | [leads.ts:340](../../server/routes/leads.ts#L340) |
| POST `/api/leads` | F, D, SM, SE | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:376](../../server/routes/leads.ts#L376) |
| GET `/api/leads/distribution/overview` | F, D | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:469](../../server/routes/leads.ts#L469) |
| PATCH `/api/leads/distribution/config` | F, D | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:476](../../server/routes/leads.ts#L476) |
| GET `/api/leads/assignment-options` | F, D, SM | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:484](../../server/routes/leads.ts#L484) |
| GET `/api/leads/sales-queue` | F, D, SM, SE | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:491](../../server/routes/leads.ts#L491) |
| GET `/api/leads/whatsapp/unresolved` | F, D | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:498](../../server/routes/leads.ts#L498) |
| POST `/api/leads/whatsapp/unresolved/:unresolvedId/link` | F, D | params.unresolvedId | Local handler / adapter; see source | [leads.ts:505](../../server/routes/leads.ts#L505) |
| POST `/api/leads/whatsapp/demo/events` | F, D | See linked handler and domain contract | Local handler / adapter; see source | [leads.ts:513](../../server/routes/leads.ts#L513) |
| GET `/api/leads/:id/whatsapp/context` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:549](../../server/routes/leads.ts#L549) |
| POST `/api/leads/:id/whatsapp/messages` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:556](../../server/routes/leads.ts#L556) |
| POST `/api/leads/:id/whatsapp/messages/:entryId/retry` | F, D, SM, SE | params.id, params.entryId | Local handler / adapter; see source | [leads.ts:563](../../server/routes/leads.ts#L563) |
| GET `/api/leads/:id/conversation` | F, D, SM, SE | params.id, query.limit, query.cursor | Local handler / adapter; see source | [leads.ts:570](../../server/routes/leads.ts#L570) |
| POST `/api/leads/:id/conversation/entries` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:580](../../server/routes/leads.ts#L580) |
| GET `/api/leads/:id` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:587](../../server/routes/leads.ts#L587) |
| POST `/api/leads/:id/interaction` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:602](../../server/routes/leads.ts#L602) |
| GET `/api/leads/:id/assignment-history` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:614](../../server/routes/leads.ts#L614) |
| PATCH `/api/leads/:id/assignment` | F, D, SM | params.id | Local handler / adapter; see source | [leads.ts:621](../../server/routes/leads.ts#L621) |
| PATCH `/api/leads/:id` | F, D, SM, SE | params.id | Local handler / adapter; see source | [leads.ts:636](../../server/routes/leads.ts#L636) |
| GET `/api/public/meta-whatsapp/webhook` | Public capability/signature | See linked handler and domain contract | Local handler / adapter; see source | [metaWhatsAppWebhook.ts:14](../../server/routes/metaWhatsAppWebhook.ts#L14) |
| POST `/api/public/meta-whatsapp/webhook` | Public capability/signature | See linked handler and domain contract | Local handler / adapter; see source | [metaWhatsAppWebhook.ts:26](../../server/routes/metaWhatsAppWebhook.ts#L26) |
| GET `/api/operations/control-room` | F, D, O | See linked handler and domain contract | `controlRoomService.getControlRoom` | [operations.ts:50](../../server/routes/operations.ts#L50) |
| PATCH `/api/operations/bookings/:bookingId/assignment` | F, D | params.bookingId | `controlRoomService.assignOperations` | [operations.ts:63](../../server/routes/operations.ts#L63) |
| POST `/api/operations/bookings/:bookingId/issues` | F, D, O | params.bookingId | `liveOperationsService.createIssue` | [operations.ts:80](../../server/routes/operations.ts#L80) |
| PATCH `/api/operations/bookings/:bookingId/issues/:issueId` | F, D, O | params.bookingId, params.issueId | `liveOperationsService.updateIssue` | [operations.ts:93](../../server/routes/operations.ts#L93) |
| POST `/api/operations/bookings/:bookingId/change-requests` | F, D, O | params.bookingId | `liveOperationsService.createChangeRequest` | [operations.ts:111](../../server/routes/operations.ts#L111) |
| POST `/api/operations/bookings/:bookingId/spend-requests` | F, D, O | params.bookingId | `liveOperationsService.requestSpend` | [operations.ts:124](../../server/routes/operations.ts#L124) |
| GET `/api/operations/spend-requests` | F, D, A, O | See linked handler and domain contract | `liveOperationsService.listSpendRequests` | [operations.ts:137](../../server/routes/operations.ts#L137) |
| PATCH `/api/operations/spend-requests/:requestId/decision` | F, D, A | params.requestId | `liveOperationsService.decideSpend` | [operations.ts:150](../../server/routes/operations.ts#L150) |
| GET `/api/quotes/trips/:tripId/backup-accommodations` | F, D, SM, SE | params.tripId, query.sourceTripItemId | `quoteService.getBackupAccommodationOptions` | [quotes.ts:60](../../server/routes/quotes.ts#L60) |
| POST `/api/quotes` | F, D, SM, SE | See linked handler and domain contract | `quoteService.createQuote` | [quotes.ts:77](../../server/routes/quotes.ts#L77) |
| GET `/api/quotes/groups/:groupId/customer-comparison` | F, D, SM, SE | params.groupId | `quoteService.getOptionComparison` | [quotes.ts:94](../../server/routes/quotes.ts#L94) |
| POST `/api/quotes/groups/:groupId/reorder` | F, D, SM, SE | params.groupId | `quoteService.reorderOptions` | [quotes.ts:107](../../server/routes/quotes.ts#L107) |
| POST `/api/quotes/groups/:groupId/customer-shares` | F, D, SM, SE | params.groupId | `quoteService.createCustomerShare` | [quotes.ts:124](../../server/routes/quotes.ts#L124) |
| GET `/api/quotes/groups/:groupId/customer-shares` | F, D, SM, SE | params.groupId | `quoteService.listCustomerShares` | [quotes.ts:137](../../server/routes/quotes.ts#L137) |
| POST `/api/quotes/customer-shares/:shareId/revoke` | F, D, SM, SE | params.shareId | `quoteService.revokeCustomerShare` | [quotes.ts:150](../../server/routes/quotes.ts#L150) |
| GET `/api/quotes/customer-shares/:shareId/pdf` | F, D, SM, SE | params.shareId | `quoteService.generateCustomerSharePdf` | [quotes.ts:166](../../server/routes/quotes.ts#L166) |
| POST `/api/quotes/customer-shares/:shareId/deliveries/prepare` | F, D, SM, SE | params.shareId | `quoteService.prepareCustomerShareDelivery` | [quotes.ts:186](../../server/routes/quotes.ts#L186) |
| POST `/api/quotes/:id/duplicate-option` | F, D, SM, SE | params.id | `quoteService.duplicateOption` | [quotes.ts:206](../../server/routes/quotes.ts#L206) |
| PATCH `/api/quotes/:id/option` | F, D, SM, SE | params.id | `quoteService.updateOption` | [quotes.ts:221](../../server/routes/quotes.ts#L221) |
| POST `/api/quotes/:id/recommend-option` | F, D, SM, SE | params.id | `quoteService.recommendOption` | [quotes.ts:236](../../server/routes/quotes.ts#L236) |
| POST `/api/quotes/:id/refresh-option` | F, D, SM, SE | params.id | `quoteService.refreshOptionFromTrip` | [quotes.ts:251](../../server/routes/quotes.ts#L251) |
| PATCH `/api/quotes/:id` | F, D, SM, SE | params.id | `quoteService.updateQuote` | [quotes.ts:266](../../server/routes/quotes.ts#L266) |
| GET `/api/quotes/:id/customer-package` | F, D, SM, SE | params.id | `quoteService.getCustomerPackage` | [quotes.ts:283](../../server/routes/quotes.ts#L283) |
| POST `/api/quotes/:id/share` | F, D, SM, SE | params.id | `quoteService.shareQuote` | [quotes.ts:296](../../server/routes/quotes.ts#L296) |
| POST `/api/quotes/:id/convert-to-booking` | F, D, SM, SE | params.id | `quoteConversionService.convertQuoteToBooking` | [quotes.ts:326](../../server/routes/quotes.ts#L326) |
| GET `/api/quotes` | F, D, A, SM, SE | See linked handler and domain contract | Local handler / adapter; see source | [quotes.ts:345](../../server/routes/quotes.ts#L345) |
| GET `/api/quotes/:id` | F, D, A, SM, SE | params.id | Local handler / adapter; see source | [quotes.ts:413](../../server/routes/quotes.ts#L413) |
| GET `/api/supplier-payables` | F, D, A, R, O | See linked handler and domain contract | `service.listPayables` | [supplierPayables.ts:42](../../server/routes/supplierPayables.ts#L42) |
| GET `/api/supplier-payables/bookings/:bookingId` | F, D, A, R, O | params.bookingId | `service.getBookingSettlement` | [supplierPayables.ts:51](../../server/routes/supplierPayables.ts#L51) |
| GET `/api/supplier-payables/bookings/:bookingId/:obligationId` | F, D, A, R, O | params.bookingId, params.obligationId | `service.getPayable` | [supplierPayables.ts:60](../../server/routes/supplierPayables.ts#L60) |
| POST `/api/supplier-payables/bookings/:bookingId/:obligationId/payments` | F, D, A | params.bookingId, params.obligationId | `service.recordPayment` | [supplierPayables.ts:73](../../server/routes/supplierPayables.ts#L73) |
| POST `/api/supplier-payables/bookings/:bookingId/:obligationId/payments/:paymentId/verify` | F, D, A | params.bookingId, params.obligationId, params.paymentId | `service.verifyPayment` | [supplierPayables.ts:91](../../server/routes/supplierPayables.ts#L91) |
| POST `/api/supplier-payables/bookings/:bookingId/:obligationId/payments/:paymentId/reject` | F, D, A | params.bookingId, params.obligationId, params.paymentId | `service.rejectPayment` | [supplierPayables.ts:109](../../server/routes/supplierPayables.ts#L109) |
| POST `/api/supplier-payables/bookings/:bookingId/:obligationId/payments/:paymentId/void` | F, D | params.bookingId, params.obligationId, params.paymentId | `service.voidPayment` | [supplierPayables.ts:128](../../server/routes/supplierPayables.ts#L128) |
| GET `/api/transport/vehicle-categories` | F, D, A, SM, SE, R, O | See linked handler and domain contract | `inventoryManagementService.listVehicleCategories` | [transport.ts:42](../../server/routes/transport.ts#L42) |
| POST `/api/transport/vehicle-categories` | F, D | See linked handler and domain contract | `inventoryManagementService.createVehicle` | [transport.ts:43](../../server/routes/transport.ts#L43) |
| PATCH `/api/transport/vehicle-categories/:id` | F, D | params.id | `inventoryManagementService.updateVehicle` | [transport.ts:44](../../server/routes/transport.ts#L44) |
| GET `/api/transport/rates` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listTransportRates` | [transport.ts:46](../../server/routes/transport.ts#L46) |
| POST `/api/transport/rates` | F, D | See linked handler and domain contract | `inventoryManagementService.createTransportRate` | [transport.ts:47](../../server/routes/transport.ts#L47) |
| PATCH `/api/transport/rates/:id` | F, D | params.id | `inventoryManagementService.updateTransportRate` | [transport.ts:48](../../server/routes/transport.ts#L48) |
| GET `/api/transport/suppliers` | F, D, A, R | See linked handler and domain contract | `inventoryManagementService.listSuppliers` | [transport.ts:50](../../server/routes/transport.ts#L50) |
| POST `/api/transport/suppliers` | F, D | See linked handler and domain contract | `inventoryManagementService.createSupplier` | [transport.ts:51](../../server/routes/transport.ts#L51) |
| PATCH `/api/transport/suppliers/:id` | F, D | params.id | `inventoryManagementService.updateSupplier` | [transport.ts:52](../../server/routes/transport.ts#L52) |
| POST `/api/transport/calculate-rate` | F, D, A, SM, SE, R, O | body.vehicleCategoryId, body.startDate, body.serviceType, body.vehicleDays, body.vehicleCount, body.chargeableDays, body.nightHalts, body.occurrences, body.distanceKm, body.hours | `inventoryManagementService.vehicleSnapshot`, `inventoryManagementService.transportCalculationData`, `inventoryManagementService.supplierSnapshot` | [transport.ts:54](../../server/routes/transport.ts#L54) |
| POST `/api/trips/calculate-costs` | Active employee; service policy | body.tripId, body.items | Local handler / adapter; see source | [trips.ts:102](../../server/routes/trips.ts#L102) |
| POST `/api/trips/:tripId/itinerary-days` | F, D, SM, SE | params.tripId | `tripService.createItineraryDay` | [trips.ts:510](../../server/routes/trips.ts#L510) |
| PATCH `/api/trips/itinerary-days/:dayId` | F, D, SM, SE | params.dayId | `tripService.updateItineraryDay` | [trips.ts:528](../../server/routes/trips.ts#L528) |
| POST `/api/trips/itinerary-days/:dayId/compose-customer-content` | F, D, SM, SE | params.dayId | `tripService.composeItineraryDayCustomerContent` | [trips.ts:543](../../server/routes/trips.ts#L543) |
| POST `/api/trips/itinerary-days/:dayId/review-customer-content` | F, D, SM, SE | params.dayId | `tripService.reviewItineraryDayCustomerContent` | [trips.ts:558](../../server/routes/trips.ts#L558) |
| DELETE `/api/trips/itinerary-days/:dayId` | F, D, SM, SE | params.dayId | `tripService.deleteItineraryDay` | [trips.ts:573](../../server/routes/trips.ts#L573) |
| POST `/api/trips/itinerary-days/:dayId/items` | F, D, SM, SE | params.dayId | `tripService.addItineraryItem` | [trips.ts:588](../../server/routes/trips.ts#L588) |
| PATCH `/api/trips/itinerary-days/:dayId/items/:itemId` | F, D, SM, SE | params.dayId, params.itemId | `tripService.updateItineraryItem` | [trips.ts:603](../../server/routes/trips.ts#L603) |
| DELETE `/api/trips/itinerary-days/:dayId/items/:itemId` | F, D, SM, SE | params.dayId, params.itemId | `tripService.deleteItineraryItem` | [trips.ts:618](../../server/routes/trips.ts#L618) |
| GET `/api/trips/:tripId/itinerary-days` | F, D, A, SM, SE, R, O | params.tripId | Local handler / adapter; see source | [trips.ts:633](../../server/routes/trips.ts#L633) |
| POST `/api/trips/from-lead/:leadId` | F, D, SM, SE | params.leadId | `tripService.createOrResumeLeadTrip` | [trips.ts:660](../../server/routes/trips.ts#L660) |
| POST `/api/trips/:id/reconcile-lead` | F, D, SM, SE | params.id | `tripService.reconcileLeadChanges` | [trips.ts:680](../../server/routes/trips.ts#L680) |
| POST `/api/trips` | F, D, SM, SE | See linked handler and domain contract | `tripService.createTrip` | [trips.ts:695](../../server/routes/trips.ts#L695) |
| PATCH `/api/trips/:id` | F, D, SM, SE | params.id | `tripService.updateTrip` | [trips.ts:715](../../server/routes/trips.ts#L715) |
| DELETE `/api/trips/:id` | F, D, SM, SE | params.id | `tripService.deleteTrip` | [trips.ts:735](../../server/routes/trips.ts#L735) |
| GET `/api/trips` | F, D, A, O, R, SM, SE | See linked handler and domain contract | Local handler / adapter; see source | [trips.ts:748](../../server/routes/trips.ts#L748) |
| GET `/api/trips/:id` | F, D, A, SM, SE, R, O | params.id | Local handler / adapter; see source | [trips.ts:820](../../server/routes/trips.ts#L820) |

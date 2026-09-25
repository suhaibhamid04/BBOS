import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
  FinancialSnapshot,
  LineItemCostSnapshot,
} from '../../src/types/booking.js';
import type {
  BookingDetailResponse,
  BookingListItem,
  BookingPaymentSummary,
} from '../../src/types/bookingApi.js';
import type { AuthorizationDecision, AuthorizationPrincipal } from './policyTypes.js';

type UnknownRecord = Record<string, unknown>;
type BookingVisibility = 'FULL' | 'RESERVATIONS' | 'OPERATIONS';

function assertAllowed(authorization: AuthorizationDecision): void {
  if (!authorization.allowed || authorization.code !== 'ALLOWED') {
    throw new Error('Cannot build a Booking DTO for a denied authorization decision.');
  }
}

function visibilityFor(principal: AuthorizationPrincipal): BookingVisibility {
  if (principal.role === 'Operations') return 'OPERATIONS';
  if (principal.role === 'Reservations') return 'RESERVATIONS';
  if (
    principal.role === 'Founder' || principal.role === 'Admin' || principal.role === 'Accounts' ||
    principal.role === 'Sales Manager' || principal.role === 'Sales Executive'
  ) {
    return 'FULL';
  }
  throw new Error('Cannot build a Booking DTO for an unknown or denied role.');
}

function projectFields<T extends UnknownRecord>(source: T, fields: readonly string[]): UnknownRecord {
  const output: UnknownRecord = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      output[field] = source[field];
    }
  }
  return output;
}

const BOOKING_BASE_FIELDS = [
  'id', 'bookingReference', 'tripId', 'customerId', 'customerName', 'customerPhone',
  'customerEmail', 'leadId', 'quoteId', 'quoteVersion', 'status', 'currency',
  'confirmationProgress', 'travelStartDate', 'travelEndDate', 'guestNotes',
  'specialRequests', 'schemaVersion', 'createdAt', 'updatedAt', 'isDemo',
] as const;

const BOOKING_FULL_FIELDS = [
  ...BOOKING_BASE_FIELDS,
  'paymentStatus', 'totalSellingPrice', 'totalAmount', 'amountReceived', 'amountPending',
  'isOverpaid', 'overpaidAmount', 'assignedSalesEmployeeId', 'assignedSalesManagerId',
  'salesTeamId', 'assignedReservationsEmployeeId', 'assignedOperationsEmployeeId',
] as const;

const BOOKING_RESERVATIONS_FIELDS = [
  ...BOOKING_BASE_FIELDS,
  'assignedReservationsEmployeeId',
] as const;

const BOOKING_OPERATIONS_FIELDS = [
  ...BOOKING_BASE_FIELDS,
  'assignedOperationsEmployeeId',
] as const;

const ACCOMMODATION_FIELDS = [
  'id', 'bookingId', 'tripId', 'customerId', 'propertyId', 'propertyName',
  'roomCategoryId', 'roomCategoryName', 'mealPlan', 'checkInDate', 'checkOutDate',
  'nightsCount', 'roomsCount', 'adultsCount', 'childrenCount', 'guestNames',
  'specialRequests', 'supplierId', 'supplierContactName', 'supplierContactPhone',
  'confirmationStatus', 'supplierConfirmationCode', 'allocatedRoomNumbers',
  'operationalNotes', 'supplierNotes', 'voucherId', 'voucherStatus', 'schemaVersion',
  'createdAt', 'updatedAt', 'isDemo',
] as const;

const SUPPLIER_CONFIRMATION_FIELDS = [
  'bookingReference', 'serviceId', 'supplierId', 'propertyId', 'propertyName',
  'status', 'confirmationReference', 'confirmedRoomCategoryId',
  'confirmedRoomCategoryName', 'confirmedMealPlan', 'confirmedCheckInDate',
  'confirmedCheckOutDate', 'confirmedGuestNames', 'confirmedRoomsCount',
  'confirmedAdultsCount', 'confirmedChildrenCount', 'supplierNotes', 'confirmedAt',
  'confirmedByEmployeeId', 'updatedAt', 'updatedByEmployeeId',
  'requiresCommercialApproval',
] as const;

const RATE_DISCREPANCY_FIELDS = [
  'frozenSupplierUnitRate', 'confirmedSupplierUnitRate', 'difference', 'reason',
  'recordedAt', 'recordedByEmployeeId', 'requiresCommercialApproval',
  'approvalStatus',
] as const;

const TRANSPORT_FIELDS = [
  'id', 'bookingId', 'tripId', 'customerId', 'vehicleCategoryId', 'vehicleCategoryName',
  'routeId', 'routeName', 'serviceDate', 'endDate', 'daysCount', 'pickupLocation',
  'dropoffLocation', 'pickupTime', 'passengerCount', 'specialRequests', 'supplierId',
  'driverId', 'driverName', 'driverPhone', 'vehicleRegistrationNumber',
  'confirmationStatus', 'operationalNotes', 'supplierNotes', 'voucherId', 'voucherStatus',
  'schemaVersion', 'createdAt', 'updatedAt', 'isDemo',
] as const;

const ACTIVITY_FIELDS = [
  'id', 'bookingId', 'tripId', 'customerId', 'activityMasterId', 'activityName',
  'destinationId', 'destinationName', 'serviceDate', 'sessionTime', 'participantCount',
  'leadGuestName', 'specialRequests', 'supplierId', 'confirmationStatus',
  'supplierConfirmationCode', 'ticketNumbers', 'assignedGuideName', 'assignedGuidePhone',
  'operationalNotes', 'voucherId', 'voucherStatus', 'schemaVersion', 'createdAt',
  'updatedAt', 'isDemo',
] as const;

const SNAPSHOT_FULL_FIELDS = [
  'id', 'bookingId', 'snapshotVersion', 'quoteId', 'quoteVersion', 'currency',
  'totalSellingPrice', 'totalSupplierCost', 'accommodationSupplierCost',
  'transportSupplierCost', 'activitySupplierCost', 'otherSupplierCosts', 'grossProfit',
  'grossMargin', 'rateValidationFingerprint', 'createdAt', 'createdBy',
] as const;

const SNAPSHOT_RESERVATIONS_FIELDS = [
  'id', 'bookingId', 'snapshotVersion', 'quoteId', 'quoteVersion', 'currency',
  'totalSupplierCost', 'accommodationSupplierCost', 'transportSupplierCost',
  'activitySupplierCost', 'otherSupplierCosts', 'rateValidationFingerprint', 'createdAt',
] as const;

const LINE_ITEM_FULL_FIELDS = [
  'serviceId', 'serviceType', 'supplierId', 'supplierName', 'inventoryMasterId',
  'ratePeriodId', 'rateContractType', 'frozenSupplierUnitRate', 'units',
  'frozenSupplementsCost', 'frozenTotalSupplierCost', 'taxTreatment', 'taxAmount',
  'rateVerifiedAt',
] as const;

function projectBooking(booking: Booking, visibility: BookingVisibility): BookingListItem {
  const fields = visibility === 'FULL'
    ? BOOKING_FULL_FIELDS
    : visibility === 'RESERVATIONS'
      ? BOOKING_RESERVATIONS_FIELDS
      : BOOKING_OPERATIONS_FIELDS;
  return projectFields(booking as unknown as UnknownRecord, fields) as BookingListItem;
}

function projectServices<T extends UnknownRecord>(records: readonly T[], fields: readonly string[]): Partial<T>[] {
  return records.map(record => projectFields(record, fields) as Partial<T>);
}

function projectAccommodations(
  records: readonly BookingAccommodation[],
  visibility: BookingVisibility,
): Partial<BookingAccommodation>[] {
  return records.map(record => {
    const projected = projectFields(record as unknown as UnknownRecord, ACCOMMODATION_FIELDS);
    if (visibility !== 'OPERATIONS' && record.supplierConfirmation) {
      const confirmation = projectFields(
        record.supplierConfirmation as unknown as UnknownRecord,
        SUPPLIER_CONFIRMATION_FIELDS,
      );
      if (record.supplierConfirmation.rateDiscrepancy) {
        confirmation.rateDiscrepancy = projectFields(
          record.supplierConfirmation.rateDiscrepancy as unknown as UnknownRecord,
          RATE_DISCREPANCY_FIELDS,
        );
      }
      projected.supplierConfirmation = confirmation;
    }
    return projected as Partial<BookingAccommodation>;
  });
}

function projectFinancialSnapshot(
  snapshot: FinancialSnapshot | null | undefined,
  visibility: BookingVisibility,
): Partial<FinancialSnapshot> | null | undefined {
  if (visibility === 'OPERATIONS') return undefined;
  if (!snapshot) return null;

  const fields = visibility === 'FULL' ? SNAPSHOT_FULL_FIELDS : SNAPSHOT_RESERVATIONS_FIELDS;
  const projected = projectFields(snapshot as unknown as UnknownRecord, fields) as Partial<FinancialSnapshot>;
  projected.lineItems = (snapshot.lineItems || []).map(item =>
    projectFields(item as unknown as UnknownRecord, LINE_ITEM_FULL_FIELDS) as unknown as LineItemCostSnapshot
  );
  return projected;
}

export function buildBookingListDto(
  principal: AuthorizationPrincipal,
  booking: Booking,
  authorization: AuthorizationDecision,
): BookingListItem {
  assertAllowed(authorization);
  return projectBooking(booking, visibilityFor(principal));
}

export function buildBookingDetailDto(
  principal: AuthorizationPrincipal,
  data: {
    booking: Booking;
    accommodations: BookingAccommodation[];
    transports: BookingTransport[];
    activities: BookingActivity[];
    financialSnapshot?: FinancialSnapshot | null;
  },
  authorization: AuthorizationDecision,
): BookingDetailResponse {
  assertAllowed(authorization);
  const visibility = visibilityFor(principal);
  const booking = projectBooking(data.booking, visibility);
  const paymentSummary: BookingPaymentSummary | null = visibility === 'FULL'
    ? {
        paymentStatus: data.booking.paymentStatus || 'UNPAID',
        amountReceived: data.booking.amountReceived || 0,
        amountPending: data.booking.amountPending || 0,
        totalSellingPrice: data.booking.totalSellingPrice,
      }
    : null;
  const financialSnapshot = projectFinancialSnapshot(data.financialSnapshot, visibility);

  return {
    booking,
    accommodations: projectAccommodations(data.accommodations, visibility),
    transports: projectServices(
      data.transports as unknown as UnknownRecord[], TRANSPORT_FIELDS,
    ) as Partial<BookingTransport>[],
    activities: projectServices(
      data.activities as unknown as UnknownRecord[], ACTIVITY_FIELDS,
    ) as Partial<BookingActivity>[],
    paymentSummary,
    ...(financialSnapshot !== undefined ? { financialSnapshot } : {}),
  };
}

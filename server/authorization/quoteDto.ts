import type { AuthorizationDecision } from './policyTypes.js';

type UnknownRecord = Record<string, any>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function pick(source: UnknownRecord, fields: readonly string[]): UnknownRecord {
  const output: UnknownRecord = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      output[field] = source[field];
    }
  }
  return output;
}

const QUOTE_ROOT_FIELDS = [
  'id', 'leadId', 'customerId', 'customerName', 'customerPhone', 'customerEmail',
  'destination', 'tripId', 'travelerCount', 'adults', 'children', 'packageId',
  'packageName', 'durationDays', 'durationNights', 'totalAmount', 'discountAmount',
  'finalAmount', 'totalSupplierCost', 'grossProfit', 'grossMargin', 'status',
  'validUntil', 'createdAt', 'updatedAt', 'notes', 'internalNotes', 'inclusions',
  'exclusions', 'termsAndConditions', 'salesEmployeeId', 'salesEmployeeName',
  'salesTeamId', 'createdByEmployeeId', 'updatedByEmployeeId', 'version', 'isDemo',
  'convertedBookingId', 'requiresLowMarginApproval',
] as const;

const HOTEL_FIELDS = [
  'id', 'hotelId', 'hotelName', 'propertyId', 'roomCategoryId', 'ratePeriodId',
  'negotiatedRateId', 'roomType', 'mealPlan', 'checkInDate', 'checkOutDate', 'nights',
  'roomsCount', 'rooms', 'adultsCount', 'childrenCount', 'rate', 'quotedRate',
  'supplierCost', 'isFoc', 'focReason', 'guestNames', 'specialRequests',
] as const;

const TRANSPORT_FIELDS = [
  'id', 'transportId', 'vehicleCategoryId', 'transportRouteId', 'ratePeriodId',
  'vehicleType', 'route', 'serviceDate', 'days', 'passengerCount', 'pickupLocation',
  'dropoffLocation', 'rate', 'quotedRate', 'supplierCost', 'isFoc', 'focReason',
  'specialRequests',
] as const;

const ACTIVITY_FIELDS = [
  'id', 'activityId', 'activityMasterId', 'activityRatePeriodId', 'name',
  'activityName', 'destinationId', 'destinationName', 'serviceDate', 'date', 'pax',
  'rate', 'quotedRate', 'supplierCost', 'isFoc', 'focReason', 'specialRequests',
] as const;

const VERSION_FIELDS = [
  'version', 'updatedAt', 'updatedBy', 'totalAmount', 'discountAmount', 'finalAmount',
  'status', 'notes', 'inclusions', 'exclusions', 'termsAndConditions',
] as const;

/** Explicit internal Quote DTO. Callers must authorize the resource first. */
export function buildQuoteDto(
  value: unknown,
  authorization: AuthorizationDecision,
): UnknownRecord {
  if (!authorization.allowed || authorization.code !== 'ALLOWED') {
    throw new Error('Cannot build a Quote DTO for a denied authorization decision.');
  }

  const quote = asRecord(value);
  const dto = pick(quote, QUOTE_ROOT_FIELDS);

  if (Array.isArray(quote.hotels)) dto.hotels = quote.hotels.map((item: unknown) => pick(asRecord(item), HOTEL_FIELDS));
  if (Array.isArray(quote.transports)) dto.transports = quote.transports.map((item: unknown) => pick(asRecord(item), TRANSPORT_FIELDS));
  if (Array.isArray(quote.activities)) dto.activities = quote.activities.map((item: unknown) => pick(asRecord(item), ACTIVITY_FIELDS));
  if (Array.isArray(quote.versionHistory)) {
    dto.versionHistory = quote.versionHistory.map((item: unknown) => pick(asRecord(item), VERSION_FIELDS));
  }
  if (quote.supplierCostSource) {
    dto.supplierCostSource = pick(asRecord(quote.supplierCostSource), ['type', 'sourceId', 'asOf']);
  }
  if (quote.approval) dto.approval = pick(asRecord(quote.approval), ['required', 'state']);

  return dto;
}

const BOOKING_FIELDS = [
  'id', 'bookingReference', 'tripId', 'customerId', 'customerName', 'customerPhone',
  'customerEmail', 'leadId', 'quoteId', 'quoteVersion', 'status', 'paymentStatus',
  'totalSellingPrice', 'totalAmount', 'amountReceived', 'amountPending',
  'travelStartDate', 'travelEndDate',
  'assignedSalesEmployeeId', 'salesTeamId', 'schemaVersion', 'createdAt', 'updatedAt',
  'isDemo',
] as const;

const CONFIRMATION_PROGRESS_FIELDS = [
  'totalServices', 'confirmedServices', 'requestedServices', 'cancelledServices',
  'allConfirmed',
] as const;

const SERVICE_FIELDS = [
  'id', 'bookingId', 'tripId', 'customerId', 'propertyId', 'propertyName',
  'roomCategoryId', 'roomCategoryName', 'mealPlan', 'checkInDate', 'checkOutDate',
  'nightsCount', 'roomsCount', 'adultsCount', 'childrenCount', 'guestNames',
  'specialRequests', 'supplierId', 'vehicleCategoryId', 'vehicleCategoryName', 'routeId',
  'routeName', 'serviceDate', 'endDate', 'daysCount', 'pickupLocation', 'dropoffLocation',
  'passengerCount', 'activityMasterId', 'activityName', 'destinationId',
  'destinationName', 'participantCount', 'confirmationStatus', 'voucherStatus',
  'schemaVersion', 'createdAt', 'updatedAt', 'isDemo',
] as const;

/** Explicit conversion response; financial snapshots and supplier amounts cannot pass through. */
export function buildQuoteConversionDto(value: unknown): UnknownRecord {
  const result = asRecord(value);
  const sourceBooking = asRecord(result.booking);
  const booking = pick(sourceBooking, BOOKING_FIELDS);
  if (sourceBooking.confirmationProgress) {
    booking.confirmationProgress = pick(
      asRecord(sourceBooking.confirmationProgress),
      CONFIRMATION_PROGRESS_FIELDS,
    );
  }
  const confirmationProgress = result.confirmationProgress
    ? pick(asRecord(result.confirmationProgress), CONFIRMATION_PROGRESS_FIELDS)
    : undefined;
  return {
    success: result.success === true,
    isDuplicate: result.isDuplicate === true,
    booking,
    accommodations: Array.isArray(result.accommodations)
      ? result.accommodations.map((item: unknown) => pick(asRecord(item), SERVICE_FIELDS))
      : [],
    transports: Array.isArray(result.transports)
      ? result.transports.map((item: unknown) => pick(asRecord(item), SERVICE_FIELDS))
      : [],
    activities: Array.isArray(result.activities)
      ? result.activities.map((item: unknown) => pick(asRecord(item), SERVICE_FIELDS))
      : [],
    ...(confirmationProgress ? { confirmationProgress } : {}),
    quoteStatus: result.quoteStatus,
    message: result.message,
  };
}

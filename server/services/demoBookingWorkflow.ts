import type { AuditLog } from '../../src/types/index.js';
import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
  FinancialSnapshot,
} from '../../src/types/booking.js';
import type { BookingListFilter, BookingListResponse } from '../../src/types/bookingApi.js';
import type { PaymentRecord } from '../../src/types/payment.js';
import type { SupplierPaymentRecord } from '../../src/types/supplierPayable.js';
import type { QueryConstraint } from '../authorization/policyTypes.js';
import { resolveQueryScope } from '../authorization/policyEngine.js';
import type { BookingQueryProvider, BookingWithServices } from '../../src/services/booking/bookingQueryProvider.js';
import type {
  PaymentStorageProvider,
  PaymentTransaction,
} from '../../src/services/payment/paymentStorageProvider.js';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';
import type { LifecycleStorageProvider } from './bookingLifecycleService.js';
import type { ConfirmationStorageProvider } from './serviceConfirmationService.js';
import type {
  OperationalBookingBundle,
  OperationsActor,
  OperationsAssignmentCommit,
  OperationsControlRoomStorage,
} from './operationsControlRoomService.js';
import type {
  SupplierPayableStorageProvider,
  SupplierPayableTransaction,
  SupplierSourceBundle,
} from './supplierPayableService.js';
import type {
  ReservationsAssignmentCommit,
  ReservationsAssignmentStorage,
} from './reservationsAssignmentService.js';
import { PRESET_USERS } from '../../src/services/permissions.js';

const clone = <T>(value: T): T => structuredClone(value);

function dateInIndia(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function plusDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const today = dateInIndia();
const tomorrow = plusDays(today, 1);
const dayAfter = plusDays(today, 2);
const seededAt = `${today}T00:00:00.000Z`;

export const QA1_BOOKING_ID = 'booking-qa1-01';
export const QA1_BOOKING_REFERENCE = 'BBOS-QA1-001';
export const QA1_ACCOMMODATION_ID = 'booking-accommodation-qa1';
export const QA1_TRANSPORT_ID = 'booking-transport-qa1';
export const QA1_ACTIVITY_ID = 'booking-activity-qa1';

const booking: Booking = {
  id: QA1_BOOKING_ID,
  bookingReference: QA1_BOOKING_REFERENCE,
  tripId: 'trip-qa1-01',
  quoteId: 'quote-qa1-01',
  quoteVersion: 1,
  leadId: 'lead-qa1-01',
  customerId: 'customer-qa1-01',
  customerName: 'QA Lifecycle Guest',
  customerPhone: '+91 9876543210',
  customerEmail: 'qa.lifecycle@example.com',
  status: 'PENDING_PAYMENT',
  paymentStatus: 'UNPAID',
  currency: 'INR',
  totalSellingPrice: 30_000,
  totalAmount: 30_000,
  amountReceived: 0,
  amountPending: 30_000,
  confirmationProgress: {
    totalServices: 3, confirmedServices: 0, requestedServices: 3,
    cancelledServices: 0, allConfirmed: false,
  },
  travelStartDate: today,
  travelEndDate: dayAfter,
  assignedSalesEmployeeId: 'emp-sales-01',
  salesTeamId: 'sales-team-01',
  schemaVersion: '2B-5',
  createdAt: seededAt,
  updatedAt: seededAt,
  isDemo: true,
};

const accommodation: BookingAccommodation = {
  id: QA1_ACCOMMODATION_ID,
  bookingId: booking.id,
  tripId: booking.tripId,
  customerId: booking.customerId,
  sourceQuoteServiceId: 'quote-hotel-qa1',
  propertyId: 'demo-hotel-03',
  propertyName: 'QA Lake Hotel',
  roomCategoryId: 'qa-deluxe-room',
  roomCategoryName: 'Deluxe Lake View',
  mealPlan: 'CP',
  checkInDate: today,
  checkOutDate: dayAfter,
  nightsCount: 2,
  roomsCount: 1,
  adultsCount: 2,
  childrenCount: 0,
  guestNames: ['QA Lifecycle Guest'],
  supplierId: 'supplier-hotel-qa1',
  supplierContactName: 'Hotel Reservations Desk',
  supplierContactPhone: '+91 9000000011',
  confirmationStatus: 'REQUESTED',
  voucherStatus: 'PENDING',
  schemaVersion: '2B-5',
  createdAt: seededAt,
  updatedAt: seededAt,
  isDemo: true,
};

const transport: BookingTransport = {
  id: QA1_TRANSPORT_ID,
  bookingId: booking.id,
  tripId: booking.tripId,
  customerId: booking.customerId,
  sourceQuoteServiceId: 'quote-transport-qa1',
  vehicleCategoryId: 'vehicle-suv-qa1',
  vehicleCategoryName: 'Private SUV',
  routeName: 'Srinagar Airport to QA Lake Hotel',
  serviceDate: today,
  daysCount: 1,
  pickupLocation: 'Srinagar Airport',
  dropoffLocation: 'QA Lake Hotel',
  pickupTime: '10:30',
  passengerCount: 2,
  supplierId: 'supplier-transport-qa1',
  confirmationStatus: 'REQUESTED',
  voucherStatus: 'PENDING',
  schemaVersion: '2B-5',
  createdAt: seededAt,
  updatedAt: seededAt,
  isDemo: true,
};

const activity: BookingActivity = {
  id: QA1_ACTIVITY_ID,
  bookingId: booking.id,
  tripId: booking.tripId,
  customerId: booking.customerId,
  sourceQuoteServiceId: 'quote-activity-qa1',
  activityMasterId: 'activity-shikara-qa1',
  activityName: 'Private Shikara Ride',
  destinationId: 'destination-srinagar',
  destinationName: 'Srinagar',
  serviceDate: tomorrow,
  sessionTime: '16:00',
  participantCount: 2,
  leadGuestName: booking.customerName,
  supplierId: 'supplier-activity-qa1',
  confirmationStatus: 'REQUESTED',
  voucherStatus: 'PENDING',
  schemaVersion: '2B-5',
  createdAt: seededAt,
  updatedAt: seededAt,
  isDemo: true,
};

const snapshot: FinancialSnapshot = {
  id: 'financial-snapshot-qa1',
  bookingId: booking.id,
  snapshotVersion: 1,
  quoteId: booking.quoteId!,
  quoteVersion: 1,
  currency: 'INR',
  totalSellingPrice: 30_000,
  totalSupplierCost: 20_000,
  accommodationSupplierCost: 12_000,
  transportSupplierCost: 6_000,
  activitySupplierCost: 2_000,
  otherSupplierCosts: 0,
  grossProfit: 10_000,
  grossMargin: 33.33,
  lineItems: [
    {
      serviceId: 'quote-hotel-qa1', serviceType: 'ACCOMMODATION',
      supplierId: accommodation.supplierId, supplierName: 'QA Lake Hotel Supplier',
      inventoryMasterId: accommodation.propertyId, ratePeriodId: 'rate-hotel-qa1',
      rateContractType: 'NEGOTIATED', frozenSupplierUnitRate: 6_000, units: 2,
      frozenSupplementsCost: 0, frozenTotalSupplierCost: 12_000,
      taxTreatment: 'INCLUSIVE', taxAmount: 0, rateVerifiedAt: seededAt,
    },
    {
      serviceId: 'quote-transport-qa1', serviceType: 'TRANSPORT',
      supplierId: transport.supplierId, supplierName: 'QA Transport Supplier',
      inventoryMasterId: transport.vehicleCategoryId, ratePeriodId: 'rate-transport-qa1',
      rateContractType: 'STANDARD', frozenSupplierUnitRate: 6_000, units: 1,
      frozenSupplementsCost: 0, frozenTotalSupplierCost: 6_000,
      taxTreatment: 'INCLUSIVE', taxAmount: 0, rateVerifiedAt: seededAt,
    },
    {
      serviceId: 'quote-activity-qa1', serviceType: 'ACTIVITY',
      supplierId: activity.supplierId, supplierName: 'QA Activity Supplier',
      inventoryMasterId: activity.activityMasterId, ratePeriodId: 'rate-activity-qa1',
      rateContractType: 'STANDARD', frozenSupplierUnitRate: 1_000, units: 2,
      frozenSupplementsCost: 0, frozenTotalSupplierCost: 2_000,
      taxTreatment: 'INCLUSIVE', taxAmount: 0, rateVerifiedAt: seededAt,
    },
  ],
  rateValidationFingerprint: 'qa1-frozen-snapshot-v1',
  createdAt: seededAt,
  createdBy: 'emp-sales-01',
};

const store = new InMemoryConversionStorageProvider({ bookings: [booking] });
store.rawSet('booking_accommodations', accommodation.id, accommodation);
store.rawSet('booking_transports', transport.id, transport);
store.rawSet('booking_activities', activity.id, activity);
store.rawSet(`bookings/${booking.id}/financial_snapshot`, snapshot.id, snapshot);

function matches(record: Record<string, unknown>, constraints: readonly QueryConstraint[]): boolean {
  return constraints.every(constraint => constraint.operator === '=='
    ? record[constraint.field] === constraint.value
    : Array.isArray(constraint.value) && constraint.value.includes(record[constraint.field] as string));
}

function servicesFor(bookingId: string) {
  return {
    accommodations: store.rawList('booking_accommodations').filter(item => item.bookingId === bookingId) as BookingAccommodation[],
    transports: store.rawList('booking_transports').filter(item => item.bookingId === bookingId) as BookingTransport[],
    activities: store.rawList('booking_activities').filter(item => item.bookingId === bookingId) as BookingActivity[],
  };
}

function snapshotFor(bookingId: string): FinancialSnapshot | null {
  const snapshots = store.rawList(`bookings/${bookingId}/financial_snapshot`) as FinancialSnapshot[];
  snapshots.sort((left, right) => right.snapshotVersion - left.snapshotVersion);
  return snapshots[0] || null;
}

export const demoBookingQueryProvider: BookingQueryProvider = {
  async listBookings(filter: BookingListFilter, constraints: QueryConstraint[]): Promise<BookingListResponse> {
    let rows = (store.rawList('bookings') as Booking[])
      .filter(item => matches(item as unknown as Record<string, unknown>, constraints));
    if (filter.status) rows = rows.filter(item => item.status === filter.status);
    if (filter.paymentStatus) rows = rows.filter(item => item.paymentStatus === filter.paymentStatus);
    if (filter.query) rows = rows.filter(item => item.bookingReference === filter.query);
    rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const cursorIndex = filter.cursor ? rows.findIndex(item => item.id === filter.cursor) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const limit = filter.limit || 20;
    const page = rows.slice(start, start + limit + 1);
    const hasMore = page.length > limit;
    const data = hasMore ? page.slice(0, limit) : page;
    return { data, hasMore, nextCursor: hasMore ? data[data.length - 1].id : null };
  },
  async getBooking(bookingId: string) {
    return store.rawGet('bookings', bookingId) as Booking | null;
  },
  async getBookingWithServices(bookingId: string): Promise<BookingWithServices | null> {
    const root = store.rawGet('bookings', bookingId) as Booking | null;
    if (!root) return null;
    return { booking: root, ...servicesFor(bookingId), financialSnapshot: snapshotFor(bookingId) };
  },
};

export const demoPaymentStorageProvider: PaymentStorageProvider = {
  async getBooking(bookingId) { return store.rawGet('bookings', bookingId) as Booking | null; },
  async getPayment(paymentId) { return store.rawGet('payments', paymentId) as PaymentRecord | null; },
  async getPaymentsForBooking(bookingId) {
    return store.rawList('payments').filter(item => item.bookingId === bookingId) as PaymentRecord[];
  },
  async savePayment(payment) { store.rawSet('payments', payment.id, payment); },
  async updateBooking(bookingId, updates) { store.rawUpdate('bookings', bookingId, updates); },
  async logAuditEvent(audit) { store.rawSet('audit_logs', audit.id, audit); },
  async runTransaction<T>(operation: (transaction: PaymentTransaction) => Promise<T>): Promise<T> {
    return store.runTransaction(async transaction => operation({
      getBooking: async id => transaction.get('bookings', id),
      getPayment: async id => transaction.get('payments', id),
      getPaymentsForBooking: async id => transaction.findByField('payments', 'bookingId', id, 500),
      setPayment: (id, data) => transaction.set('payments', id, data),
      updateBooking: (id, data) => transaction.update('bookings', id, data),
      updatePayment: (id, data) => transaction.update('payments', id, data),
      setAuditLog: (id, data) => transaction.set('audit_logs', id, data),
    }));
  },
};

export const demoLifecycleStorageProvider: LifecycleStorageProvider = {
  async getBooking(bookingId) { return store.rawGet('bookings', bookingId) as Booking | null; },
  async updateBooking(bookingId, updates) { store.rawUpdate('bookings', bookingId, updates); },
  async logAuditEvent(audit) { store.rawSet('audit_logs', audit.id, audit); },
};

export const demoReservationsAssignmentStorage: ReservationsAssignmentStorage = {
  async getBooking(bookingId) { return store.rawGet('bookings', bookingId) as Booking | null; },
  async resolveEmployees(employeeId) {
    return PRESET_USERS
      .filter(employee => employee.employeeId === employeeId)
      .map(employee => ({
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role,
        active: employee.active,
      }));
  },
  async listActiveReservationsEmployees() {
    const groups = new Map<string, typeof PRESET_USERS>();
    for (const employee of PRESET_USERS.filter(item => item.role === 'Reservations')) {
      const group = groups.get(employee.employeeId) || [];
      group.push(employee);
      groups.set(employee.employeeId, group);
    }
    return [...groups.values()]
      .filter(group => group.length === 1 && group[0].active)
      .map(group => ({
        employeeId: group[0].employeeId,
        name: group[0].name,
        role: group[0].role,
        active: group[0].active,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
  async commitAssignment(commit: ReservationsAssignmentCommit) {
    await store.runTransaction(async transaction => {
      const booking = await transaction.get('bookings', commit.bookingId);
      const matches = PRESET_USERS.filter(employee => employee.employeeId === commit.reservationsEmployeeId);
      if (
        !booking ||
        booking.updatedAt !== commit.expectedUpdatedAt ||
        !['PENDING_PAYMENT', 'CONFIRMED'].includes(booking.status) ||
        matches.length !== 1 ||
        !matches[0].active ||
        matches[0].role !== 'Reservations'
      ) {
        throw new Error('Booking Reservations assignment changed; reload and retry.');
      }
      transaction.update('bookings', commit.bookingId, commit.updates);
      transaction.set('audit_logs', commit.auditLog.id, commit.auditLog);
    });
  },
};

export const demoConfirmationStorageProvider: ConfirmationStorageProvider = {
  async getBooking(id) { return store.rawGet('bookings', id) as Booking | null; },
  async getAccommodation(id) { return store.rawGet('booking_accommodations', id) as BookingAccommodation | null; },
  async getTransport(id) { return store.rawGet('booking_transports', id) as BookingTransport | null; },
  async getActivity(id) { return store.rawGet('booking_activities', id) as BookingActivity | null; },
  async getFinancialSnapshot(bookingId) { return snapshotFor(bookingId); },
  async getServicesByBooking(bookingId) { return servicesFor(bookingId); },
  async updateAccommodation(id, updates) { store.rawUpdate('booking_accommodations', id, updates); },
  async updateTransport(id, updates) { store.rawUpdate('booking_transports', id, updates); },
  async updateActivity(id, updates) { store.rawUpdate('booking_activities', id, updates); },
  async updateBooking(id, updates) { store.rawUpdate('bookings', id, updates); },
  async logAuditEvent(audit) { store.rawSet('audit_logs', audit.id, audit); },
  async commitAccommodationConfirmation(commit) {
    await store.runTransaction(async transaction => {
      const [root, service] = await Promise.all([
        transaction.get('bookings', commit.bookingId),
        transaction.get('booking_accommodations', commit.serviceId),
      ]);
      if (!root || !service || root.updatedAt !== commit.expectedBookingUpdatedAt || service.updatedAt !== commit.expectedServiceUpdatedAt) {
        throw new Error('Booking confirmation data changed; reload and retry.');
      }
      transaction.update('booking_accommodations', commit.serviceId, commit.serviceUpdate);
      transaction.update('bookings', commit.bookingId, commit.bookingUpdate);
      transaction.set('audit_logs', commit.auditLog.id, commit.auditLog);
    });
  },
  async commitOperationalConfirmation(commit) {
    const collection = commit.serviceType === 'TRANSPORT' ? 'booking_transports' : 'booking_activities';
    await store.runTransaction(async transaction => {
      const [root, service] = await Promise.all([
        transaction.get('bookings', commit.bookingId), transaction.get(collection, commit.serviceId),
      ]);
      if (!root || !service || root.updatedAt !== commit.expectedBookingUpdatedAt || service.updatedAt !== commit.expectedServiceUpdatedAt) {
        throw new Error('Booking confirmation data changed; reload and retry.');
      }
      transaction.update(collection, commit.serviceId, commit.serviceUpdate);
      transaction.update('bookings', commit.bookingId, commit.bookingUpdate);
      transaction.set('audit_logs', commit.auditLog.id, commit.auditLog);
    });
  },
};

export const demoOperationsStorage: OperationsControlRoomStorage = {
  async listOperationalBundles(actor: OperationsActor): Promise<OperationalBookingBundle[]> {
    const descriptor = resolveQueryScope(actor, 'BOOKING', 'READ_OPERATIONAL');
    return (store.rawList('bookings') as Booking[])
      .filter(root => matches(root as unknown as Record<string, unknown>, descriptor.constraints))
      .map(root => ({ booking: root, ...servicesFor(root.id), suppliers: [] }));
  },
  async getBooking(id) { return store.rawGet('bookings', id) as Booking | null; },
  async resolveEmployee(employeeId) {
    const employee = PRESET_USERS.find(item => item.employeeId === employeeId);
    return employee ? { employeeId, name: employee.name, role: employee.role, active: employee.active } : null;
  },
  async commitAssignment(commit: OperationsAssignmentCommit) {
    await store.runTransaction(async transaction => {
      const root = await transaction.get('bookings', commit.bookingId);
      const employee = PRESET_USERS.find(item => item.employeeId === commit.operationsEmployeeId);
      if (!root || root.updatedAt !== commit.expectedUpdatedAt || !employee || !employee.active || employee.role !== 'Operations') {
        throw new Error('Booking assignment changed; reload and retry.');
      }
      transaction.update('bookings', commit.bookingId, commit.updates);
      transaction.set('audit_logs', commit.auditLog.id, commit.auditLog);
    });
  },
};

function sourceBundle(bookingId: string): SupplierSourceBundle | null {
  const root = store.rawGet('bookings', bookingId) as Booking | null;
  const financialSnapshot = snapshotFor(bookingId);
  if (!root || !financialSnapshot) return null;
  return { booking: root, snapshot: financialSnapshot, ...servicesFor(bookingId) };
}

export const demoSupplierPayableStorage: SupplierPayableStorageProvider = {
  async listSourceBundles() {
    return (store.rawList('bookings') as Booking[])
      .map(item => sourceBundle(item.id)).filter((item): item is SupplierSourceBundle => Boolean(item));
  },
  async listPayments() { return store.rawList('supplier_payments') as SupplierPaymentRecord[]; },
  async runTransaction<T>(operation: (transaction: SupplierPayableTransaction) => Promise<T>): Promise<T> {
    return store.runTransaction(async transaction => operation({
      getSourceBundle: async bookingId => sourceBundle(bookingId),
      getPayment: async id => transaction.get('supplier_payments', id),
      getPaymentsForObligation: async id => transaction.findByField('supplier_payments', 'obligationId', id, 500),
      setPayment: (id, payment) => transaction.set('supplier_payments', id, payment),
      updatePayment: (id, updates) => transaction.update('supplier_payments', id, updates),
      setAuditLog: (id, audit: AuditLog) => transaction.set('audit_logs', id, audit),
    }));
  },
};

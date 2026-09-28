import { randomUUID } from 'node:crypto';
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminDb } from '../firebaseAdmin.js';
import { authorizeResource, resolveQueryScope } from '../authorization/policyEngine.js';
import { bookingResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal, QueryConstraint } from '../authorization/policyTypes.js';
import type { AuditLog, Supplier, UserRole } from '../../src/types/index.js';
import type {
  Booking,
  BookingAccommodation,
  BookingActivity,
  BookingTransport,
} from '../../src/types/booking.js';
import type {
  OperationalAttentionItem,
  OperationalItem,
  OperationalReadiness,
  OperationsAssignmentInput,
  OperationsControlRoomResponse,
} from '../../src/types/operationsControlRoom.js';

type UnknownRecord = Record<string, unknown>;

export interface OperationsActor extends AuthorizationPrincipal {
  name: string;
  role: UserRole;
}

export interface OperationalBookingBundle {
  booking: Booking;
  accommodations: BookingAccommodation[];
  transports: BookingTransport[];
  activities: BookingActivity[];
  suppliers: Supplier[];
}

export interface OperationsAssignmentCommit {
  bookingId: string;
  operationsEmployeeId: string;
  expectedUpdatedAt: string;
  updates: Partial<Booking>;
  auditLog: AuditLog;
}

function bundleHasNearTermWork(bundle: OperationalBookingBundle, today: string, horizonEnd: string): boolean {
  const { booking } = bundle;
  const bookingOverlapsWindow = Boolean(
    booking.travelStartDate &&
    booking.travelEndDate &&
    booking.travelStartDate <= horizonEnd &&
    booking.travelEndDate >= today,
  );
  return bookingOverlapsWindow || [
    ...bundle.accommodations.flatMap((service) => [service.checkInDate, service.checkOutDate]),
    ...bundle.transports.map((service) => service.serviceDate),
    ...bundle.activities.map((service) => service.serviceDate),
  ].some((date) => isInWindow(date, today, horizonEnd));
}

export interface OperationsControlRoomStorage {
  listOperationalBundles(actor: OperationsActor): Promise<OperationalBookingBundle[]>;
  getBooking(bookingId: string): Promise<Booking | null>;
  resolveEmployee(employeeId: string): Promise<{ employeeId: string; name: string; role: string; active: boolean } | null>;
  commitAssignment(commit: OperationsAssignmentCommit): Promise<void>;
}

export class OperationsControlRoomError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'OperationsControlRoomError';
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function dateInTimeZone(now: Date, timeZone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isInWindow(date: string | undefined, today: string, horizonEnd: string): date is string {
  return Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= horizonEnd);
}

function supplierFor(bundle: OperationalBookingBundle, supplierId: string): Supplier | undefined {
  return bundle.suppliers.find((supplier) => supplier.id === supplierId);
}

function clearance(booking: Booking): 'CLEARED' | 'NOT_CLEARED' {
  return ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'].includes(booking.status)
    ? 'CLEARED'
    : 'NOT_CLEARED';
}

function readinessFor(booking: Booking, hasAttention: boolean): OperationalReadiness {
  if (clearance(booking) === 'NOT_CLEARED') return 'NOT_READY';
  return hasAttention ? 'ATTENTION_REQUIRED' : 'READY';
}

function attention(
  bundle: OperationalBookingBundle,
  code: OperationalAttentionItem['code'],
  message: string,
  options: {
    serviceId?: string;
    serviceType?: OperationalAttentionItem['serviceType'];
    date?: string;
    severity?: OperationalAttentionItem['severity'];
  } = {},
): OperationalAttentionItem {
  return {
    id: `attention-${bundle.booking.id}-${options.serviceId || 'booking'}-${code}`,
    code,
    severity: options.severity || 'MEDIUM',
    message,
    bookingId: bundle.booking.id,
    bookingReference: bundle.booking.bookingReference,
    ...(bundle.booking.customerName ? { customerName: bundle.booking.customerName } : {}),
    ...(options.serviceId ? { serviceId: options.serviceId } : {}),
    ...(options.serviceType ? { serviceType: options.serviceType } : {}),
    ...(options.date ? { date: options.date } : {}),
    ...(bundle.booking.assignedOperationsEmployeeId
      ? { assignedOperationsEmployeeId: bundle.booking.assignedOperationsEmployeeId }
      : {}),
  };
}

function baseItem(
  bundle: OperationalBookingBundle,
  input: Omit<OperationalItem, 'bookingId' | 'bookingReference' | 'bookingStatus' | 'customerId' |
    'customerName' | 'customerPhone' | 'assignedOperationsEmployeeId' | 'commercialClearance'>,
): OperationalItem {
  return {
    ...input,
    bookingId: bundle.booking.id,
    bookingReference: bundle.booking.bookingReference,
    bookingStatus: bundle.booking.status,
    customerId: bundle.booking.customerId,
    ...(bundle.booking.customerName ? { customerName: bundle.booking.customerName } : {}),
    ...(bundle.booking.customerPhone ? { customerPhone: bundle.booking.customerPhone } : {}),
    ...(bundle.booking.assignedOperationsEmployeeId
      ? { assignedOperationsEmployeeId: bundle.booking.assignedOperationsEmployeeId }
      : {}),
    commercialClearance: clearance(bundle.booking),
  };
}

function deriveBundle(bundle: OperationalBookingBundle, today: string, horizonEnd: string) {
  const items: OperationalItem[] = [];
  const alerts: OperationalAttentionItem[] = [];
  const booking = bundle.booking;

  if (!booking.assignedOperationsEmployeeId) {
    alerts.push(attention(bundle, 'OPERATIONS_ASSIGNMENT_MISSING', 'No Operations employee is assigned to this Booking.', { severity: 'HIGH' }));
  }
  if (clearance(booking) === 'NOT_CLEARED') {
    alerts.push(attention(bundle, 'BOOKING_NOT_OPERATIONALLY_READY', `Booking status ${booking.status} is not released for execution.`, { severity: 'HIGH' }));
  }

  const bookingAlert = alerts.length > 0;
  if (isInWindow(booking.travelStartDate, today, horizonEnd)) {
    items.push(baseItem(bundle, {
      id: `arrival-${booking.id}`,
      type: 'ARRIVAL',
      title: `${booking.customerName || booking.bookingReference} arrival`,
      date: booking.travelStartDate,
      serviceStatus: booking.status,
      readiness: readinessFor(booking, bookingAlert),
      details: { ...(booking.specialRequests ? { specialRequests: booking.specialRequests } : {}) },
    }));
  }
  if (isInWindow(booking.travelEndDate, today, horizonEnd)) {
    items.push(baseItem(bundle, {
      id: `departure-${booking.id}`,
      type: 'DEPARTURE',
      title: `${booking.customerName || booking.bookingReference} departure`,
      date: booking.travelEndDate,
      serviceStatus: booking.status,
      readiness: readinessFor(booking, bookingAlert),
      details: { ...(booking.specialRequests ? { specialRequests: booking.specialRequests } : {}) },
    }));
  }

  for (const service of bundle.accommodations) {
    const serviceAlerts: OperationalAttentionItem[] = [];
    if (service.confirmationStatus !== 'CONFIRMED') {
      serviceAlerts.push(attention(bundle, 'HOTEL_CONFIRMATION_PENDING', `${service.propertyName || 'Hotel'} confirmation is still ${service.confirmationStatus}.`, {
        serviceId: service.id, serviceType: 'ACCOMMODATION', date: service.checkInDate, severity: 'HIGH',
      }));
    }
    if (!service.propertyName || !service.checkInDate || !service.checkOutDate || !service.roomCategoryName) {
      serviceAlerts.push(attention(bundle, 'REQUIRED_SERVICE_DATA_MISSING', 'Required hotel execution data is missing.', {
        serviceId: service.id, serviceType: 'ACCOMMODATION', date: service.checkInDate, severity: 'HIGH',
      }));
    }
    alerts.push(...serviceAlerts);
    const confirmationReference = service.supplierConfirmationCode || service.supplierConfirmation?.confirmationReference;
    const details = {
      propertyName: service.propertyName,
      roomCategoryName: service.roomCategoryName,
      mealPlan: service.mealPlan,
      ...(service.guestNames ? { guestNames: service.guestNames } : {}),
      ...(confirmationReference ? { confirmationReference } : {}),
      ...(service.operationalNotes ? { operationalNotes: service.operationalNotes } : {}),
      ...(service.specialRequests ? { specialRequests: service.specialRequests } : {}),
    };
    for (const [type, date, label] of [
      ['HOTEL_CHECK_IN', service.checkInDate, 'check-in'],
      ['HOTEL_CHECK_OUT', service.checkOutDate, 'check-out'],
    ] as const) {
      if (!isInWindow(date, today, horizonEnd)) continue;
      items.push(baseItem(bundle, {
        id: `${type.toLowerCase()}-${service.id}`,
        type,
        title: `${service.propertyName || 'Hotel'} ${label}`,
        date,
        serviceId: service.id,
        serviceStatus: service.confirmationStatus,
        readiness: readinessFor(booking, bookingAlert || serviceAlerts.length > 0),
        details,
      }));
    }
  }

  for (const service of bundle.transports) {
    const serviceAlerts: OperationalAttentionItem[] = [];
    if (service.confirmationStatus !== 'CONFIRMED') {
      serviceAlerts.push(attention(bundle, 'SERVICE_UNCONFIRMED', `${service.routeName || 'Transport'} is still ${service.confirmationStatus}.`, {
        serviceId: service.id, serviceType: 'TRANSPORT', date: service.serviceDate, severity: 'HIGH',
      }));
    }
    if (!service.driverName || !service.driverPhone) {
      serviceAlerts.push(attention(bundle, 'DRIVER_DETAILS_MISSING', `Driver details are missing for ${service.routeName || 'transport service'}.`, {
        serviceId: service.id, serviceType: 'TRANSPORT', date: service.serviceDate, severity: 'HIGH',
      }));
    }
    if (!service.vehicleRegistrationNumber) {
      serviceAlerts.push(attention(bundle, 'VEHICLE_DETAILS_MISSING', `Vehicle registration is missing for ${service.routeName || 'transport service'}.`, {
        serviceId: service.id, serviceType: 'TRANSPORT', date: service.serviceDate,
      }));
    }
    if (!service.serviceDate || !service.pickupLocation || !service.dropoffLocation) {
      serviceAlerts.push(attention(bundle, 'REQUIRED_SERVICE_DATA_MISSING', 'Required transport execution data is missing.', {
        serviceId: service.id, serviceType: 'TRANSPORT', date: service.serviceDate, severity: 'HIGH',
      }));
    }
    alerts.push(...serviceAlerts);
    if (!isInWindow(service.serviceDate, today, horizonEnd)) continue;
    const supplier = supplierFor(bundle, service.supplierId);
    items.push(baseItem(bundle, {
      id: `transport-${service.id}`,
      type: 'TRANSPORT',
      title: service.routeName || service.vehicleCategoryName || 'Transport service',
      date: service.serviceDate,
      ...(service.pickupTime ? { time: service.pickupTime } : {}),
      serviceId: service.id,
      serviceStatus: service.confirmationStatus,
      readiness: readinessFor(booking, bookingAlert || serviceAlerts.length > 0),
      details: {
        transporterName: supplier?.name || service.supplierId,
        ...(supplier?.phone ? { transporterPhone: supplier.phone } : {}),
        ...(service.driverName ? { driverName: service.driverName } : {}),
        ...(service.driverPhone ? { driverPhone: service.driverPhone } : {}),
        ...(service.vehicleRegistrationNumber ? { vehicleRegistrationNumber: service.vehicleRegistrationNumber } : {}),
        vehicleCategoryName: service.vehicleCategoryName,
        pickupLocation: service.pickupLocation,
        dropoffLocation: service.dropoffLocation,
        ...(service.operationalNotes ? { operationalNotes: service.operationalNotes } : {}),
        ...(service.specialRequests ? { specialRequests: service.specialRequests } : {}),
      },
    }));
  }

  for (const service of bundle.activities) {
    const serviceAlerts: OperationalAttentionItem[] = [];
    if (service.confirmationStatus !== 'CONFIRMED') {
      serviceAlerts.push(attention(bundle, 'SERVICE_UNCONFIRMED', `${service.activityName || 'Activity'} is still ${service.confirmationStatus}.`, {
        serviceId: service.id, serviceType: 'ACTIVITY', date: service.serviceDate, severity: 'HIGH',
      }));
    }
    if (!service.activityName || !service.serviceDate || !service.destinationName) {
      serviceAlerts.push(attention(bundle, 'REQUIRED_SERVICE_DATA_MISSING', 'Required activity execution data is missing.', {
        serviceId: service.id, serviceType: 'ACTIVITY', date: service.serviceDate, severity: 'HIGH',
      }));
    }
    alerts.push(...serviceAlerts);
    if (!isInWindow(service.serviceDate, today, horizonEnd)) continue;
    const supplier = supplierFor(bundle, service.supplierId);
    items.push(baseItem(bundle, {
      id: `activity-${service.id}`,
      type: 'ACTIVITY',
      title: service.activityName || 'Activity',
      date: service.serviceDate,
      ...(service.sessionTime ? { time: service.sessionTime } : {}),
      serviceId: service.id,
      serviceStatus: service.confirmationStatus,
      readiness: readinessFor(booking, bookingAlert || serviceAlerts.length > 0),
      details: {
        providerName: supplier?.name || service.supplierId,
        ...(supplier?.phone ? { providerPhone: supplier.phone } : {}),
        ...(service.assignedGuideName ? { assignedGuideName: service.assignedGuideName } : {}),
        ...(service.assignedGuidePhone ? { assignedGuidePhone: service.assignedGuidePhone } : {}),
        participantCount: service.participantCount,
        destinationName: service.destinationName,
        ...(service.operationalNotes ? { operationalNotes: service.operationalNotes } : {}),
        ...(service.specialRequests ? { specialRequests: service.specialRequests } : {}),
      },
    }));
  }

  return { items, alerts };
}

function parseAssignmentInput(value: unknown): { operationsEmployeeId: string; reason?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OperationsControlRoomError(400, 'INVALID_ASSIGNMENT_PAYLOAD', 'Assignment payload must be an object.');
  }
  const payload = value as UnknownRecord;
  const unsupported = Object.keys(payload).filter((field) => !['operationsEmployeeId', 'reason'].includes(field));
  if (unsupported.length) {
    throw new OperationsControlRoomError(400, 'PROTECTED_ASSIGNMENT_FIELD', `Unsupported or server-controlled fields: ${unsupported.join(', ')}.`);
  }
  if (typeof payload.operationsEmployeeId !== 'string' || !payload.operationsEmployeeId.trim() || payload.operationsEmployeeId.length > 64) {
    throw new OperationsControlRoomError(400, 'INVALID_OPERATIONS_EMPLOYEE_ID', 'operationsEmployeeId is required.');
  }
  if (payload.reason !== undefined && (typeof payload.reason !== 'string' || payload.reason.trim().length > 500)) {
    throw new OperationsControlRoomError(400, 'INVALID_ASSIGNMENT_REASON', 'reason must be at most 500 characters.');
  }
  return {
    operationsEmployeeId: payload.operationsEmployeeId.trim(),
    ...(typeof payload.reason === 'string' && payload.reason.trim() ? { reason: payload.reason.trim() } : {}),
  };
}

export class OperationsControlRoomService {
  constructor(
    private readonly storage: OperationsControlRoomStorage = new FirestoreOperationsControlRoomStorage(),
    private readonly now: () => Date = () => new Date(),
    private readonly horizonDays = 7,
  ) {}

  async getControlRoom(actor: OperationsActor): Promise<OperationsControlRoomResponse> {
    const scope = resolveQueryScope(actor, 'BOOKING', 'READ_OPERATIONAL');
    if (scope.scope === 'NONE') {
      throw new OperationsControlRoomError(403, 'ROLE_DENIED', scope.deniedReason || 'Operations workspace access denied.');
    }
    const today = dateInTimeZone(this.now());
    const horizonEnd = addDays(today, this.horizonDays);
    const bundles = await this.storage.listOperationalBundles(actor);
    const items: OperationalItem[] = [];
    const alerts: OperationalAttentionItem[] = [];
    for (const bundle of bundles) {
      const decision = authorizeResource(actor, 'BOOKING', 'READ_OPERATIONAL', bookingResourceContext(bundle.booking));
      if (!decision.allowed) continue;
      if (!bundleHasNearTermWork(bundle, today, horizonEnd)) continue;
      const derived = deriveBundle(bundle, today, horizonEnd);
      items.push(...derived.items);
      alerts.push(...derived.alerts.filter((item) => !item.date || item.date <= horizonEnd));
    }
    const byTime = (left: OperationalItem, right: OperationalItem) =>
      `${left.date}-${left.time || ''}-${left.bookingReference}`.localeCompare(`${right.date}-${right.time || ''}-${right.bookingReference}`);
    const current = items.filter((item) => item.date === today).sort(byTime);
    const upcoming = items.filter((item) => item.date > today && item.date <= horizonEnd).sort(byTime);
    const attentionRequired = [...new Map(alerts.map((item) => [item.id, item])).values()]
      .sort((left, right) => `${left.date || ''}-${left.bookingReference}`.localeCompare(`${right.date || ''}-${right.bookingReference}`));
    return {
      asOf: today,
      horizonEnd,
      today: current,
      upcoming,
      attentionRequired,
      summary: {
        todayCount: current.length,
        upcomingCount: upcoming.length,
        attentionCount: attentionRequired.length,
        readyCount: [...current, ...upcoming].filter((item) => item.readiness === 'READY').length,
      },
    };
  }

  async assignOperations(
    bookingId: string,
    input: OperationsAssignmentInput | unknown,
    actor: OperationsActor,
  ): Promise<{ bookingId: string; assignedOperationsEmployeeId: string; isIdempotent?: boolean }> {
    const request = parseAssignmentInput(input);
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) throw new OperationsControlRoomError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    const decision = authorizeResource(actor, 'BOOKING', 'ASSIGN_OPERATIONS', bookingResourceContext(booking));
    if (!decision.allowed) throw new OperationsControlRoomError(403, decision.code, decision.reason);
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw new OperationsControlRoomError(422, 'BOOKING_ASSIGNMENT_CLOSED', 'Closed Booking history cannot be assigned or reassigned.');
    }
    const employee = await this.storage.resolveEmployee(request.operationsEmployeeId);
    if (!employee || employee.employeeId !== request.operationsEmployeeId) {
      throw new OperationsControlRoomError(422, 'OPERATIONS_EMPLOYEE_NOT_FOUND', 'Operations employee does not exist uniquely.');
    }
    if (employee.active !== true) {
      throw new OperationsControlRoomError(422, 'OPERATIONS_EMPLOYEE_INACTIVE', 'Inactive employees cannot receive new assignments.');
    }
    if (employee.role !== 'Operations') {
      throw new OperationsControlRoomError(422, 'OPERATIONS_ROLE_REQUIRED', 'Only an active Operations employee may be assigned.');
    }
    if (booking.assignedOperationsEmployeeId === employee.employeeId) {
      return { bookingId, assignedOperationsEmployeeId: employee.employeeId, isIdempotent: true };
    }
    const now = this.now().toISOString();
    const action = booking.assignedOperationsEmployeeId ? 'OPERATIONS_REASSIGNED' : 'OPERATIONS_ASSIGNED';
    const auditLog: AuditLog = {
      id: `audit-operations-assignment-${randomUUID()}`,
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.employeeId,
      actorName: `${actor.name} (${actor.role})`,
      action,
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { assignedOperationsEmployeeId: booking.assignedOperationsEmployeeId || null },
      after: { assignedOperationsEmployeeId: employee.employeeId },
      reason: request.reason || `${action === 'OPERATIONS_ASSIGNED' ? 'Assigned' : 'Reassigned'} to ${employee.name}.`,
    };
    await this.storage.commitAssignment({
      bookingId,
      operationsEmployeeId: employee.employeeId,
      expectedUpdatedAt: booking.updatedAt,
      updates: { assignedOperationsEmployeeId: employee.employeeId, updatedAt: now },
      auditLog,
    });
    return { bookingId, assignedOperationsEmployeeId: employee.employeeId };
  }
}

function matchesConstraints(booking: Booking, constraints: QueryConstraint[]) {
  return constraints.every((constraint) => {
    const value = (booking as unknown as UnknownRecord)[constraint.field];
    return constraint.operator === '=='
      ? value === constraint.value
      : Array.isArray(constraint.value) && constraint.value.includes(value as string);
  });
}

export class InMemoryOperationsControlRoomStorage implements OperationsControlRoomStorage {
  private readonly bundles = new Map<string, OperationalBookingBundle>();
  private readonly employees = new Map<string, { employeeId: string; name: string; role: string; active: boolean }>();
  private readonly audits: AuditLog[] = [];
  private mutationCount = 0;

  constructor(initial?: {
    bundles?: OperationalBookingBundle[];
    employees?: Array<{ employeeId: string; name: string; role: string; active: boolean }>;
  }) {
    for (const bundle of initial?.bundles || []) this.bundles.set(bundle.booking.id, clone(bundle));
    for (const employee of initial?.employees || []) this.employees.set(employee.employeeId, clone(employee));
  }

  async listOperationalBundles(actor: OperationsActor) {
    const descriptor = resolveQueryScope(actor, 'BOOKING', 'READ_OPERATIONAL');
    return [...this.bundles.values()]
      .filter((bundle) => matchesConstraints(bundle.booking, descriptor.constraints))
      .map(clone);
  }

  async getBooking(bookingId: string) {
    const bundle = this.bundles.get(bookingId);
    return bundle ? clone(bundle.booking) : null;
  }

  async resolveEmployee(employeeId: string) {
    const employee = this.employees.get(employeeId);
    return employee ? clone(employee) : null;
  }

  async commitAssignment(commit: OperationsAssignmentCommit) {
    const bundle = this.bundles.get(commit.bookingId);
    const employee = this.employees.get(commit.operationsEmployeeId);
    if (!employee || employee.active !== true || employee.role !== 'Operations') {
      throw new OperationsControlRoomError(409, 'OPERATIONS_EMPLOYEE_CHANGED', 'The selected employee is no longer eligible for assignment.');
    }
    if (!bundle || bundle.booking.updatedAt !== commit.expectedUpdatedAt) {
      throw new OperationsControlRoomError(409, 'OPERATIONS_ASSIGNMENT_CONFLICT', 'Booking assignment changed; reload and retry.');
    }
    bundle.booking = { ...bundle.booking, ...clone(commit.updates) };
    this.audits.push(clone(commit.auditLog));
    this.mutationCount += 2;
  }

  getMutationCount() { return this.mutationCount; }
  getAudits() { return clone(this.audits); }
  getBookingSync(bookingId: string) { return this.bundles.get(bookingId)?.booking; }
}

export class FirestoreOperationsControlRoomStorage implements OperationsControlRoomStorage {
  private db() { return getAdminDb(); }

  async listOperationalBundles(actor: OperationsActor): Promise<OperationalBookingBundle[]> {
    const db = this.db();
    const descriptor = resolveQueryScope(actor, 'BOOKING', 'READ_OPERATIONAL');
    let query: FirebaseFirestore.Query = db.collection('bookings');
    for (const constraint of descriptor.constraints) {
      query = query.where(constraint.field, constraint.operator, constraint.value);
    }
    if (!descriptor.constraints.some((constraint) => constraint.field === 'status')) {
      query = query.where('status', 'in', ['PENDING_PAYMENT', 'CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED']);
    }
    query = query.orderBy('createdAt', 'desc').limit(100);
    const bookingSnapshot = await query.get();
    const bookings = bookingSnapshot.docs.map((document) => ({ ...document.data(), id: document.id } as Booking));
    const bookingIds = bookings.map((booking) => booking.id);
    const loadServices = async <T>(collectionName: string): Promise<T[]> => {
      const chunks: string[][] = [];
      for (let index = 0; index < bookingIds.length; index += 30) chunks.push(bookingIds.slice(index, index + 30));
      const snapshots = await Promise.all(chunks.map((ids) =>
        db.collection(collectionName).where('bookingId', 'in', ids).get()));
      return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({
        ...document.data(),
        id: document.id,
      } as T)));
    };
    const [accommodations, transports, activities] = bookingIds.length
      ? await Promise.all([
          loadServices<BookingAccommodation>('booking_accommodations'),
          loadServices<BookingTransport>('booking_transports'),
          loadServices<BookingActivity>('booking_activities'),
        ])
      : [[], [], []] as [BookingAccommodation[], BookingTransport[], BookingActivity[]];
    const rawBundles = bookings.map((booking) => ({
      booking,
      accommodations: accommodations.filter((service) => service.bookingId === booking.id),
      transports: transports.filter((service) => service.bookingId === booking.id),
      activities: activities.filter((service) => service.bookingId === booking.id),
      suppliers: [] as Supplier[],
    }));
    const supplierIds = [...new Set(rawBundles.flatMap((bundle) => [
      ...bundle.accommodations.map((service) => service.supplierId),
      ...bundle.transports.map((service) => service.supplierId),
      ...bundle.activities.map((service) => service.supplierId),
    ]).filter(Boolean))];
    const supplierDocuments = supplierIds.length
      ? await db.getAll(...supplierIds.map((supplierId) => db.collection('suppliers').doc(supplierId)))
      : [];
    const suppliers = supplierDocuments
      .filter((document) => document.exists)
      .map((document) => ({ ...document.data(), id: document.id } as Supplier));
    return rawBundles.map((bundle) => ({ ...bundle, suppliers }));
  }

  async getBooking(bookingId: string) {
    const document = await this.db().collection('bookings').doc(bookingId).get();
    return document.exists ? { ...document.data(), id: document.id } as Booking : null;
  }

  async resolveEmployee(employeeId: string) {
    const db = this.db();
    const [matches, legacy] = await Promise.all([
      db.collection('employees').where('employeeId', '==', employeeId).limit(2).get(),
      db.collection('employees').doc(employeeId).get(),
    ]);
    const candidates = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (const document of matches.docs) candidates.set(document.id, document);
    if (legacy.exists) candidates.set(legacy.id, legacy);
    if (candidates.size !== 1) return null;
    const document = [...candidates.values()][0];
    const data = document.data() || {};
    const canonicalId = typeof data.employeeId === 'string' && data.employeeId.trim()
      ? data.employeeId.trim()
      : typeof data.id === 'string' && data.id.trim()
        ? data.id.trim()
        : document.id;
    return {
      employeeId: canonicalId,
      name: typeof data.name === 'string' ? data.name : canonicalId,
      role: typeof data.role === 'string' ? data.role : '',
      active: data.active === true,
    };
  }

  async commitAssignment(commit: OperationsAssignmentCommit) {
    const db = this.db();
    const bookingRef = db.collection('bookings').doc(commit.bookingId);
    const auditRef = db.collection('audit_logs').doc(commit.auditLog.id);
    await db.runTransaction(async (transaction) => {
      const employeeQuery = db.collection('employees')
        .where('employeeId', '==', commit.operationsEmployeeId)
        .limit(2);
      const employeeMatches = await transaction.get(employeeQuery);
      const legacyEmployee = await transaction.get(db.collection('employees').doc(commit.operationsEmployeeId));
      const employeeCandidates = new Map<string, FirebaseFirestore.DocumentSnapshot>();
      for (const document of employeeMatches.docs) employeeCandidates.set(document.id, document);
      if (legacyEmployee.exists) employeeCandidates.set(legacyEmployee.id, legacyEmployee);
      if (employeeCandidates.size !== 1) {
        throw new OperationsControlRoomError(409, 'OPERATIONS_EMPLOYEE_CHANGED', 'The selected employee no longer resolves uniquely.');
      }
      const employeeData = [...employeeCandidates.values()][0].data() || {};
      const canonicalEmployeeId = typeof employeeData.employeeId === 'string' && employeeData.employeeId.trim()
        ? employeeData.employeeId.trim()
        : typeof employeeData.id === 'string' && employeeData.id.trim()
          ? employeeData.id.trim()
          : [...employeeCandidates.values()][0].id;
      if (
        canonicalEmployeeId !== commit.operationsEmployeeId ||
        employeeData.active !== true ||
        employeeData.role !== 'Operations'
      ) {
        throw new OperationsControlRoomError(409, 'OPERATIONS_EMPLOYEE_CHANGED', 'The selected employee is no longer eligible for assignment.');
      }
      const booking = await transaction.get(bookingRef);
      if (!booking.exists || booking.data()?.updatedAt !== commit.expectedUpdatedAt) {
        throw new OperationsControlRoomError(409, 'OPERATIONS_ASSIGNMENT_CONFLICT', 'Booking assignment changed; reload and retry.');
      }
      transaction.update(bookingRef, commit.updates as DocumentData);
      transaction.set(auditRef, commit.auditLog);
    });
  }
}

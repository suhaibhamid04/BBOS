// =====================================================
// SERVICE CONFIRMATION SERVICE
// Phase 2B-6 Stage 2 for Booking Bridge OS
// Handles PATCH operations on individual booking service
// sub-documents with strict field-level guards.
// Also recomputes booking.confirmationProgress atomically.
// =====================================================

import { UserRole, AuditLog } from '../../src/types';
import {
  Booking,
  BookingAccommodation,
  BookingTransport,
  BookingActivity,
  BookingComponentStatus,
  ConfirmationProgress,
  FinancialSnapshot,
  AccommodationSupplierConfirmation,
} from '../../src/types/booking';
import { getAdminDb } from '../firebaseAdmin.js';
import { authorizeResource } from '../authorization/policyEngine.js';
import { bookingResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

// ── Actor ─────────────────────────────────────────────────────────────────────

export interface ConfirmationActor extends AuthorizationPrincipal {
  name: string;
  email?: string;
  isDemo?: boolean;
}

interface LegacyConfirmationActor {
  id: string;
  uid?: string;
  name: string;
  role: UserRole;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface ConfirmAccommodationDTO {
  confirmationStatus?: BookingComponentStatus;
  supplierConfirmationCode?: string;
  allocatedRoomNumbers?: string[];
  supplierNotes?: string;
  confirmedRoomCategoryId?: string;
  confirmedRoomCategoryName?: string;
  confirmedMealPlan?: BookingAccommodation['mealPlan'];
  confirmedCheckInDate?: string;
  confirmedCheckOutDate?: string;
  confirmedGuestNames?: string[];
  confirmedRoomsCount?: number;
  confirmedAdultsCount?: number;
  confirmedChildrenCount?: number;
  confirmedSupplierUnitRate?: number;
  rateDiscrepancyReason?: string;
}

export interface ConfirmTransportDTO {
  confirmationStatus?: BookingComponentStatus;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  vehicleRegistrationNumber?: string;
  operationalNotes?: string;
  supplierNotes?: string;
}

export interface ConfirmActivityDTO {
  confirmationStatus?: BookingComponentStatus;
  supplierConfirmationCode?: string;
  ticketNumbers?: string[];
  assignedGuideName?: string;
  assignedGuidePhone?: string;
  operationalNotes?: string;
}

export interface ServiceConfirmationResult {
  success: boolean;
  confirmationProgress: ConfirmationProgress;
  message: string;
  supplierConfirmation?: AccommodationSupplierConfirmation;
  requiresCommercialApproval?: boolean;
}

// ── Error ──────────────────────────────────────────────────────────────────────

export class ConfirmationError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ConfirmationError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateAuditId(): string {
  return `AUDIT-SC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function computeConfirmationProgress(
  accommodations: BookingAccommodation[],
  transports: BookingTransport[],
  activities: BookingActivity[]
): ConfirmationProgress {
  const all = [...accommodations, ...transports, ...activities];
  const total = all.length;
  const confirmed = all.filter(s => s.confirmationStatus === 'CONFIRMED').length;
  const requested = all.filter(s => s.confirmationStatus === 'REQUESTED').length;
  const cancelled = all.filter(s => s.confirmationStatus === 'CANCELLED').length;
  return {
    totalServices: total,
    confirmedServices: confirmed,
    requestedServices: requested,
    cancelledServices: cancelled,
    allConfirmed: total > 0 && confirmed === total,
  };
}

interface AccommodationConfirmationCommit {
  bookingId: string;
  serviceId: string;
  expectedBookingUpdatedAt: string;
  expectedServiceUpdatedAt: string;
  serviceUpdate: Partial<BookingAccommodation>;
  bookingUpdate: Partial<Booking>;
  auditLog: AuditLog;
}

// ── Storage abstraction ────────────────────────────────────────────────────────

export interface ConfirmationStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  getAccommodation(serviceId: string): Promise<BookingAccommodation | null>;
  getTransport(serviceId: string): Promise<BookingTransport | null>;
  getActivity(serviceId: string): Promise<BookingActivity | null>;
  getFinancialSnapshot(bookingId: string): Promise<FinancialSnapshot | null>;
  getServicesByBooking(bookingId: string): Promise<{
    accommodations: BookingAccommodation[];
    transports: BookingTransport[];
    activities: BookingActivity[];
  }>;
  updateAccommodation(serviceId: string, data: Partial<BookingAccommodation>): Promise<void>;
  updateTransport(serviceId: string, data: Partial<BookingTransport>): Promise<void>;
  updateActivity(serviceId: string, data: Partial<BookingActivity>): Promise<void>;
  updateBooking(bookingId: string, data: Partial<Booking>): Promise<void>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
  commitAccommodationConfirmation(commit: AccommodationConfirmationCommit): Promise<void>;
}

// In-memory implementation for testing
export class InMemoryConfirmationStorageProvider implements ConfirmationStorageProvider {
  private bookings: Map<string, Booking> = new Map();
  private accommodations: Map<string, BookingAccommodation> = new Map();
  private transports: Map<string, BookingTransport> = new Map();
  private activities: Map<string, BookingActivity> = new Map();
  private financialSnapshots: Map<string, FinancialSnapshot> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();
  private mutationCount = 0;

  constructor(initialData?: {
    bookings?: Booking[];
    accommodations?: BookingAccommodation[];
    transports?: BookingTransport[];
    activities?: BookingActivity[];
    financialSnapshots?: FinancialSnapshot[];
  }) {
    for (const b of initialData?.bookings || []) this.bookings.set(b.id, JSON.parse(JSON.stringify(b)));
    for (const s of initialData?.accommodations || []) this.accommodations.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.transports || []) this.transports.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.activities || []) this.activities.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const snapshot of initialData?.financialSnapshots || []) {
      this.financialSnapshots.set(snapshot.bookingId, JSON.parse(JSON.stringify(snapshot)));
    }
  }

  async getBooking(id: string) { const b = this.bookings.get(id); return b ? JSON.parse(JSON.stringify(b)) : null; }
  async getAccommodation(id: string) { const s = this.accommodations.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }
  async getTransport(id: string) { const s = this.transports.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }
  async getActivity(id: string) { const s = this.activities.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }
  async getFinancialSnapshot(bookingId: string) {
    const snapshot = this.financialSnapshots.get(bookingId);
    return snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
  }

  async getServicesByBooking(bookingId: string) {
    return {
      accommodations: Array.from(this.accommodations.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      transports: Array.from(this.transports.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      activities: Array.from(this.activities.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
    };
  }

  async updateAccommodation(id: string, data: Partial<BookingAccommodation>) {
    const existing = this.accommodations.get(id);
    if (existing) {
      this.accommodations.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      this.mutationCount += 1;
    }
  }
  async updateTransport(id: string, data: Partial<BookingTransport>) {
    const existing = this.transports.get(id);
    if (existing) {
      this.transports.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      this.mutationCount += 1;
    }
  }
  async updateActivity(id: string, data: Partial<BookingActivity>) {
    const existing = this.activities.get(id);
    if (existing) {
      this.activities.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      this.mutationCount += 1;
    }
  }
  async updateBooking(id: string, data: Partial<Booking>) {
    const existing = this.bookings.get(id);
    if (existing) {
      this.bookings.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
      this.mutationCount += 1;
    }
  }
  async logAuditEvent(auditLog: AuditLog) {
    this.auditLogs.set(auditLog.id, JSON.parse(JSON.stringify(auditLog)));
    this.mutationCount += 1;
  }

  async commitAccommodationConfirmation(commit: AccommodationConfirmationCommit): Promise<void> {
    const booking = this.bookings.get(commit.bookingId);
    const service = this.accommodations.get(commit.serviceId);
    if (!booking || !service) throw new ConfirmationError(409, 'CONFIRMATION_CONFLICT', 'Booking confirmation data changed.');
    if (booking.updatedAt !== commit.expectedBookingUpdatedAt || service.updatedAt !== commit.expectedServiceUpdatedAt) {
      throw new ConfirmationError(409, 'CONFIRMATION_CONFLICT', 'Booking confirmation data changed; reload and retry.');
    }

    this.accommodations.set(commit.serviceId, {
      ...service,
      ...JSON.parse(JSON.stringify(commit.serviceUpdate)),
    });
    this.bookings.set(commit.bookingId, {
      ...booking,
      ...JSON.parse(JSON.stringify(commit.bookingUpdate)),
    });
    this.auditLogs.set(commit.auditLog.id, JSON.parse(JSON.stringify(commit.auditLog)));
    this.mutationCount += 3;
  }

  // Test helpers
  getBookingSync(id: string): Booking | undefined { return this.bookings.get(id); }
  getAccommodationSync(id: string): BookingAccommodation | undefined { return this.accommodations.get(id); }
  getTransportSync(id: string): BookingTransport | undefined { return this.transports.get(id); }
  getActivitySync(id: string): BookingActivity | undefined { return this.activities.get(id); }
  getAllAuditLogs(): AuditLog[] { return Array.from(this.auditLogs.values()); }
  getMutationCount(): number { return this.mutationCount; }
}

// Firestore production implementation
export class FirestoreConfirmationStorageProvider implements ConfirmationStorageProvider {
  private db() { return getAdminDb(); }

  async getBooking(id: string): Promise<Booking | null> {
    const snap = await this.db().collection('bookings').doc(id).get();
    return snap.exists ? (snap.data() as Booking) : null;
  }
  async getAccommodation(id: string): Promise<BookingAccommodation | null> {
    const snap = await this.db().collection('booking_accommodations').doc(id).get();
    return snap.exists ? (snap.data() as BookingAccommodation) : null;
  }
  async getTransport(id: string): Promise<BookingTransport | null> {
    const snap = await this.db().collection('booking_transports').doc(id).get();
    return snap.exists ? (snap.data() as BookingTransport) : null;
  }
  async getActivity(id: string): Promise<BookingActivity | null> {
    const snap = await this.db().collection('booking_activities').doc(id).get();
    return snap.exists ? (snap.data() as BookingActivity) : null;
  }
  async getFinancialSnapshot(bookingId: string): Promise<FinancialSnapshot | null> {
    const snap = await this.db().collection('bookings').doc(bookingId)
      .collection('financial_snapshot').orderBy('snapshotVersion', 'desc').limit(1).get();
    return snap.empty ? null : ({ ...snap.docs[0].data(), id: snap.docs[0].id } as FinancialSnapshot);
  }
  async getServicesByBooking(bookingId: string) {
    const [accSnap, transSnap, actSnap] = await Promise.all([
      this.db().collection('booking_accommodations').where('bookingId', '==', bookingId).get(),
      this.db().collection('booking_transports').where('bookingId', '==', bookingId).get(),
      this.db().collection('booking_activities').where('bookingId', '==', bookingId).get(),
    ]);
    return {
      accommodations: accSnap.docs.map(d => d.data() as BookingAccommodation),
      transports: transSnap.docs.map(d => d.data() as BookingTransport),
      activities: actSnap.docs.map(d => d.data() as BookingActivity),
    };
  }
  async updateAccommodation(id: string, data: Partial<BookingAccommodation>) {
    await this.db().collection('booking_accommodations').doc(id).update(data as any);
  }
  async updateTransport(id: string, data: Partial<BookingTransport>) {
    await this.db().collection('booking_transports').doc(id).update(data as any);
  }
  async updateActivity(id: string, data: Partial<BookingActivity>) {
    await this.db().collection('booking_activities').doc(id).update(data as any);
  }
  async updateBooking(id: string, data: Partial<Booking>) {
    await this.db().collection('bookings').doc(id).update(data as any);
  }
  async logAuditEvent(auditLog: AuditLog) {
    await this.db().collection('audit_logs').doc(auditLog.id).set(auditLog);
  }
  async commitAccommodationConfirmation(commit: AccommodationConfirmationCommit): Promise<void> {
    const db = this.db();
    const bookingRef = db.collection('bookings').doc(commit.bookingId);
    const serviceRef = db.collection('booking_accommodations').doc(commit.serviceId);
    const auditRef = db.collection('audit_logs').doc(commit.auditLog.id);

    await db.runTransaction(async transaction => {
      const [bookingSnap, serviceSnap] = await Promise.all([
        transaction.get(bookingRef),
        transaction.get(serviceRef),
      ]);
      if (!bookingSnap.exists || !serviceSnap.exists) {
        throw new ConfirmationError(409, 'CONFIRMATION_CONFLICT', 'Booking confirmation data changed.');
      }
      if (
        bookingSnap.data()?.updatedAt !== commit.expectedBookingUpdatedAt ||
        serviceSnap.data()?.updatedAt !== commit.expectedServiceUpdatedAt
      ) {
        throw new ConfirmationError(409, 'CONFIRMATION_CONFLICT', 'Booking confirmation data changed; reload and retry.');
      }
      transaction.update(serviceRef, commit.serviceUpdate as Record<string, unknown>);
      transaction.update(bookingRef, commit.bookingUpdate as Record<string, unknown>);
      transaction.set(auditRef, commit.auditLog);
    });
  }
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

const CONFIRMATION_ROLES: UserRole[] = ['Founder', 'Admin', 'Operations'];

function assertConfirmationRole(actor: LegacyConfirmationActor) {
  if (!CONFIRMATION_ROLES.includes(actor.role as UserRole)) {
    throw new ConfirmationError(
      403,
      'FORBIDDEN',
      `Role "${actor.role}" is not authorized to update service confirmation details.`
    );
  }
}

const ACCOMMODATION_CONFIRMATION_FIELDS = new Set([
  'confirmationStatus', 'supplierConfirmationCode', 'allocatedRoomNumbers', 'supplierNotes',
  'confirmedRoomCategoryId', 'confirmedRoomCategoryName', 'confirmedMealPlan',
  'confirmedCheckInDate', 'confirmedCheckOutDate', 'confirmedGuestNames',
  'confirmedRoomsCount', 'confirmedAdultsCount', 'confirmedChildrenCount',
  'confirmedSupplierUnitRate', 'rateDiscrepancyReason',
]);

function nonEmptyString(value: unknown, field: string, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 500) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', `${field} must be a non-empty string of at most 500 characters.`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', `${field} must be a non-negative integer.`);
  }
  return value as number;
}

function isoDate(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', `${field} must use YYYY-MM-DD format.`);
  }
  return value;
}

function validateAccommodationConfirmationInput(dto: ConfirmAccommodationDTO): void {
  if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', 'A confirmation payload is required.');
  }
  const rejected = Object.keys(dto as Record<string, unknown>).filter(key => !ACCOMMODATION_CONFIRMATION_FIELDS.has(key));
  if (rejected.length) {
    throw new ConfirmationError(400, 'PROTECTED_CONFIRMATION_FIELD', `Unsupported or protected fields: ${rejected.join(', ')}.`);
  }
  if (
    dto.confirmationStatus !== undefined &&
    !(['REQUESTED', 'CONFIRMED', 'CANCELLED'] as BookingComponentStatus[]).includes(dto.confirmationStatus)
  ) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_STATUS', 'Confirmation status must be REQUESTED, CONFIRMED, or CANCELLED.');
  }
  nonEmptyString(dto.supplierConfirmationCode, 'supplierConfirmationCode');
  nonEmptyString(dto.supplierNotes, 'supplierNotes');
  nonEmptyString(dto.confirmedRoomCategoryId, 'confirmedRoomCategoryId');
  nonEmptyString(dto.confirmedRoomCategoryName, 'confirmedRoomCategoryName');
  nonEmptyString(dto.rateDiscrepancyReason, 'rateDiscrepancyReason');
  if (
    dto.confirmedMealPlan !== undefined &&
    !(['EP', 'CP', 'MAP', 'AP', 'CUSTOM'] as const).includes(dto.confirmedMealPlan)
  ) {
    throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', 'confirmedMealPlan is invalid.');
  }
  isoDate(dto.confirmedCheckInDate, 'confirmedCheckInDate');
  isoDate(dto.confirmedCheckOutDate, 'confirmedCheckOutDate');
  positiveInteger(dto.confirmedRoomsCount, 'confirmedRoomsCount');
  positiveInteger(dto.confirmedAdultsCount, 'confirmedAdultsCount');
  positiveInteger(dto.confirmedChildrenCount, 'confirmedChildrenCount');
  if (dto.confirmedSupplierUnitRate !== undefined && (
    typeof dto.confirmedSupplierUnitRate !== 'number' ||
    !Number.isFinite(dto.confirmedSupplierUnitRate) ||
    dto.confirmedSupplierUnitRate < 0
  )) {
    throw new ConfirmationError(400, 'INVALID_SUPPLIER_RATE', 'confirmedSupplierUnitRate must be finite and non-negative.');
  }
  for (const [field, values] of [
    ['allocatedRoomNumbers', dto.allocatedRoomNumbers],
    ['confirmedGuestNames', dto.confirmedGuestNames],
  ] as const) {
    if (values !== undefined && (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim()))) {
      throw new ConfirmationError(400, 'INVALID_CONFIRMATION_INPUT', `${field} must contain non-empty strings.`);
    }
  }
}

function resolveAccommodationSnapshotLine(
  snapshot: FinancialSnapshot,
  service: BookingAccommodation,
) {
  const accommodationLines = snapshot.lineItems.filter(item => item.serviceType === 'ACCOMMODATION');
  const exact = service.sourceQuoteServiceId
    ? accommodationLines.filter(item => item.serviceId === service.sourceQuoteServiceId)
    : [];
  const compatible = exact.length
    ? exact
    : accommodationLines.filter(item =>
        item.inventoryMasterId === service.propertyId && item.supplierId === service.supplierId
      );
  if (compatible.length !== 1) {
    throw new ConfirmationError(
      422,
      compatible.length ? 'AMBIGUOUS_RATE_SNAPSHOT' : 'RATE_SNAPSHOT_NOT_FOUND',
      'The frozen supplier rate cannot be uniquely resolved for this accommodation.',
    );
  }
  return compatible[0];
}

// ── Service ────────────────────────────────────────────────────────────────────

export class ServiceConfirmationService {
  private storageProvider: ConfirmationStorageProvider;

  constructor(storageProvider?: ConfirmationStorageProvider) {
    this.storageProvider = storageProvider || new FirestoreConfirmationStorageProvider();
  }

  // Shared helper: after any service update, recompute confirmationProgress on the booking
  private async recomputeAndSaveProgress(bookingId: string, now: string): Promise<ConfirmationProgress> {
    const { accommodations, transports, activities } = await this.storageProvider.getServicesByBooking(bookingId);
    const progress = computeConfirmationProgress(accommodations, transports, activities);
    await this.storageProvider.updateBooking(bookingId, { confirmationProgress: progress, updatedAt: now });
    return progress;
  }

  /**
   * Record an accommodation supplier response through Reservations policy.
   */
  async confirmAccommodation(
    bookingId: string,
    serviceId: string,
    dto: ConfirmAccommodationDTO,
    actor: ConfirmationActor
  ): Promise<ServiceConfirmationResult> {
    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) throw new ConfirmationError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    const authorization = authorizeResource(
      actor,
      'BOOKING',
      'UPDATE_RESERVATIONS',
      bookingResourceContext(booking),
    );
    if (!authorization.allowed) {
      throw new ConfirmationError(403, authorization.code, authorization.reason);
    }
    if (!['CONFIRMED', 'IN_OPERATIONS'].includes(booking.status)) {
      throw new ConfirmationError(
        422,
        'BOOKING_NOT_COMMERCIALLY_READY',
        'Supplier confirmation may begin only after the Booking is commercially confirmed.',
      );
    }
    validateAccommodationConfirmationInput(dto);

    const service = await this.storageProvider.getAccommodation(serviceId);
    if (!service || service.bookingId !== bookingId) {
      throw new ConfirmationError(404, 'SERVICE_NOT_FOUND', `Accommodation service "${serviceId}" not found for this booking.`);
    }

    const now = new Date().toISOString();

    // Only allowed operational fields — strip anything else
    const prior = service.supplierConfirmation;
    const requestedStatus = dto.confirmationStatus ?? prior?.status ?? service.confirmationStatus;
    const confirmedRoomCategoryId = dto.confirmedRoomCategoryId ?? prior?.confirmedRoomCategoryId ?? service.roomCategoryId;
    const confirmedRoomCategoryName = dto.confirmedRoomCategoryName ?? prior?.confirmedRoomCategoryName ?? service.roomCategoryName;
    const confirmedMealPlan = dto.confirmedMealPlan ?? prior?.confirmedMealPlan ?? service.mealPlan;
    const confirmedCheckInDate = dto.confirmedCheckInDate ?? prior?.confirmedCheckInDate ?? service.checkInDate;
    const confirmedCheckOutDate = dto.confirmedCheckOutDate ?? prior?.confirmedCheckOutDate ?? service.checkOutDate;
    const confirmedGuestNames = dto.confirmedGuestNames ?? prior?.confirmedGuestNames ?? service.guestNames ?? [];
    const confirmedRoomsCount = dto.confirmedRoomsCount ?? prior?.confirmedRoomsCount ?? service.roomsCount;
    const confirmedAdultsCount = dto.confirmedAdultsCount ?? prior?.confirmedAdultsCount ?? service.adultsCount;
    const confirmedChildrenCount = dto.confirmedChildrenCount ?? prior?.confirmedChildrenCount ?? service.childrenCount;
    const confirmationReference = dto.supplierConfirmationCode ?? prior?.confirmationReference ?? service.supplierConfirmationCode;
    const supplierNotes = dto.supplierNotes ?? prior?.supplierNotes ?? service.supplierNotes;
    if (requestedStatus === 'CONFIRMED' && !confirmationReference) {
      throw new ConfirmationError(400, 'CONFIRMATION_REFERENCE_REQUIRED', 'A supplier confirmation reference is required.');
    }
    if (requestedStatus === 'CANCELLED' && !supplierNotes) {
      throw new ConfirmationError(400, 'SUPPLIER_NOTE_REQUIRED', 'A supplier-facing note is required when a service is unavailable.');
    }

    const operationalTermsChanged =
      confirmedRoomCategoryId !== service.roomCategoryId ||
      confirmedRoomCategoryName !== service.roomCategoryName ||
      confirmedMealPlan !== service.mealPlan ||
      confirmedCheckInDate !== service.checkInDate ||
      confirmedCheckOutDate !== service.checkOutDate ||
      confirmedRoomsCount !== service.roomsCount ||
      confirmedAdultsCount !== service.adultsCount ||
      confirmedChildrenCount !== service.childrenCount;

    let rateDiscrepancy = prior?.rateDiscrepancy;
    if (dto.confirmedSupplierUnitRate !== undefined) {
      const snapshot = await this.storageProvider.getFinancialSnapshot(bookingId);
      if (!snapshot) {
        throw new ConfirmationError(422, 'RATE_SNAPSHOT_NOT_FOUND', 'The Booking has no immutable financial snapshot.');
      }
      const line = resolveAccommodationSnapshotLine(snapshot, service);
      if (dto.confirmedSupplierUnitRate !== line.frozenSupplierUnitRate) {
        const reason = nonEmptyString(dto.rateDiscrepancyReason, 'rateDiscrepancyReason', true)!;
        rateDiscrepancy = {
          frozenSupplierUnitRate: line.frozenSupplierUnitRate,
          confirmedSupplierUnitRate: dto.confirmedSupplierUnitRate,
          difference: dto.confirmedSupplierUnitRate - line.frozenSupplierUnitRate,
          reason,
          recordedAt: now,
          recordedByEmployeeId: actor.employeeId,
          requiresCommercialApproval: true,
          approvalStatus: 'REQUIRED',
        };
      } else {
        rateDiscrepancy = undefined;
      }
    }

    const requiresCommercialApproval = operationalTermsChanged || Boolean(rateDiscrepancy);
    const effectiveStatus: BookingComponentStatus =
      requestedStatus === 'CONFIRMED' && requiresCommercialApproval ? 'REQUESTED' : requestedStatus;
    const supplierConfirmation: AccommodationSupplierConfirmation = {
      bookingReference: booking.bookingReference,
      serviceId,
      supplierId: service.supplierId,
      propertyId: service.propertyId,
      propertyName: service.propertyName,
      status: requestedStatus,
      ...(confirmationReference ? { confirmationReference } : {}),
      confirmedRoomCategoryId,
      confirmedRoomCategoryName,
      confirmedMealPlan,
      confirmedCheckInDate,
      confirmedCheckOutDate,
      confirmedGuestNames: confirmedGuestNames.map(name => name.trim()),
      confirmedRoomsCount,
      confirmedAdultsCount,
      confirmedChildrenCount,
      ...(supplierNotes ? { supplierNotes } : {}),
      ...(requestedStatus === 'CONFIRMED' ? {
        confirmedAt: now,
        confirmedByEmployeeId: actor.employeeId,
      } : {}),
      updatedAt: now,
      updatedByEmployeeId: actor.employeeId,
      ...(rateDiscrepancy ? { rateDiscrepancy } : {}),
      requiresCommercialApproval,
    };

    const serviceUpdate: Partial<BookingAccommodation> = {
      confirmationStatus: effectiveStatus,
      supplierConfirmation,
      updatedAt: now,
    };
    if (confirmationReference !== undefined) serviceUpdate.supplierConfirmationCode = confirmationReference;
    if (dto.allocatedRoomNumbers !== undefined) serviceUpdate.allocatedRoomNumbers = dto.allocatedRoomNumbers;
    if (dto.supplierNotes !== undefined) serviceUpdate.supplierNotes = dto.supplierNotes;

    const services = await this.storageProvider.getServicesByBooking(bookingId);
    const updatedAccommodation = { ...service, ...serviceUpdate } as BookingAccommodation;
    const progress = computeConfirmationProgress(
      services.accommodations.map(item => item.id === serviceId ? updatedAccommodation : item),
      services.transports,
      services.activities,
    );

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.employeeId,
      actorName: `${actor.name} (${actor.role})`,
      action: 'SUPPLIER_ACCOMMODATION_CONFIRMATION_UPDATED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: {
        confirmationStatus: service.confirmationStatus,
        supplierConfirmation: service.supplierConfirmation,
      },
      after: {
        confirmationStatus: effectiveStatus,
        supplierConfirmation,
        serviceId,
      },
      reason: dto.rateDiscrepancyReason || supplierNotes || `Accommodation "${serviceId}" updated by ${actor.name}`,
    };
    await this.storageProvider.commitAccommodationConfirmation({
      bookingId,
      serviceId,
      expectedBookingUpdatedAt: booking.updatedAt,
      expectedServiceUpdatedAt: service.updatedAt,
      serviceUpdate,
      bookingUpdate: { confirmationProgress: progress, updatedAt: now },
      auditLog,
    });

    return {
      success: true,
      confirmationProgress: progress,
      supplierConfirmation,
      requiresCommercialApproval,
      message: requiresCommercialApproval
        ? 'Supplier response recorded and held for commercial approval.'
        : 'Accommodation supplier confirmation updated successfully.',
    };
  }

  /**
   * Confirm/update a transport service document.
   * Field-level guard: only operational fields are accepted.
   */
  async confirmTransport(
    bookingId: string,
    serviceId: string,
    dto: ConfirmTransportDTO,
    actor: LegacyConfirmationActor
  ): Promise<ServiceConfirmationResult> {
    assertConfirmationRole(actor);

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) throw new ConfirmationError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    if (booking.status === 'CANCELLED') throw new ConfirmationError(422, 'BOOKING_CANCELLED', 'Cannot update services on a cancelled booking.');

    const service = await this.storageProvider.getTransport(serviceId);
    if (!service || service.bookingId !== bookingId) {
      throw new ConfirmationError(404, 'SERVICE_NOT_FOUND', `Transport service "${serviceId}" not found for this booking.`);
    }

    const now = new Date().toISOString();

    const allowedUpdate: Partial<BookingTransport> = {};
    if (dto.confirmationStatus !== undefined) allowedUpdate.confirmationStatus = dto.confirmationStatus;
    if (dto.driverId !== undefined) allowedUpdate.driverId = dto.driverId;
    if (dto.driverName !== undefined) allowedUpdate.driverName = dto.driverName;
    if (dto.driverPhone !== undefined) allowedUpdate.driverPhone = dto.driverPhone;
    if (dto.vehicleRegistrationNumber !== undefined) allowedUpdate.vehicleRegistrationNumber = dto.vehicleRegistrationNumber;
    if (dto.operationalNotes !== undefined) allowedUpdate.operationalNotes = dto.operationalNotes;
    if (dto.supplierNotes !== undefined) allowedUpdate.supplierNotes = dto.supplierNotes;
    allowedUpdate.updatedAt = now;

    await this.storageProvider.updateTransport(serviceId, allowedUpdate);

    const progress = await this.recomputeAndSaveProgress(bookingId, now);

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'SERVICE_TRANSPORT_CONFIRMED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { confirmationStatus: service.confirmationStatus },
      after: { confirmationStatus: dto.confirmationStatus ?? service.confirmationStatus, serviceId },
      reason: `Transport "${serviceId}" updated by ${actor.name}`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    return { success: true, confirmationProgress: progress, message: 'Transport service updated successfully.' };
  }

  /**
   * Confirm/update an activity service document.
   * Field-level guard: only operational fields are accepted.
   */
  async confirmActivity(
    bookingId: string,
    serviceId: string,
    dto: ConfirmActivityDTO,
    actor: LegacyConfirmationActor
  ): Promise<ServiceConfirmationResult> {
    assertConfirmationRole(actor);

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) throw new ConfirmationError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    if (booking.status === 'CANCELLED') throw new ConfirmationError(422, 'BOOKING_CANCELLED', 'Cannot update services on a cancelled booking.');

    const service = await this.storageProvider.getActivity(serviceId);
    if (!service || service.bookingId !== bookingId) {
      throw new ConfirmationError(404, 'SERVICE_NOT_FOUND', `Activity service "${serviceId}" not found for this booking.`);
    }

    const now = new Date().toISOString();

    const allowedUpdate: Partial<BookingActivity> = {};
    if (dto.confirmationStatus !== undefined) allowedUpdate.confirmationStatus = dto.confirmationStatus;
    if (dto.supplierConfirmationCode !== undefined) allowedUpdate.supplierConfirmationCode = dto.supplierConfirmationCode;
    if (dto.ticketNumbers !== undefined) allowedUpdate.ticketNumbers = dto.ticketNumbers;
    if (dto.assignedGuideName !== undefined) allowedUpdate.assignedGuideName = dto.assignedGuideName;
    if (dto.assignedGuidePhone !== undefined) allowedUpdate.assignedGuidePhone = dto.assignedGuidePhone;
    if (dto.operationalNotes !== undefined) allowedUpdate.operationalNotes = dto.operationalNotes;
    allowedUpdate.updatedAt = now;

    await this.storageProvider.updateActivity(serviceId, allowedUpdate);

    const progress = await this.recomputeAndSaveProgress(bookingId, now);

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'SERVICE_ACTIVITY_CONFIRMED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { confirmationStatus: service.confirmationStatus },
      after: { confirmationStatus: dto.confirmationStatus ?? service.confirmationStatus, serviceId },
      reason: `Activity "${serviceId}" updated by ${actor.name}`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    return { success: true, confirmationProgress: progress, message: 'Activity service updated successfully.' };
  }
}

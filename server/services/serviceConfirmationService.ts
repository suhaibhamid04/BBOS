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
} from '../../src/types/booking';
import { getAdminDb } from '../firebaseAdmin.js';

// ── Actor ─────────────────────────────────────────────────────────────────────

export interface ConfirmationActor {
  id: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  isDemo?: boolean;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface ConfirmAccommodationDTO {
  confirmationStatus?: BookingComponentStatus;
  supplierConfirmationCode?: string;
  allocatedRoomNumbers?: string[];
  supplierContactName?: string;
  supplierContactPhone?: string;
  operationalNotes?: string;
  supplierNotes?: string;
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

// ── Storage abstraction ────────────────────────────────────────────────────────

export interface ConfirmationStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  getAccommodation(serviceId: string): Promise<BookingAccommodation | null>;
  getTransport(serviceId: string): Promise<BookingTransport | null>;
  getActivity(serviceId: string): Promise<BookingActivity | null>;
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
}

// In-memory implementation for testing
export class InMemoryConfirmationStorageProvider implements ConfirmationStorageProvider {
  private bookings: Map<string, Booking> = new Map();
  private accommodations: Map<string, BookingAccommodation> = new Map();
  private transports: Map<string, BookingTransport> = new Map();
  private activities: Map<string, BookingActivity> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();

  constructor(initialData?: {
    bookings?: Booking[];
    accommodations?: BookingAccommodation[];
    transports?: BookingTransport[];
    activities?: BookingActivity[];
  }) {
    for (const b of initialData?.bookings || []) this.bookings.set(b.id, JSON.parse(JSON.stringify(b)));
    for (const s of initialData?.accommodations || []) this.accommodations.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.transports || []) this.transports.set(s.id, JSON.parse(JSON.stringify(s)));
    for (const s of initialData?.activities || []) this.activities.set(s.id, JSON.parse(JSON.stringify(s)));
  }

  async getBooking(id: string) { const b = this.bookings.get(id); return b ? JSON.parse(JSON.stringify(b)) : null; }
  async getAccommodation(id: string) { const s = this.accommodations.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }
  async getTransport(id: string) { const s = this.transports.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }
  async getActivity(id: string) { const s = this.activities.get(id); return s ? JSON.parse(JSON.stringify(s)) : null; }

  async getServicesByBooking(bookingId: string) {
    return {
      accommodations: Array.from(this.accommodations.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      transports: Array.from(this.transports.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
      activities: Array.from(this.activities.values()).filter(s => s.bookingId === bookingId).map(s => JSON.parse(JSON.stringify(s))),
    };
  }

  async updateAccommodation(id: string, data: Partial<BookingAccommodation>) {
    const existing = this.accommodations.get(id);
    if (existing) this.accommodations.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
  async updateTransport(id: string, data: Partial<BookingTransport>) {
    const existing = this.transports.get(id);
    if (existing) this.transports.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
  async updateActivity(id: string, data: Partial<BookingActivity>) {
    const existing = this.activities.get(id);
    if (existing) this.activities.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
  async updateBooking(id: string, data: Partial<Booking>) {
    const existing = this.bookings.get(id);
    if (existing) this.bookings.set(id, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
  async logAuditEvent(auditLog: AuditLog) { this.auditLogs.set(auditLog.id, JSON.parse(JSON.stringify(auditLog))); }

  // Test helpers
  getBookingSync(id: string): Booking | undefined { return this.bookings.get(id); }
  getAccommodationSync(id: string): BookingAccommodation | undefined { return this.accommodations.get(id); }
  getTransportSync(id: string): BookingTransport | undefined { return this.transports.get(id); }
  getActivitySync(id: string): BookingActivity | undefined { return this.activities.get(id); }
  getAllAuditLogs(): AuditLog[] { return Array.from(this.auditLogs.values()); }
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
}

// ── RBAC ──────────────────────────────────────────────────────────────────────

const CONFIRMATION_ROLES: UserRole[] = ['Founder', 'Admin', 'Operations'];

function assertConfirmationRole(actor: ConfirmationActor) {
  if (!CONFIRMATION_ROLES.includes(actor.role)) {
    throw new ConfirmationError(
      403,
      'FORBIDDEN',
      `Role "${actor.role}" is not authorized to update service confirmation details.`
    );
  }
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
   * Confirm/update an accommodation service document.
   * Field-level guard: only operational fields are accepted.
   */
  async confirmAccommodation(
    bookingId: string,
    serviceId: string,
    dto: ConfirmAccommodationDTO,
    actor: ConfirmationActor
  ): Promise<ServiceConfirmationResult> {
    assertConfirmationRole(actor);

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) throw new ConfirmationError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    if (booking.status === 'CANCELLED') throw new ConfirmationError(422, 'BOOKING_CANCELLED', 'Cannot update services on a cancelled booking.');

    const service = await this.storageProvider.getAccommodation(serviceId);
    if (!service || service.bookingId !== bookingId) {
      throw new ConfirmationError(404, 'SERVICE_NOT_FOUND', `Accommodation service "${serviceId}" not found for this booking.`);
    }

    const now = new Date().toISOString();

    // Only allowed operational fields — strip anything else
    const allowedUpdate: Partial<BookingAccommodation> = {};
    if (dto.confirmationStatus !== undefined) allowedUpdate.confirmationStatus = dto.confirmationStatus;
    if (dto.supplierConfirmationCode !== undefined) allowedUpdate.supplierConfirmationCode = dto.supplierConfirmationCode;
    if (dto.allocatedRoomNumbers !== undefined) allowedUpdate.allocatedRoomNumbers = dto.allocatedRoomNumbers;
    if (dto.supplierContactName !== undefined) allowedUpdate.supplierContactName = dto.supplierContactName;
    if (dto.supplierContactPhone !== undefined) allowedUpdate.supplierContactPhone = dto.supplierContactPhone;
    if (dto.operationalNotes !== undefined) allowedUpdate.operationalNotes = dto.operationalNotes;
    if (dto.supplierNotes !== undefined) allowedUpdate.supplierNotes = dto.supplierNotes;
    allowedUpdate.updatedAt = now;

    await this.storageProvider.updateAccommodation(serviceId, allowedUpdate);

    const progress = await this.recomputeAndSaveProgress(bookingId, now);

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'SERVICE_ACCOMMODATION_CONFIRMED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { confirmationStatus: service.confirmationStatus },
      after: { confirmationStatus: dto.confirmationStatus ?? service.confirmationStatus, serviceId },
      reason: `Accommodation "${serviceId}" updated by ${actor.name}`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    return { success: true, confirmationProgress: progress, message: 'Accommodation service updated successfully.' };
  }

  /**
   * Confirm/update a transport service document.
   * Field-level guard: only operational fields are accepted.
   */
  async confirmTransport(
    bookingId: string,
    serviceId: string,
    dto: ConfirmTransportDTO,
    actor: ConfirmationActor
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
    actor: ConfirmationActor
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

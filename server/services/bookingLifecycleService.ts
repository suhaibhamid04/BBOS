// =====================================================
// BOOKING LIFECYCLE SERVICE
// Phase 2B-6 Stage 2 for Booking Bridge OS
// Handles booking-level state machine transitions:
//   CONFIRMED → IN_OPERATIONS (dispatch)
//   Any non-terminal → CANCELLED
// =====================================================

import { UserRole, AuditLog } from '../../src/types';
import { Booking, BookingStatus } from '../../src/types/booking';
import { getAdminDb } from '../firebaseAdmin.js';

// ── Actor & DTOs ──────────────────────────────────────────────────────────────

export interface LifecycleActor {
  id: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  isDemo?: boolean;
}

export interface DispatchResult {
  success: boolean;
  booking: Booking;
  message: string;
}

export interface CancelBookingDTO {
  cancellationReason: string;
}

export interface CancelResult {
  success: boolean;
  booking: Booking;
  message: string;
}

// ── Error ──────────────────────────────────────────────────────────────────────

export class LifecycleError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'LifecycleError';
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateAuditId(): string {
  return `AUDIT-LC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ── Storage abstraction (mirrors PaymentStorageProvider pattern) ───────────────

export interface LifecycleStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  updateBooking(bookingId: string, data: Partial<Booking>): Promise<void>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
}

export class InMemoryLifecycleStorageProvider implements LifecycleStorageProvider {
  private bookings: Map<string, Booking> = new Map();
  private auditLogs: Map<string, AuditLog> = new Map();

  constructor(initialData?: { bookings?: Booking[] }) {
    for (const b of initialData?.bookings || []) {
      this.bookings.set(b.id, JSON.parse(JSON.stringify(b)));
    }
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    const b = this.bookings.get(bookingId);
    return b ? JSON.parse(JSON.stringify(b)) : null;
  }

  async updateBooking(bookingId: string, data: Partial<Booking>): Promise<void> {
    const existing = this.bookings.get(bookingId);
    if (existing) {
      this.bookings.set(bookingId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
    }
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    this.auditLogs.set(auditLog.id, JSON.parse(JSON.stringify(auditLog)));
  }

  getAllBookings(): Booking[] {
    return Array.from(this.bookings.values());
  }

  getAllAuditLogs(): AuditLog[] {
    return Array.from(this.auditLogs.values());
  }
}

export class FirestoreLifecycleStorageProvider implements LifecycleStorageProvider {
  async getBooking(bookingId: string): Promise<Booking | null> {
    const db = getAdminDb();
    const snap = await db.collection('bookings').doc(bookingId).get();
    return snap.exists ? (snap.data() as Booking) : null;
  }

  async updateBooking(bookingId: string, data: Partial<Booking>): Promise<void> {
    const db = getAdminDb();
    await db.collection('bookings').doc(bookingId).update(data as any);
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    const db = getAdminDb();
    await db.collection('audit_logs').doc(auditLog.id).set(auditLog);
  }
}

// ── RBAC helpers ───────────────────────────────────────────────────────────────

const DISPATCH_ROLES: UserRole[] = ['Founder', 'Admin', 'Operations'];
const CANCEL_ROLES: UserRole[] = ['Founder', 'Admin'];

// ── Service ────────────────────────────────────────────────────────────────────

export class BookingLifecycleService {
  private storageProvider: LifecycleStorageProvider;

  constructor(storageProvider?: LifecycleStorageProvider) {
    this.storageProvider = storageProvider || new FirestoreLifecycleStorageProvider();
  }

  // ── TRANSITION: CONFIRMED → IN_OPERATIONS ─────────────────────────────────

  /**
   * Manual operations dispatch.
   * Transitions booking.status from CONFIRMED → IN_OPERATIONS.
   *
   * Authorized: Operations, Admin, Founder
   * Preconditions:
   *   - booking.status === 'CONFIRMED'
   */
  async dispatchToOperations(bookingId: string, actor: LifecycleActor): Promise<DispatchResult> {
    if (!DISPATCH_ROLES.includes(actor.role)) {
      throw new LifecycleError(
        403,
        'FORBIDDEN',
        `Role "${actor.role}" is not authorized to dispatch bookings to operations.`
      );
    }

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) {
      throw new LifecycleError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    }

    // Idempotency
    if (booking.status === 'IN_OPERATIONS') {
      return { success: true, booking, message: 'Booking is already in operations.' };
    }

    if (booking.status !== 'CONFIRMED') {
      throw new LifecycleError(
        422,
        'INVALID_STATE_TRANSITION',
        `Cannot dispatch booking in status "${booking.status}". Only CONFIRMED bookings can be dispatched to operations.`
      );
    }

    const now = new Date().toISOString();
    const updates: Partial<Booking> = {
      status: 'IN_OPERATIONS',
      updatedAt: now,
    };

    await this.storageProvider.updateBooking(bookingId, updates);

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'BOOKING_DISPATCHED_TO_OPERATIONS',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { status: booking.status },
      after: { status: 'IN_OPERATIONS' },
      reason: `Booking dispatched to operations by ${actor.name} (${actor.role})`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    const updatedBooking: Booking = { ...booking, ...updates };
    return {
      success: true,
      booking: updatedBooking,
      message: 'Booking successfully dispatched to operations.',
    };
  }

  // ── TRANSITION: ANY → CANCELLED ───────────────────────────────────────────

  /**
   * Cancels a booking.
   * A cancellation reason is required.
   *
   * Authorized: Admin, Founder
   * Preconditions:
   *   - booking.status not already CANCELLED or COMPLETED
   */
  async cancelBooking(
    bookingId: string,
    dto: CancelBookingDTO,
    actor: LifecycleActor
  ): Promise<CancelResult> {
    if (!CANCEL_ROLES.includes(actor.role)) {
      throw new LifecycleError(
        403,
        'FORBIDDEN',
        `Role "${actor.role}" is not authorized to cancel bookings.`
      );
    }

    if (!dto.cancellationReason || dto.cancellationReason.trim().length < 5) {
      throw new LifecycleError(
        400,
        'CANCELLATION_REASON_REQUIRED',
        'A cancellation reason of at least 5 characters is required.'
      );
    }

    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) {
      throw new LifecycleError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
    }

    const TERMINAL_STATUSES: BookingStatus[] = ['CANCELLED', 'COMPLETED'];
    if (TERMINAL_STATUSES.includes(booking.status)) {
      throw new LifecycleError(
        422,
        'ALREADY_TERMINAL',
        `Booking is already in a terminal state: "${booking.status}". Cannot cancel.`
      );
    }

    const now = new Date().toISOString();
    const updates: Partial<Booking> = {
      status: 'CANCELLED',
      updatedAt: now,
      ...(dto.cancellationReason ? { guestNotes: `CANCELLED: ${dto.cancellationReason}` } : {}),
    };

    await this.storageProvider.updateBooking(bookingId, updates);

    const auditLog: AuditLog = {
      id: generateAuditId(),
      timestamp: now,
      actorType: 'HUMAN',
      actorId: actor.uid || actor.id,
      actorName: `${actor.name} (${actor.role})`,
      action: 'BOOKING_CANCELLED',
      entityType: 'BOOKING',
      entityId: bookingId,
      before: { status: booking.status },
      after: { status: 'CANCELLED', cancellationReason: dto.cancellationReason },
      reason: `Cancelled by ${actor.name}: ${dto.cancellationReason}`,
    };
    await this.storageProvider.logAuditEvent(auditLog);

    const updatedBooking: Booking = { ...booking, ...updates };
    return {
      success: true,
      booking: updatedBooking,
      message: `Booking "${bookingId}" has been cancelled.`,
    };
  }
}

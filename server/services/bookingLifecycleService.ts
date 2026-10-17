// =====================================================
// BOOKING LIFECYCLE SERVICE
// Phase 2B-6 Stage 2 for Booking Bridge OS
// Handles booking-level state machine transitions:
//   CONFIRMED → IN_OPERATIONS (dispatch)
//   Any non-terminal → CANCELLED
// =====================================================

import { UserRole, AuditLog } from '../../src/types';
import { randomUUID } from 'node:crypto';
import { Booking, BookingStatus } from '../../src/types/booking';
import { getAdminDb } from '../firebaseAdmin.js';
import { canAccessOperationalBooking } from '../authorization/operationalBookingAccess.js';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';

// ── Actor & DTOs ──────────────────────────────────────────────────────────────

export interface LifecycleActor {
  id: string;
  employeeId: string;
  active: boolean;
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
  return `AUDIT-LC-${randomUUID()}`;
}

// ── Storage abstraction (mirrors PaymentStorageProvider pattern) ───────────────

export interface LifecycleStorageProvider {
  getBooking(bookingId: string): Promise<Booking | null>;
  updateBooking(bookingId: string, data: Partial<Booking>): Promise<void>;
  logAuditEvent(auditLog: AuditLog): Promise<void>;
  runTransaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T>;
}

export type LifecycleTransaction = Pick<LifecycleStorageProvider, 'getBooking' | 'updateBooking' | 'logAuditEvent'>;

export class InMemoryLifecycleStorageProvider implements LifecycleStorageProvider {
  private store = new InMemoryConversionStorageProvider();

  constructor(initialData?: { bookings?: Booking[] }) {
    for (const b of initialData?.bookings || []) {
      this.store.rawSet('bookings', b.id, b);
    }
  }

  async getBooking(bookingId: string): Promise<Booking | null> {
    return this.store.rawGet('bookings', bookingId);
  }

  async updateBooking(bookingId: string, data: Partial<Booking>): Promise<void> {
    this.store.rawUpdate('bookings', bookingId, data);
  }

  async logAuditEvent(auditLog: AuditLog): Promise<void> {
    this.store.rawSet('audit_logs', auditLog.id, auditLog);
  }

  getAllBookings(): Booking[] {
    return this.store.rawList('bookings');
  }

  getAllAuditLogs(): AuditLog[] {
    return this.store.rawList('audit_logs');
  }

  async runTransaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T> {
    return this.store.runTransaction(tx => operation({
      getBooking: id => tx.get('bookings', id),
      updateBooking: async (id, data) => { tx.update('bookings', id, data); },
      logAuditEvent: async audit => { tx.set('audit_logs', audit.id, audit); },
    }));
  }
}

export class FirestoreLifecycleStorageProvider implements LifecycleStorageProvider {
  async runTransaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T> {
    const db = getAdminDb();
    return db.runTransaction(tx => operation({
      getBooking: async id => {
        const snap = await tx.get(db.collection('bookings').doc(id));
        return snap.exists ? { ...snap.data(), id: snap.id } as Booking : null;
      },
      updateBooking: async (id, data) => { tx.update(db.collection('bookings').doc(id), data); },
      logAuditEvent: async audit => { tx.set(db.collection('audit_logs').doc(audit.id), audit); },
    }));
  }
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
    if (!DISPATCH_ROLES.includes(actor.role) || actor.active !== true || !actor.employeeId?.trim()) {
      throw new LifecycleError(
        403,
        'FORBIDDEN',
        `Role "${actor.role}" is not authorized to dispatch bookings to operations.`
      );
    }

    return this.storageProvider.runTransaction(async transaction => {
      const booking = await transaction.getBooking(bookingId);
      if (!booking) {
        throw new LifecycleError(404, 'BOOKING_NOT_FOUND', `Booking "${bookingId}" not found.`);
      }

      if (!canAccessOperationalBooking(actor, booking, 'DISPATCH_OPERATIONS')) {
        throw new LifecycleError(403, 'FORBIDDEN', 'The employee is not assigned to this booking.');
      }

      // Idempotency is checked only after resource authorization.
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

      await transaction.updateBooking(bookingId, updates);

      const auditLog: AuditLog = {
        id: generateAuditId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`,
        action: 'BOOKING_DISPATCHED_TO_OPERATIONS',
        entityType: 'BOOKING',
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: 'IN_OPERATIONS' },
        reason: `Booking dispatched to operations by ${actor.name} (${actor.role})`,
      };
      await transaction.logAuditEvent(auditLog);

      const updatedBooking: Booking = { ...booking, ...updates };
      return {
        success: true,
        booking: updatedBooking,
        message: 'Booking successfully dispatched to operations.',
      };
    });
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
    if (!CANCEL_ROLES.includes(actor.role) || actor.active !== true || !actor.employeeId?.trim()) {
      throw new LifecycleError(
        403,
        'FORBIDDEN',
        `Role "${actor.role}" is not authorized to cancel bookings.`
      );
    }

    if (typeof dto?.cancellationReason !== 'string' || dto.cancellationReason.trim().length < 5 || dto.cancellationReason.length > 2000) {
      throw new LifecycleError(
        400,
        'CANCELLATION_REASON_REQUIRED',
        'A cancellation reason of at least 5 characters is required.'
      );
    }

    return this.storageProvider.runTransaction(async transaction => {
      const booking = await transaction.getBooking(bookingId);
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
        guestNotes: [booking.guestNotes, `CANCELLED: ${dto.cancellationReason.trim()}`].filter(Boolean).join('\n'),
      };

      await transaction.updateBooking(bookingId, updates);

      const auditLog: AuditLog = {
        id: generateAuditId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
        actorName: `${actor.name} (${actor.role})`,
        action: 'BOOKING_CANCELLED',
        entityType: 'BOOKING',
        entityId: bookingId,
        before: { status: booking.status },
        after: { status: 'CANCELLED', cancellationReason: dto.cancellationReason },
        reason: `Cancelled by ${actor.name}: ${dto.cancellationReason}`,
      };
      await transaction.logAuditEvent(auditLog);

      const updatedBooking: Booking = { ...booking, ...updates };
      return {
        success: true,
        booking: updatedBooking,
        message: `Booking "${bookingId}" has been cancelled.`,
      };
    });
  }
}

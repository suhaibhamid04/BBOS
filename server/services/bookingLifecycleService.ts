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
import type { CommissionLedgerEntry } from '../../src/types/financialExceptions.js';

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
  getCommissionEntry(entryId: string): Promise<CommissionLedgerEntry | null>;
  getEmployee(employeeId: string): Promise<Record<string, unknown> | null>;
  setCommissionEntry(entryId: string, entry: CommissionLedgerEntry): Promise<void>;
  runTransaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T>;
}

export type LifecycleTransaction = Pick<LifecycleStorageProvider, 'getBooking' | 'updateBooking' | 'logAuditEvent' | 'getCommissionEntry' | 'getEmployee' | 'setCommissionEntry'>;

export class InMemoryLifecycleStorageProvider implements LifecycleStorageProvider {
  private store = new InMemoryConversionStorageProvider();

  constructor(initialData?: { bookings?: Booking[]; commissionEntries?: CommissionLedgerEntry[]; employees?: Array<Record<string, unknown> & { employeeId: string }> }) {
    for (const b of initialData?.bookings || []) {
      this.store.rawSet('bookings', b.id, b);
    }
    for (const entry of initialData?.commissionEntries || []) this.store.rawSet('commission_ledger', entry.id, entry);
    for (const employee of initialData?.employees || []) this.store.rawSet('employees', employee.employeeId, employee);
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

  async getCommissionEntry(entryId: string) { return this.store.rawGet('commission_ledger', entryId) as CommissionLedgerEntry | null; }
  async getEmployee(employeeId: string) { return this.store.rawGet('employees', employeeId) as Record<string, unknown> | null; }
  async setCommissionEntry(entryId: string, entry: CommissionLedgerEntry) { this.store.rawSet('commission_ledger', entryId, entry); }

  getAllBookings(): Booking[] {
    return this.store.rawList('bookings');
  }

  getAllAuditLogs(): AuditLog[] {
    return this.store.rawList('audit_logs');
  }

  getAllCommissionEntries(): CommissionLedgerEntry[] { return this.store.rawList('commission_ledger') as CommissionLedgerEntry[]; }

  async runTransaction<T>(operation: (transaction: LifecycleTransaction) => Promise<T>): Promise<T> {
    return this.store.runTransaction(tx => operation({
      getBooking: id => tx.get('bookings', id),
      updateBooking: async (id, data) => { tx.update('bookings', id, data); },
      logAuditEvent: async audit => { tx.set('audit_logs', audit.id, audit); },
      getCommissionEntry: id => tx.get('commission_ledger', id),
      getEmployee: id => tx.get('employees', id),
      setCommissionEntry: async (id, entry) => { tx.set('commission_ledger', id, entry); },
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
      getCommissionEntry: async id => {
        const snap = await tx.get(db.collection('commission_ledger').doc(id));
        return snap.exists ? snap.data() as CommissionLedgerEntry : null;
      },
      getEmployee: async id => {
        const snap = await tx.get(db.collection('employees').doc(id));
        return snap.exists ? snap.data() as Record<string, unknown> : null;
      },
      setCommissionEntry: async (id, entry) => { tx.set(db.collection('commission_ledger').doc(id), entry); },
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
  async getCommissionEntry(entryId: string): Promise<CommissionLedgerEntry | null> {
    const snap = await getAdminDb().collection('commission_ledger').doc(entryId).get();
    return snap.exists ? snap.data() as CommissionLedgerEntry : null;
  }
  async getEmployee(employeeId: string): Promise<Record<string, unknown> | null> {
    const snap = await getAdminDb().collection('employees').doc(employeeId).get();
    return snap.exists ? snap.data() as Record<string, unknown> : null;
  }
  async setCommissionEntry(entryId: string, entry: CommissionLedgerEntry): Promise<void> {
    await getAdminDb().collection('commission_ledger').doc(entryId).set(entry);
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
      let earnedEntry: CommissionLedgerEntry | null = null;
      let reversalEntry: CommissionLedgerEntry | null = null;
      let commissionEarnedWasBackfilled = false;
      if (booking.assignedSalesEmployeeId && ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING'].includes(booking.status)) {
        const earnedId = `commission-earned-${bookingId}`;
        const reversalId = `commission-reversal-cancellation-${bookingId}`;
        const [storedEarned, storedReversal, employee] = await Promise.all([
          transaction.getCommissionEntry(earnedId),
          transaction.getCommissionEntry(reversalId),
          transaction.getEmployee(booking.assignedSalesEmployeeId),
        ]);
        const configured = employee?.commissionPerConfirmedBooking;
        commissionEarnedWasBackfilled = !storedEarned;
        earnedEntry = storedEarned || {
          id: earnedId, bookingId, employeeId: booking.assignedSalesEmployeeId, type: 'EARNED',
          amount: typeof configured === 'number' && Number.isFinite(configured) && configured >= 0 ? configured : 500,
          currency: booking.currency || 'INR', bookingStatus: booking.status,
          reason: 'Commission earned for the authoritative confirmed Booking.', actorEmployeeId: actor.employeeId,
          createdAt: now, idempotencyKey: earnedId,
          policyCode: configured === undefined ? 'STANDARD_CONFIRMED_BOOKING_COMMISSION' : 'EMPLOYEE_CUSTOM_CONFIRMED_BOOKING_COMMISSION',
        };
        reversalEntry = storedReversal || {
          id: reversalId, bookingId, employeeId: booking.assignedSalesEmployeeId, type: 'REVERSAL',
          amount: earnedEntry.amount, currency: earnedEntry.currency, originalEntryId: earnedEntry.id,
          cancellationReference: bookingId, bookingStatus: 'CANCELLED', reason: dto.cancellationReason.trim(),
          actorEmployeeId: actor.employeeId, createdAt: now, idempotencyKey: reversalId,
        };
      }
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

      if (earnedEntry && reversalEntry) {
        await transaction.setCommissionEntry(earnedEntry.id, earnedEntry);
        await transaction.setCommissionEntry(reversalEntry.id, reversalEntry);
        if (commissionEarnedWasBackfilled) {
          await transaction.logAuditEvent({
            id: `${earnedEntry.id}-AUDIT`, timestamp: now, actorType: 'SYSTEM', actorId: actor.employeeId,
            actorName: `${actor.name} (${actor.role})`, action: 'COMMISSION_EARNED',
            entityType: 'COMMISSION_LEDGER', entityId: earnedEntry.id, before: null,
            after: { amount: earnedEntry.amount, employeeId: earnedEntry.employeeId, policyCode: earnedEntry.policyCode },
            reason: 'Backfilled deterministic earned commission before cancellation reversal.',
          });
        }
        await transaction.logAuditEvent({
          id: generateAuditId(), timestamp: now, actorType: 'HUMAN', actorId: actor.employeeId,
          actorName: `${actor.name} (${actor.role})`, action: 'COMMISSION_REVERSED',
          entityType: 'COMMISSION_LEDGER', entityId: reversalEntry.id,
          before: { originalEntryId: earnedEntry.id, amount: earnedEntry.amount, employeeId: earnedEntry.employeeId },
          after: { reversalEntryId: reversalEntry.id, amount: reversalEntry.amount, bookingStatus: 'CANCELLED' },
          reason: dto.cancellationReason.trim(),
        });
      }

      const updatedBooking: Booking = { ...booking, ...updates };
      return {
        success: true,
        booking: updatedBooking,
        message: `Booking "${bookingId}" has been cancelled.`,
      };
    });
  }
}

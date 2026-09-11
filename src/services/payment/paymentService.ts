// =====================================================
// PAYMENT SERVICE & ENGINE — CORE DOMAIN LOGIC
// Phase 2B-5D Stage 5 for Booking Bridge OS
// Document Version: 2.1.0
// =====================================================

import { UserRole, AuditLog } from '../../types';
import { Booking, BookingStatus, PaymentStatus } from '../../types/booking';
import {
  PaymentRecord,
  PaymentRecordStatus,
  PaymentMethod,
  PaymentType,
} from '../../types/payment';
import {
  PaymentStorageProvider,
  PaymentTransaction,
  FirestorePaymentStorageProvider,
} from './paymentStorageProvider';

export interface PaymentActor {
  id: string;
  uid?: string;
  name: string;
  email?: string;
  role: UserRole;
  isDemo?: boolean;
}

export interface RecordPaymentDTO {
  amount: number;
  currency?: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  paymentType: PaymentType;
  notes?: string;
  idempotencyKey?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  isIdempotent?: boolean;
  payment: PaymentRecord;
  booking: Booking;
  message: string;
}

export interface RejectPaymentResult {
  success: boolean;
  isIdempotent?: boolean;
  payment: PaymentRecord;
  message: string;
}

export interface VoidPaymentResult {
  success: boolean;
  isIdempotent?: boolean;
  payment: PaymentRecord;
  booking: Booking;
  message: string;
}

export class PaymentError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export function generatePaymentId(): string {
  return `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function generateAuditLogId(): string {
  return `AUDIT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

/**
 * Authoritative Booking-Level Payment Access Control Guard.
 * Enforces ownership, scoping, and role boundaries:
 * - Marketing: universally denied (403)
 * - Operations: read-only for assigned bookings (403 if unassigned or mutation attempted)
 * - Sales Executive: assigned bookings only (403 if unassigned or verification/void attempted)
 * - Sales Manager: authorized commercial bookings (403 if assigned to another manager or mutation beyond recording)
 * - Accounts: enterprise-wide read, record, verify, reject (403 if void attempted)
 * - Founder / Admin: enterprise-wide access including voiding
 */
export function assertBookingPaymentAccess(
  actor: PaymentActor,
  booking: Booking,
  action: 'READ' | 'RECORD' | 'VERIFY' | 'REJECT' | 'VOID'
): void {
  // 1. Marketing is strictly blocked from all payment operations
  if (actor.role === 'Marketing') {
    throw new PaymentError(403, 'FORBIDDEN', 'Marketing role has no access to booking payments.');
  }

  // 2. Voiding is restricted strictly to Founder and Admin
  if (action === 'VOID') {
    if (actor.role !== 'Founder' && actor.role !== 'Admin') {
      throw new PaymentError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized to void payments. Only Founder and Admin can void.`);
    }
    return;
  }

  // 3. Verification and Rejection are restricted strictly to Founder, Admin, Accounts
  if (action === 'VERIFY' || action === 'REJECT') {
    if (!['Founder', 'Admin', 'Accounts'].includes(actor.role)) {
      throw new PaymentError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized to verify or reject payments.`);
    }
    return;
  }

  // 4. Founder, Admin, Accounts have enterprise-wide commercial & financial access
  if (['Founder', 'Admin', 'Accounts'].includes(actor.role)) {
    return;
  }

  // 5. Operations: READ ONLY for assigned bookings
  if (actor.role === 'Operations') {
    if (action !== 'READ') {
      throw new PaymentError(403, 'FORBIDDEN', 'Operations role cannot record, verify, reject, or void payments.');
    }
    const isAssignedOps = Boolean(booking.assignedOperationsEmployeeId && booking.assignedOperationsEmployeeId === actor.id);
    if (!isAssignedOps) {
      throw new PaymentError(403, 'FORBIDDEN', 'Operations user is not assigned to this booking.');
    }
    return;
  }

  // 6. Sales Executive: assigned booking only, READ and RECORD only
  if (actor.role === 'Sales Executive') {
    const isAssigned = booking.assignedSalesEmployeeId === actor.id;
    if (!isAssigned) {
      throw new PaymentError(403, 'FORBIDDEN', 'Sales Executive is not authorized to access payments for an unassigned booking.');
    }
    return;
  }

  // 7. Sales Manager: authorized commercial bookings according to existing BBOS model
  if (actor.role === 'Sales Manager') {
    const isManagerAuthorized = Boolean(
      (booking.assignedSalesManagerId && booking.assignedSalesManagerId === actor.id) ||
      (booking.assignedSalesEmployeeId && booking.assignedSalesEmployeeId === actor.id)
    );
    if (!isManagerAuthorized) {
      throw new PaymentError(403, 'FORBIDDEN', 'Sales Manager is not authorized to access payments for this booking.');
    }
    return;
  }

  throw new PaymentError(403, 'FORBIDDEN', `Role ${actor.role} is not authorized to perform ${action} on booking payments.`);
}

export class PaymentService {
  private storageProvider: PaymentStorageProvider;

  constructor(storageProvider?: PaymentStorageProvider) {
    this.storageProvider = storageProvider || new FirestorePaymentStorageProvider();
  }

  /**
   * Helper to retrieve booking with authorization guard.
   */
  private async getAuthorizedBooking(
    bookingId: string,
    actor: PaymentActor,
    action: 'READ' | 'RECORD' | 'VERIFY' | 'REJECT' | 'VOID'
  ): Promise<Booking> {
    if (!bookingId) {
      throw new PaymentError(400, 'BAD_REQUEST', 'Booking ID is required.');
    }
    const booking = await this.storageProvider.getBooking(bookingId);
    if (!booking) {
      throw new PaymentError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
    }

    assertBookingPaymentAccess(actor, booking, action);
    return booking;
  }

  /**
   * 1. RECORD PAYMENT
   * Creates a payment claim with status 'RECORDED'.
   * Does NOT modify booking aggregates.
   */
  async recordPayment(
    bookingId: string,
    dto: RecordPaymentDTO,
    actor: PaymentActor
  ): Promise<PaymentRecord> {
    const booking = await this.getAuthorizedBooking(bookingId, actor, 'RECORD');

    if (booking.status === 'CANCELLED') {
      throw new PaymentError(422, 'BOOKING_CANCELLED', 'Cannot record payment on a cancelled booking.');
    }

    // Amount validation
    if (typeof dto.amount !== 'number' || isNaN(dto.amount) || dto.amount <= 0) {
      throw new PaymentError(400, 'INVALID_AMOUNT', 'Payment amount must be a positive number greater than 0.');
    }
    // Max 2 decimal places validation
    if (Math.round(dto.amount * 100) !== dto.amount * 100) {
      throw new PaymentError(400, 'INVALID_AMOUNT_PRECISION', 'Payment amount cannot exceed 2 decimal places.');
    }

    // Currency validation
    const bookingCurrency = (booking.currency || 'INR').toUpperCase();
    const paymentCurrency = (dto.currency || bookingCurrency).toUpperCase();
    if (paymentCurrency !== bookingCurrency) {
      throw new PaymentError(
        422,
        'CURRENCY_MISMATCH',
        `Payment currency "${paymentCurrency}" does not match booking currency "${bookingCurrency}".`
      );
    }

    // Method & Type validation
    const validMethods: PaymentMethod[] = [
      'BANK_TRANSFER',
      'UPI',
      'CREDIT_CARD',
      'DEBIT_CARD',
      'CASH',
      'CHEQUE',
      'OTHER',
    ];
    if (!validMethods.includes(dto.paymentMethod)) {
      throw new PaymentError(400, 'INVALID_PAYMENT_METHOD', `Invalid payment method "${dto.paymentMethod}".`);
    }

    const validTypes: PaymentType[] = ['ADVANCE', 'PARTIAL', 'FINAL_BALANCE', 'SECURITY_DEPOSIT'];
    if (!validTypes.includes(dto.paymentType)) {
      throw new PaymentError(400, 'INVALID_PAYMENT_TYPE', `Invalid payment type "${dto.paymentType}".`);
    }

    // Reference validation & normalization
    if (!dto.referenceNumber || typeof dto.referenceNumber !== 'string' || dto.referenceNumber.trim() === '') {
      throw new PaymentError(400, 'MISSING_REFERENCE_NUMBER', 'Reference number is required for all payment records.');
    }
    const normalizedRef = dto.referenceNumber.trim().toUpperCase();

    // Payment date validation
    if (!dto.paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(dto.paymentDate)) {
      throw new PaymentError(400, 'INVALID_PAYMENT_DATE', 'Payment date must be in valid ISO YYYY-MM-DD format.');
    }

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      // Existing payments for duplicate and idempotency check
      const existingPayments = await tx.getPaymentsForBooking(bookingId);

      // Idempotency Key check
      if (dto.idempotencyKey) {
        const matchKey = existingPayments.find((p) => p.idempotencyKey === dto.idempotencyKey);
        if (matchKey) {
          const isPayloadMatch =
            matchKey.amount === dto.amount &&
            matchKey.currency === paymentCurrency &&
            matchKey.paymentMethod === dto.paymentMethod &&
            matchKey.referenceNumber === normalizedRef &&
            matchKey.paymentType === dto.paymentType;

          if (!isPayloadMatch) {
            throw new PaymentError(
              409,
              'IDEMPOTENCY_PAYLOAD_MISMATCH',
              `Idempotency key "${dto.idempotencyKey}" has already been used with different payment parameters.`
            );
          }
          return matchKey;
        }
      }

      // Duplicate reference check
      const duplicate = existingPayments.find(
        (p) =>
          p.paymentMethod === dto.paymentMethod &&
          p.referenceNumber === normalizedRef &&
          (p.status === 'RECORDED' || p.status === 'VERIFIED')
      );

      if (duplicate) {
        throw new PaymentError(
          409,
          'DUPLICATE_TRANSACTION_REFERENCE',
          `A payment with reference "${normalizedRef}" and method "${dto.paymentMethod}" has already been recorded or verified for this booking.`
        );
      }

      const now = new Date().toISOString();
      const paymentId = generatePaymentId();

      const paymentRecord: PaymentRecord = {
        id: paymentId,
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
        customerId: booking.customerId,
        customerName: booking.customerName,
        amount: dto.amount,
        currency: paymentCurrency,
        paymentDate: dto.paymentDate,
        paymentMethod: dto.paymentMethod,
        referenceNumber: normalizedRef,
        paymentType: dto.paymentType,
        notes: dto.notes ? dto.notes.trim() : undefined,
        status: 'RECORDED',
        recordedBy: actor.id,
        recordedByName: actor.name,
        recordedByRole: actor.role,
        recordedAt: now,
        idempotencyKey: dto.idempotencyKey,
        schemaVersion: '2B-5',
        createdAt: now,
        updatedAt: now,
        isDemo: actor.isDemo,
      };

      tx.setPayment(paymentId, paymentRecord);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.uid || actor.id,
        actorName: `${actor.name} (${actor.role})`,
        action: 'PAYMENT_RECORDED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        before: null,
        after: {
          bookingId: booking.id,
          bookingReference: booking.bookingReference,
          amount: paymentRecord.amount,
          currency: paymentRecord.currency,
          paymentMethod: paymentRecord.paymentMethod,
          referenceNumber: paymentRecord.referenceNumber,
          status: 'RECORDED',
        },
        reason: `Payment ${paymentId} recorded for booking ${booking.bookingReference}`,
      };
      tx.setAuditLog(auditLog.id, auditLog);

      return paymentRecord;
    });
  }

  /**
   * 2. GET PAYMENTS FOR BOOKING
   * Returns all payments for an authorized booking.
   * Strips any sensitive/unrelated data.
   */
  async getPaymentsForBooking(bookingId: string, actor: PaymentActor): Promise<PaymentRecord[]> {
    await this.getAuthorizedBooking(bookingId, actor, 'READ');
    return this.storageProvider.getPaymentsForBooking(bookingId);
  }

  /**
   * 3. VERIFY PAYMENT
   * Server-authoritative, atomic transaction.
   * RECORDED -> VERIFIED
   * Recalculates booking aggregates (amountReceived, amountPending, paymentStatus).
   * Transitions booking.status to CONFIRMED if PENDING_PAYMENT.
   */
  async verifyPayment(
    bookingId: string,
    paymentId: string,
    actor: PaymentActor
  ): Promise<VerifyPaymentResult> {
    const booking = await this.getAuthorizedBooking(bookingId, actor, 'VERIFY');

    if (booking.status === 'CANCELLED') {
      throw new PaymentError(422, 'BOOKING_CANCELLED', 'Cannot verify payment on a cancelled booking.');
    }

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const txBooking = (await tx.getBooking(bookingId)) || booking;
      const payment = await tx.getPayment(paymentId);

      // IDOR & Cross-booking scoping guard
      if (!payment || payment.bookingId !== bookingId) {
        throw new PaymentError(404, 'PAYMENT_NOT_FOUND', `Payment with ID "${paymentId}" not found for this booking.`);
      }

      // Idempotency: Already verified
      if (payment.status === 'VERIFIED') {
        return {
          success: true,
          isIdempotent: true,
          payment,
          booking: txBooking,
          message: 'Payment has already been verified.',
        };
      }

      // State machine validation
      if (payment.status === 'REJECTED') {
        throw new PaymentError(422, 'INVALID_STATE_TRANSITION', 'Cannot verify a payment that has been REJECTED.');
      }
      if (payment.status === 'VOIDED') {
        throw new PaymentError(422, 'INVALID_STATE_TRANSITION', 'Cannot verify a payment that has been VOIDED.');
      }

      // Anti-Self-Verification guard
      if (payment.recordedBy === actor.id) {
        throw new PaymentError(
          403,
          'SELF_VERIFICATION_BLOCKED',
          'Self-verification is prohibited. The actor who recorded the payment cannot verify it.'
        );
      }

      const now = new Date().toISOString();
      const allPayments = await tx.getPaymentsForBooking(bookingId);

      // Recalculate verified sum
      let sumVerified = 0;
      for (const p of allPayments) {
        if (p.id === paymentId || p.status === 'VERIFIED') {
          sumVerified += p.amount;
        }
      }

      const totalSellingPrice = txBooking.totalSellingPrice || txBooking.totalAmount || 0;
      const amountReceived = sumVerified;
      const amountPending = Math.max(0, totalSellingPrice - amountReceived);

      let newPaymentStatus: PaymentStatus = 'UNPAID';
      if (amountReceived >= totalSellingPrice && totalSellingPrice > 0) {
        newPaymentStatus = 'PAID';
      } else if (amountReceived > 0) {
        newPaymentStatus = 'PARTIALLY_PAID';
      }

      const isOverpaid = amountReceived > totalSellingPrice;
      const overpaidAmount = isOverpaid ? amountReceived - totalSellingPrice : 0;

      // Update payment
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'VERIFIED',
        verifiedBy: actor.id,
        verifiedByName: actor.name,
        verifiedByRole: actor.role,
        verifiedAt: now,
        updatedAt: now,
      };
      tx.updatePayment(paymentId, paymentUpdates);

      // Update booking
      const bookingUpdates: Partial<Booking> = {
        amountReceived,
        amountPending,
        paymentStatus: newPaymentStatus,
        isOverpaid,
        overpaidAmount,
        updatedAt: now,
      };

      // Commercial status transition: PENDING_PAYMENT -> CONFIRMED
      if (txBooking.status === 'PENDING_PAYMENT' && amountReceived > 0) {
        bookingUpdates.status = 'CONFIRMED';
      }

      tx.updateBooking(bookingId, bookingUpdates);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.uid || actor.id,
        actorName: `${actor.name} (${actor.role})`,
        action: 'PAYMENT_VERIFIED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        before: {
          status: payment.status,
          amountReceived: txBooking.amountReceived,
          paymentStatus: txBooking.paymentStatus,
        },
        after: {
          bookingId,
          amount: payment.amount,
          previousStatus: payment.status,
          newStatus: 'VERIFIED',
          resultingAmountReceived: amountReceived,
          resultingAmountPending: amountPending,
          resultingPaymentStatus: newPaymentStatus,
        },
        reason: `Payment ${paymentId} verified by ${actor.name} (${actor.role})`,
      };
      tx.setAuditLog(auditLog.id, auditLog);

      const updatedPayment: PaymentRecord = { ...payment, ...paymentUpdates };
      const updatedBooking: Booking = { ...txBooking, ...bookingUpdates };

      return {
        success: true,
        payment: updatedPayment,
        booking: updatedBooking,
        message: 'Payment verified successfully.',
      };
    });
  }

  /**
   * 4. REJECT PAYMENT
   * Server-authoritative, atomic transaction.
   * RECORDED -> REJECTED
   * Excluded from aggregates.
   */
  async rejectPayment(
    bookingId: string,
    paymentId: string,
    rejectionReason: string,
    actor: PaymentActor
  ): Promise<RejectPaymentResult> {
    await this.getAuthorizedBooking(bookingId, actor, 'REJECT');

    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 5) {
      throw new PaymentError(
        400,
        'INVALID_REJECTION_REASON',
        'Rejection reason is required and must be at least 5 characters.'
      );
    }

    const trimmedReason = rejectionReason.trim();

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const payment = await tx.getPayment(paymentId);

      // IDOR & Cross-booking scoping guard
      if (!payment || payment.bookingId !== bookingId) {
        throw new PaymentError(404, 'PAYMENT_NOT_FOUND', `Payment with ID "${paymentId}" not found for this booking.`);
      }

      // Idempotency: Already rejected
      if (payment.status === 'REJECTED') {
        return {
          success: true,
          isIdempotent: true,
          payment,
          message: 'Payment has already been rejected.',
        };
      }

      // State machine validation
      if (payment.status === 'VERIFIED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          'Cannot reject a VERIFIED payment. Use void workflow instead.'
        );
      }
      if (payment.status === 'VOIDED') {
        throw new PaymentError(422, 'INVALID_STATE_TRANSITION', 'Cannot reject a payment that has been VOIDED.');
      }

      const now = new Date().toISOString();
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'REJECTED',
        verifiedBy: actor.id,
        verifiedByName: actor.name,
        verifiedByRole: actor.role,
        verifiedAt: now,
        rejectionReason: trimmedReason,
        updatedAt: now,
      };

      tx.updatePayment(paymentId, paymentUpdates);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.uid || actor.id,
        actorName: `${actor.name} (${actor.role})`,
        action: 'PAYMENT_REJECTED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        before: {
          status: payment.status,
        },
        after: {
          bookingId,
          amount: payment.amount,
          previousStatus: payment.status,
          newStatus: 'REJECTED',
          rejectionReason: trimmedReason,
        },
        reason: trimmedReason,
      };
      tx.setAuditLog(auditLog.id, auditLog);

      const updatedPayment: PaymentRecord = { ...payment, ...paymentUpdates };

      return {
        success: true,
        payment: updatedPayment,
        message: 'Payment rejected successfully.',
      };
    });
  }

  /**
   * 5. VOID PAYMENT
   * Server-authoritative, atomic transaction.
   * VERIFIED -> VOIDED
   * Restricted to Admin & Founder ONLY.
   * Atomically reduces booking aggregates.
   * Excluded from aggregates.
   */
  async voidPayment(
    bookingId: string,
    paymentId: string,
    voidReason: string,
    actor: PaymentActor
  ): Promise<VoidPaymentResult> {
    const booking = await this.getAuthorizedBooking(bookingId, actor, 'VOID');

    if (!voidReason || typeof voidReason !== 'string' || voidReason.trim().length < 5) {
      throw new PaymentError(
        400,
        'INVALID_VOID_REASON',
        'Void reason is required and must be at least 5 characters.'
      );
    }

    const trimmedReason = voidReason.trim();

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const txBooking = (await tx.getBooking(bookingId)) || booking;
      const payment = await tx.getPayment(paymentId);

      // IDOR & Cross-booking scoping guard
      if (!payment || payment.bookingId !== bookingId) {
        throw new PaymentError(404, 'PAYMENT_NOT_FOUND', `Payment with ID "${paymentId}" not found for this booking.`);
      }

      // Idempotency: Already voided
      if (payment.status === 'VOIDED') {
        return {
          success: true,
          isIdempotent: true,
          payment,
          booking: txBooking,
          message: 'Payment has already been voided.',
        };
      }

      // State machine validation: Only VERIFIED payments can be voided
      if (payment.status === 'RECORDED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          'Only VERIFIED payments can be voided. Use reject for unverified payments.'
        );
      }
      if (payment.status === 'REJECTED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          'Payment is already REJECTED. Cannot void a rejected payment.'
        );
      }

      const now = new Date().toISOString();
      const allPayments = await tx.getPaymentsForBooking(bookingId);

      // Recalculate remaining verified sum EXCLUDING this payment
      let sumVerified = 0;
      for (const p of allPayments) {
        if (p.id !== paymentId && p.status === 'VERIFIED') {
          sumVerified += p.amount;
        }
      }

      const totalSellingPrice = txBooking.totalSellingPrice || txBooking.totalAmount || 0;
      const amountReceived = sumVerified;
      const amountPending = Math.max(0, totalSellingPrice - amountReceived);

      let newPaymentStatus: PaymentStatus = 'UNPAID';
      if (amountReceived >= totalSellingPrice && totalSellingPrice > 0) {
        newPaymentStatus = 'PAID';
      } else if (amountReceived > 0) {
        newPaymentStatus = 'PARTIALLY_PAID';
      }

      const isOverpaid = amountReceived > totalSellingPrice;
      const overpaidAmount = isOverpaid ? amountReceived - totalSellingPrice : 0;

      // Update payment to VOIDED
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'VOIDED',
        voidedBy: actor.id,
        voidedByName: actor.name,
        voidedByRole: actor.role,
        voidedAt: now,
        voidReason: trimmedReason,
        updatedAt: now,
      };
      tx.updatePayment(paymentId, paymentUpdates);

      // Update booking aggregates (do NOT downgrade booking.status)
      const bookingUpdates: Partial<Booking> = {
        amountReceived,
        amountPending,
        paymentStatus: newPaymentStatus,
        isOverpaid,
        overpaidAmount,
        updatedAt: now,
      };
      tx.updateBooking(bookingId, bookingUpdates);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.uid || actor.id,
        actorName: `${actor.name} (${actor.role})`,
        action: 'PAYMENT_VOIDED',
        entityType: 'PAYMENT',
        entityId: paymentId,
        before: {
          status: payment.status,
          amountReceived: txBooking.amountReceived,
          paymentStatus: txBooking.paymentStatus,
        },
        after: {
          bookingId,
          amountVoided: payment.amount,
          previousStatus: payment.status,
          newStatus: 'VOIDED',
          voidReason: trimmedReason,
          resultingAmountReceived: amountReceived,
          resultingAmountPending: amountPending,
          resultingPaymentStatus: newPaymentStatus,
        },
        reason: trimmedReason,
      };
      tx.setAuditLog(auditLog.id, auditLog);

      const updatedPayment: PaymentRecord = { ...payment, ...paymentUpdates };
      const updatedBooking: Booking = { ...txBooking, ...bookingUpdates };

      return {
        success: true,
        payment: updatedPayment,
        booking: updatedBooking,
        message: 'Payment voided successfully and aggregates updated.',
      };
    });
  }
}

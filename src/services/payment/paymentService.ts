// =====================================================
// PAYMENT SERVICE & ENGINE — CORE DOMAIN LOGIC
// Phase 2B-5D Stage 5 for Booking Bridge OS
// Document Version: 2.1.0
// =====================================================

import { UserRole, AuditLog } from '../../types';
import { Booking, PaymentStatus } from '../../types/booking';
import {
  PaymentRecord,
  PaymentMethod,
  PaymentType,
} from '../../types/payment';
import {
  PaymentStorageProvider,
  PaymentTransaction,
  FirestorePaymentStorageProvider,
} from './paymentStorageProvider';
import { authorizeResource } from '../../../server/authorization/policyEngine';
import { bookingResourceContext } from '../../../server/authorization/resourceContext';
import type { AuthorizationAction, AuthorizationPrincipal } from '../../../server/authorization/policyTypes';

export interface PaymentActor extends AuthorizationPrincipal {
  /** Legacy compatibility alias; never use for ownership authorization. */
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
  receipt: VerifiedPaymentReceipt;
  message: string;
}

export interface VerifiedPaymentReceipt {
  bookingId: string;
  bookingReference: string;
  customerId: string;
  customerName?: string;
  paymentId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  cumulativeVerifiedAmount: number;
  remainingBalance: number;
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

function paymentPolicyAction(
  actor: PaymentActor,
  action: 'READ' | 'RECORD' | 'VERIFY' | 'REJECT' | 'VOID',
): AuthorizationAction {
  if (action === 'RECORD') return 'RECORD_PAYMENT';
  if (action === 'VERIFY' || action === 'REJECT') return 'VERIFY_PAYMENT';
  if (action === 'VOID') return 'VOID_PAYMENT';
  return actor.role === 'Operations' ? 'READ_OPERATIONAL' : 'READ_FINANCIALS';
}

function buildVerifiedPaymentReceipt(
  payment: PaymentRecord,
  booking: Booking,
): VerifiedPaymentReceipt {
  return {
    bookingId: booking.id,
    bookingReference: booking.bookingReference,
    customerId: booking.customerId,
    ...(booking.customerName ? { customerName: booking.customerName } : {}),
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency || booking.currency || 'INR',
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    referenceNumber: payment.referenceNumber,
    cumulativeVerifiedAmount: booking.amountReceived,
    remainingBalance: booking.amountPending,
  };
}

function isValidIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function authoritativeMinorUnits(
  value: unknown,
  allowZero: boolean,
  code: string,
  label: string,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    (allowZero ? value < 0 : value <= 0)
  ) {
    throw new PaymentError(422, code, `${label} must be a finite ${allowZero ? 'non-negative' : 'positive'} amount.`);
  }
  const scaled = value * 100;
  const minorUnits = Math.round(scaled);
  if (!Number.isSafeInteger(minorUnits) || Math.abs(scaled - minorUnits) > 1e-8) {
    throw new PaymentError(422, code, `${label} must be a safe amount with no more than two decimal places.`);
  }
  return minorUnits;
}

/**
 * Authoritative Booking-Level Payment Access Control Guard.
 * Enforces ownership, scoping, and role boundaries:
 * - Marketing: universally denied (403)
 * - Operations: read-only for assigned bookings (403 if unassigned or mutation attempted)
 * - Sales Executive: assigned bookings only (403 if unassigned or verification/void attempted)
 * - Sales Manager: immutable sales-team scope (403 for another team or mutation beyond recording)
 * - Accounts: enterprise-wide read, record, verify, reject (403 if void attempted)
 * - Founder / Admin: enterprise-wide access including voiding
 */
export function assertBookingPaymentAccess(
  actor: PaymentActor,
  booking: Booking,
  action: 'READ' | 'RECORD' | 'VERIFY' | 'REJECT' | 'VOID'
): void {
  const decision = authorizeResource(
    actor,
    'BOOKING',
    paymentPolicyAction(actor, action),
    bookingResourceContext(booking),
  );
  if (!decision.allowed) {
    throw new PaymentError(403, 'FORBIDDEN', decision.reason, {
      authorizationCode: decision.code,
      scope: decision.scope,
    });
  }
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
    if (!bookingId) {
      throw new PaymentError(400, 'BAD_REQUEST', 'Booking ID is required.');
    }
    if (!dto || typeof dto !== 'object' || Array.isArray(dto)) {
      throw new PaymentError(400, 'INVALID_PAYMENT_PAYLOAD', 'Payment payload must be an object.');
    }

    // Amount validation
    if (typeof dto.amount !== 'number' || !Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new PaymentError(400, 'INVALID_AMOUNT', 'Payment amount must be a positive number greater than 0.');
    }
    // Max 2 decimal places validation
    const requestedMinorUnits = Math.round(dto.amount * 100);
    if (
      !Number.isSafeInteger(requestedMinorUnits) ||
      Math.abs((dto.amount * 100) - requestedMinorUnits) > 1e-8
    ) {
      throw new PaymentError(400, 'INVALID_AMOUNT_PRECISION', 'Payment amount cannot exceed 2 decimal places.');
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
    if (!/^[A-Z0-9][A-Z0-9 ._:/#()-]{0,99}$/.test(normalizedRef)) {
      throw new PaymentError(
        400,
        'INVALID_REFERENCE_NUMBER',
        'Reference number must be 1-100 characters and contain only supported reference characters.'
      );
    }

    // Payment date validation
    if (!isValidIsoCalendarDate(dto.paymentDate)) {
      throw new PaymentError(400, 'INVALID_PAYMENT_DATE', 'Payment date must be in valid ISO YYYY-MM-DD format.');
    }
    if (dto.notes !== undefined && (typeof dto.notes !== 'string' || dto.notes.length > 2000)) {
      throw new PaymentError(400, 'INVALID_NOTES', 'Payment notes must be a string of at most 2000 characters.');
    }
    if (
      dto.idempotencyKey !== undefined &&
      (typeof dto.idempotencyKey !== 'string' || !dto.idempotencyKey.trim() || dto.idempotencyKey.length > 128)
    ) {
      throw new PaymentError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 1-128 characters.');
    }
    const normalizedIdempotencyKey = dto.idempotencyKey?.trim();

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const booking = await tx.getBooking(bookingId);
      if (!booking) {
        throw new PaymentError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
      }
      assertBookingPaymentAccess(actor, booking, 'RECORD');
      if (booking.status === 'CANCELLED') {
        throw new PaymentError(422, 'BOOKING_CANCELLED', 'Cannot record payment on a cancelled booking.');
      }

      const storedBookingCurrency = booking.currency ?? 'INR';
      if (typeof storedBookingCurrency !== 'string' || !/^[A-Za-z]{3}$/.test(storedBookingCurrency)) {
        throw new PaymentError(422, 'INVALID_BOOKING_CURRENCY', 'Booking currency must be a three-letter ISO code.');
      }
      const bookingCurrency = storedBookingCurrency.toUpperCase();
      if (dto.currency !== undefined && typeof dto.currency !== 'string') {
        throw new PaymentError(400, 'INVALID_CURRENCY', 'Payment currency must be a three-letter ISO code.');
      }
      const paymentCurrency = (dto.currency || bookingCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(paymentCurrency)) {
        throw new PaymentError(400, 'INVALID_CURRENCY', 'Payment currency must be a three-letter ISO code.');
      }
      if (paymentCurrency !== bookingCurrency) {
        throw new PaymentError(
          422,
          'CURRENCY_MISMATCH',
          `Payment currency "${paymentCurrency}" does not match booking currency "${bookingCurrency}".`
        );
      }

      // Existing payments for duplicate and idempotency check
      const existingPayments = await tx.getPaymentsForBooking(bookingId);

      // Idempotency Key check
      if (normalizedIdempotencyKey) {
        const matchKey = existingPayments.find((p) => p.idempotencyKey === normalizedIdempotencyKey);
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
              `Idempotency key "${normalizedIdempotencyKey}" has already been used with different payment parameters.`
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
        recordedByEmployeeId: actor.employeeId,
        recordedBy: actor.employeeId,
        recordedByName: actor.name,
        recordedByRole: actor.role,
        recordedAt: now,
        idempotencyKey: normalizedIdempotencyKey,
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
        actorId: actor.employeeId,
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
    if (!bookingId || !paymentId) {
      throw new PaymentError(400, 'BAD_REQUEST', 'Booking ID and payment ID are required.');
    }

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const txBooking = await tx.getBooking(bookingId);
      const payment = await tx.getPayment(paymentId);

      if (!txBooking) {
        throw new PaymentError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
      }
      assertBookingPaymentAccess(actor, txBooking, 'VERIFY');
      if (txBooking.status === 'CANCELLED') {
        throw new PaymentError(422, 'BOOKING_CANCELLED', 'Cannot verify payment on a cancelled booking.');
      }

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
          receipt: buildVerifiedPaymentReceipt(payment, txBooking),
          message: 'Payment has already been verified.',
        };
      }

      // State machine validation: only the pending-verification state is valid.
      if (payment.status !== 'RECORDED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          `Cannot verify a payment in ${payment.status} state.`
        );
      }

      // Anti-Self-Verification guard
      if ((payment.recordedByEmployeeId || payment.recordedBy) === actor.employeeId) {
        throw new PaymentError(
          403,
          'SELF_VERIFICATION_BLOCKED',
          'Self-verification is prohibited. The actor who recorded the payment cannot verify it.'
        );
      }

      const now = new Date().toISOString();
      const allPayments = await tx.getPaymentsForBooking(bookingId);

      // Recalculate verified sum
      let verifiedMinorUnits = 0;
      for (const p of allPayments) {
        if (p.id === paymentId || p.status === 'VERIFIED') {
          verifiedMinorUnits += authoritativeMinorUnits(
            p.amount,
            false,
            'INVALID_PAYMENT_LEDGER',
            `Payment ${p.id}`,
          );
          if (!Number.isSafeInteger(verifiedMinorUnits)) {
            throw new PaymentError(422, 'INVALID_PAYMENT_LEDGER', 'Verified payment total exceeds the supported safe range.');
          }
        }
      }

      const totalSellingPrice = txBooking.totalSellingPrice ?? txBooking.totalAmount;
      const totalSellingMinorUnits = authoritativeMinorUnits(
        totalSellingPrice,
        true,
        'INVALID_BOOKING_TOTAL',
        'Booking total selling price',
      );
      const amountReceived = verifiedMinorUnits / 100;
      const amountPending = Math.max(0, totalSellingMinorUnits - verifiedMinorUnits) / 100;

      let newPaymentStatus: PaymentStatus = 'UNPAID';
      if (verifiedMinorUnits >= totalSellingMinorUnits && totalSellingMinorUnits > 0) {
        newPaymentStatus = 'PAID';
      } else if (amountReceived > 0) {
        newPaymentStatus = 'PARTIALLY_PAID';
      }

      const isOverpaid = verifiedMinorUnits > totalSellingMinorUnits;
      const overpaidAmount = isOverpaid ? (verifiedMinorUnits - totalSellingMinorUnits) / 100 : 0;

      // Update payment
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'VERIFIED',
        verifiedByEmployeeId: actor.employeeId,
        verifiedBy: actor.employeeId,
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
      const confirmsBooking = txBooking.status === 'PENDING_PAYMENT' && amountReceived > 0;
      if (confirmsBooking) {
        bookingUpdates.status = 'CONFIRMED';
      }

      tx.updateBooking(bookingId, bookingUpdates);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
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

      if (confirmsBooking) {
        const confirmationAudit: AuditLog = {
          id: `${auditLog.id}-CONFIRM`,
          timestamp: now,
          actorType: 'HUMAN',
          actorId: actor.employeeId,
          actorName: `${actor.name} (${actor.role})`,
          action: 'BOOKING_CONFIRMED_FROM_PAYMENT',
          entityType: 'BOOKING',
          entityId: bookingId,
          before: {
            status: txBooking.status,
            amountReceived: txBooking.amountReceived,
            paymentStatus: txBooking.paymentStatus,
          },
          after: {
            status: 'CONFIRMED',
            triggeringPaymentId: paymentId,
            amountReceived,
            amountPending,
            paymentStatus: newPaymentStatus,
          },
          reason: `Booking ${txBooking.bookingReference} confirmed from verified customer payment ${paymentId}`,
        };
        tx.setAuditLog(confirmationAudit.id, confirmationAudit);
      }

      const updatedPayment: PaymentRecord = { ...payment, ...paymentUpdates };
      const updatedBooking: Booking = { ...txBooking, ...bookingUpdates };

      return {
        success: true,
        payment: updatedPayment,
        booking: updatedBooking,
        receipt: buildVerifiedPaymentReceipt(updatedPayment, updatedBooking),
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
    if (!bookingId || !paymentId) {
      throw new PaymentError(400, 'BAD_REQUEST', 'Booking ID and payment ID are required.');
    }

    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 5) {
      throw new PaymentError(
        400,
        'INVALID_REJECTION_REASON',
        'Rejection reason is required and must be at least 5 characters.'
      );
    }

    const trimmedReason = rejectionReason.trim();

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const booking = await tx.getBooking(bookingId);
      const payment = await tx.getPayment(paymentId);

      if (!booking) {
        throw new PaymentError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
      }
      assertBookingPaymentAccess(actor, booking, 'REJECT');

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

      // State machine validation: only the pending-verification state is valid.
      if (payment.status !== 'RECORDED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          `Cannot reject a payment in ${payment.status} state.`
        );
      }

      const now = new Date().toISOString();
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'REJECTED',
        rejectedByEmployeeId: actor.employeeId,
        rejectedByName: actor.name,
        rejectedByRole: actor.role,
        rejectedAt: now,
        rejectionReason: trimmedReason,
        updatedAt: now,
      };

      tx.updatePayment(paymentId, paymentUpdates);

      // Immutable Audit Log
      const auditLog: AuditLog = {
        id: generateAuditLogId(),
        timestamp: now,
        actorType: 'HUMAN',
        actorId: actor.employeeId,
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
    if (!bookingId || !paymentId) {
      throw new PaymentError(400, 'BAD_REQUEST', 'Booking ID and payment ID are required.');
    }

    if (!voidReason || typeof voidReason !== 'string' || voidReason.trim().length < 5) {
      throw new PaymentError(
        400,
        'INVALID_VOID_REASON',
        'Void reason is required and must be at least 5 characters.'
      );
    }

    const trimmedReason = voidReason.trim();

    return this.storageProvider.runTransaction(async (tx: PaymentTransaction) => {
      const txBooking = await tx.getBooking(bookingId);
      const payment = await tx.getPayment(paymentId);

      if (!txBooking) {
        throw new PaymentError(404, 'BOOKING_NOT_FOUND', `Booking with ID "${bookingId}" not found.`);
      }
      assertBookingPaymentAccess(actor, txBooking, 'VOID');

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

      // State machine validation: only verified financial history can be voided.
      if (payment.status !== 'VERIFIED') {
        throw new PaymentError(
          422,
          'INVALID_STATE_TRANSITION',
          `Cannot void a payment in ${payment.status} state.`
        );
      }

      const now = new Date().toISOString();
      const allPayments = await tx.getPaymentsForBooking(bookingId);

      // Recalculate remaining verified sum EXCLUDING this payment
      let verifiedMinorUnits = 0;
      for (const p of allPayments) {
        if (p.id !== paymentId && p.status === 'VERIFIED') {
          verifiedMinorUnits += authoritativeMinorUnits(
            p.amount,
            false,
            'INVALID_PAYMENT_LEDGER',
            `Payment ${p.id}`,
          );
          if (!Number.isSafeInteger(verifiedMinorUnits)) {
            throw new PaymentError(422, 'INVALID_PAYMENT_LEDGER', 'Verified payment total exceeds the supported safe range.');
          }
        }
      }

      const totalSellingPrice = txBooking.totalSellingPrice ?? txBooking.totalAmount;
      const totalSellingMinorUnits = authoritativeMinorUnits(
        totalSellingPrice,
        true,
        'INVALID_BOOKING_TOTAL',
        'Booking total selling price',
      );
      const amountReceived = verifiedMinorUnits / 100;
      const amountPending = Math.max(0, totalSellingMinorUnits - verifiedMinorUnits) / 100;

      let newPaymentStatus: PaymentStatus = 'UNPAID';
      if (verifiedMinorUnits >= totalSellingMinorUnits && totalSellingMinorUnits > 0) {
        newPaymentStatus = 'PAID';
      } else if (amountReceived > 0) {
        newPaymentStatus = 'PARTIALLY_PAID';
      }

      const isOverpaid = verifiedMinorUnits > totalSellingMinorUnits;
      const overpaidAmount = isOverpaid ? (verifiedMinorUnits - totalSellingMinorUnits) / 100 : 0;

      // Update payment to VOIDED
      const paymentUpdates: Partial<PaymentRecord> = {
        status: 'VOIDED',
        voidedByEmployeeId: actor.employeeId,
        voidedBy: actor.employeeId,
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
        actorId: actor.employeeId,
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

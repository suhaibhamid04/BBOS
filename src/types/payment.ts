// =====================================================
// PAYMENT RECORD & LIFECYCLE — TYPE SYSTEM
// Phase 2B-5D Stage 5 for Booking Bridge OS
// Document Version: 2.1.0
// =====================================================

import { UserRole } from './index';

export type PaymentMethod =
  | 'BANK_TRANSFER'
  | 'UPI'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CASH'
  | 'CHEQUE'
  | 'OTHER';

export type PaymentType =
  | 'ADVANCE'
  | 'PARTIAL'
  | 'FINAL_BALANCE'
  | 'SECURITY_DEPOSIT';

export type PaymentRecordStatus =
  | 'RECORDED'
  | 'VERIFIED'
  | 'REJECTED'
  | 'VOIDED';

/**
 * Authoritative Minimal Payment Record (Phase 2B-5D Stage 5)
 * Stored at: payments/{paymentId}
 * 
 * Strict lifecycle & role boundaries:
 * - Sales Executive (assigned) / Sales Manager / Accounts / Admin / Founder can record payments ('RECORDED').
 * - Accounts, Admin, Founder ONLY can verify payments ('VERIFIED') or reject ('REJECTED').
 * - Anti-Self-Verification: Verifier cannot equal recorder.
 * - Admin, Founder ONLY can void verified payments ('VOIDED').
 * - Top-level booking aggregates are strictly recomputed server-side upon verification and voiding.
 * - STRICT INVARIANT: ZERO supplier buy costs or gross profit/margin fields.
 */
export interface PaymentRecord {
  id: string;
  bookingId: string;
  bookingReference?: string;
  customerId: string;
  customerName?: string;

  // Commercial / Payment Data
  amount: number;                    // Must be > 0, max 2 decimal places
  currency?: string;                 // ISO currency code (defaults to 'INR')
  paymentDate: string;               // ISO Date YYYY-MM-DD
  paymentMethod: PaymentMethod;
  referenceNumber: string;           // UTR / IMPS / Cheque number / Cash receipt
  paymentType: PaymentType;
  notes?: string;

  // State Machine Status
  status: PaymentRecordStatus;

  // Recording Metadata
  /** Canonical stable BBOS employee identity. Required on all new server writes. */
  recordedByEmployeeId?: string;
  /** Legacy compatibility alias. New records mirror recordedByEmployeeId here. */
  recordedBy: string;
  recordedByName?: string;
  recordedByRole?: UserRole | string;
  recordedAt?: string;               // ISO timestamp

  // Verification Metadata (Accounts, Admin, Founder ONLY)
  /** Canonical stable BBOS employee identity. */
  verifiedByEmployeeId?: string;
  /** Legacy compatibility alias. */
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedByRole?: UserRole | string;
  verifiedAt?: string;               // ISO timestamp

  // Rejection Metadata (Accounts, Admin, Founder ONLY)
  rejectedByEmployeeId?: string;
  rejectedByName?: string;
  rejectedByRole?: UserRole | string;
  rejectedAt?: string;
  rejectionReason?: string;          // Mandatory when status === 'REJECTED'

  // Voiding Metadata (Admin, Founder ONLY)
  /** Canonical stable BBOS employee identity. */
  voidedByEmployeeId?: string;
  /** Legacy compatibility alias. */
  voidedBy?: string;
  voidedByName?: string;
  voidedByRole?: UserRole | string;
  voidedAt?: string;                 // ISO timestamp
  voidReason?: string;               // Mandatory when status === 'VOIDED'

  // Deduplication & Tracing
  idempotencyKey?: string;
  schemaVersion?: '2B-5';

  // Timestamps & Flags
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

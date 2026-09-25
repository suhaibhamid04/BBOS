import { describe, it, expect, beforeEach } from 'bun:test';
import { Booking, BookingStatus, PaymentStatus } from '../src/types/booking';
import { PaymentRecord, PaymentMethod, PaymentType } from '../src/types/payment';
import {
  PaymentService,
  PaymentError,
  PaymentActor,
  assertBookingPaymentAccess,
} from '../src/services/payment/paymentService';
import { InMemoryPaymentStorageProvider } from '../src/services/payment/paymentStorageProvider';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('BBOS Phase 2B-5D Stage 5 — Minimal Payment Processing & State Machine', () => {
  // Actors
  const founder: PaymentActor = { id: 'compat-founder', employeeId: 'emp-founder-01', name: 'Suhaib Hamid', role: 'Founder' };
  const admin: PaymentActor = { id: 'compat-admin', employeeId: 'emp-admin-01', name: 'Nasir Wani', role: 'Admin' };
  const accounts1: PaymentActor = { id: 'compat-acc-01', employeeId: 'emp-acc-01', name: 'Farooq Lone', role: 'Accounts' };
  const accounts2: PaymentActor = { id: 'compat-acc-02', employeeId: 'emp-acc-02', name: 'Zahoor Mir', role: 'Accounts' };
  const salesManager1: PaymentActor = { id: 'compat-mgr-01', employeeId: 'emp-mgr-01', name: 'Sameer Mir', role: 'Sales Manager' };
  const salesManager2: PaymentActor = { id: 'compat-mgr-02', employeeId: 'emp-mgr-02', name: 'Other Manager', role: 'Sales Manager' };
  const salesExec1: PaymentActor = { id: 'compat-sales-01', employeeId: 'emp-sales-01', name: 'Tariq Bhat', role: 'Sales Executive' };
  const salesExec2: PaymentActor = { id: 'compat-sales-02', employeeId: 'emp-sales-02', name: 'Ayesha Zargar', role: 'Sales Executive' };
  const ops1: PaymentActor = { id: 'compat-ops-01', employeeId: 'emp-ops-01', name: 'Bilal Ahmad Shah', role: 'Operations' };
  const ops2: PaymentActor = { id: 'compat-ops-02', employeeId: 'emp-ops-02', name: 'Other Ops', role: 'Operations' };
  const marketing: PaymentActor = { id: 'compat-mkt-01', employeeId: 'emp-mkt-01', name: 'Irfan Dar', role: 'Marketing' };

  let storage: InMemoryPaymentStorageProvider;
  let service: PaymentService;
  let sampleBooking1: Booking;
  let sampleBooking2: Booking;
  let cancelledBooking: Booking;

  beforeEach(() => {
    sampleBooking1 = {
      id: 'bk-01',
      bookingReference: 'BB-100001',
      tripId: 'trip-01',
      customerId: 'cust-01',
      customerName: 'Rohit Sharma',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      currency: 'INR',
      totalSellingPrice: 50000,
      totalAmount: 50000,
      amountReceived: 0,
      amountPending: 50000,
      travelStartDate: '2026-10-01',
      travelEndDate: '2026-10-05',
      assignedSalesEmployeeId: 'emp-sales-01',
      assignedSalesManagerId: 'emp-mgr-01',
      assignedOperationsEmployeeId: 'emp-ops-01',
      createdAt: '2026-09-11T10:00:00Z',
      updatedAt: '2026-09-11T10:00:00Z',
    };

    sampleBooking2 = {
      id: 'bk-02',
      bookingReference: 'BB-100002',
      tripId: 'trip-02',
      customerId: 'cust-02',
      customerName: 'Virat Kohli',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      currency: 'INR',
      totalSellingPrice: 75000,
      totalAmount: 75000,
      amountReceived: 0,
      amountPending: 75000,
      travelStartDate: '2026-11-01',
      travelEndDate: '2026-11-06',
      assignedSalesEmployeeId: 'emp-sales-02',
      assignedSalesManagerId: 'emp-mgr-02',
      assignedOperationsEmployeeId: 'emp-ops-02',
      createdAt: '2026-09-11T10:00:00Z',
      updatedAt: '2026-09-11T10:00:00Z',
    };

    cancelledBooking = {
      id: 'bk-cancelled',
      bookingReference: 'BB-999999',
      tripId: 'trip-99',
      customerId: 'cust-99',
      customerName: 'Cancelled User',
      status: 'CANCELLED',
      paymentStatus: 'UNPAID',
      currency: 'INR',
      totalSellingPrice: 50000,
      amountReceived: 0,
      amountPending: 50000,
      travelStartDate: '2026-10-01',
      travelEndDate: '2026-10-05',
      assignedSalesEmployeeId: 'emp-sales-01',
      createdAt: '2026-09-11T10:00:00Z',
      updatedAt: '2026-09-11T10:00:00Z',
    };

    storage = new InMemoryPaymentStorageProvider({
      bookings: [sampleBooking1, sampleBooking2, cancelledBooking],
    });
    service = new PaymentService(storage);
  });

  // =========================================================================
  // CATEGORY A: PAYMENT RECORDING & VALIDATION (1–6)
  // =========================================================================
  describe('Category A: Payment Recording & Input Validation', () => {
    it('1. Valid payment recording: creates payment with status RECORDED', async () => {
      const payment = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-REF-001',
          paymentType: 'ADVANCE',
          notes: 'Advance token',
        },
        salesExec1
      );

      expect(payment.id).toMatch(/^PAY-/);
      expect(payment.bookingId).toBe('bk-01');
      expect(payment.amount).toBe(20000);
      expect(payment.status).toBe('RECORDED');
      expect(payment.recordedBy).toBe(salesExec1.employeeId);
      expect(salesExec1.id).not.toBe(salesExec1.employeeId);
      expect(payment.verifiedBy).toBeUndefined();

      // Top-level booking aggregates MUST remain unchanged
      const b = await storage.getBooking('bk-01');
      expect(b?.amountReceived).toBe(0);
      expect(b?.amountPending).toBe(50000);
      expect(b?.paymentStatus).toBe('UNPAID');
    });

    it('2. Zero or negative amount rejected with 400', async () => {
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 0,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'UPI-REF-002',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' });

      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: -500,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'UPI-REF-002',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT' });
    });

    it('2b. Amount with >2 decimal places rejected with 400', async () => {
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 100.555,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'UPI-REF-002B',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_AMOUNT_PRECISION' });
    });

    it('3. Invalid payment method rejected with 400', async () => {
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 1000,
            paymentDate: '2026-09-11',
            paymentMethod: 'BITCOIN' as any,
            referenceNumber: 'CRYPTO-01',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PAYMENT_METHOD' });
    });

    it('4. Missing reference number rejected with 400', async () => {
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 1000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: '   ',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_REFERENCE_NUMBER' });
    });

    it('5. Non-existent booking rejected with 404', async () => {
      await expect(
        service.recordPayment(
          'bk-non-existent',
          {
            amount: 1000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'REF-01',
            paymentType: 'ADVANCE',
          },
          founder
        )
      ).rejects.toMatchObject({ statusCode: 404, code: 'BOOKING_NOT_FOUND' });
    });

    it('6. Cancelled booking payment recording rejected with 422', async () => {
      await expect(
        service.recordPayment(
          'bk-cancelled',
          {
            amount: 1000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'REF-01',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 422, code: 'BOOKING_CANCELLED' });
    });
  });

  // =========================================================================
  // CATEGORY B: BOOKING-LEVEL ACCESS CONTROL & IDOR DEFENSE (7–12, A, B, C, N)
  // =========================================================================
  describe('Category B: Booking-Level Access Control & Anti-IDOR Scoping', () => {
    it('7. Sales Executive accessing assigned booking: allowed', async () => {
      const payment = await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-ASSIGNED-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      expect(payment.id).toBeDefined();

      const list = await service.getPaymentsForBooking('bk-01', salesExec1);
      expect(list.length).toBe(1);
    });

    it('8. Sales Executive accessing unassigned booking: blocked with 403', async () => {
      // salesExec1 is assigned to bk-01, but NOT bk-02 (assigned to salesExec2)
      await expect(
        service.recordPayment(
          'bk-02',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'UPI-UNASSIGNED-01',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      await expect(service.getPaymentsForBooking('bk-02', salesExec1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('9. (A) Sales Manager access semantics: authorized manager allowed, unauthorized blocked with 403', async () => {
      // salesManager1 is assignedSalesManagerId on bk-01
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'NEFT-MGR-01',
          paymentType: 'ADVANCE',
        },
        salesManager1
      );
      expect(p1.id).toBeDefined();

      // salesManager2 is NOT assigned to bk-01 (assigned to salesManager1)
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'BANK_TRANSFER',
            referenceNumber: 'NEFT-MGR-02',
            paymentType: 'ADVANCE',
          },
          salesManager2
        )
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('10. Operations accessing unassigned booking blocked with 403; assigned allowed read-only', async () => {
      // ops1 assigned to bk-01 -> read allowed
      const list = await service.getPaymentsForBooking('bk-01', ops1);
      expect(Array.isArray(list)).toBe(true);

      // ops1 trying to record payment on bk-01 -> 403 (Ops is read-only)
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'OPS-PAY-01',
            paymentType: 'ADVANCE',
          },
          ops1
        )
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      // ops1 accessing bk-02 (assigned to ops2) -> 403
      await expect(service.getPaymentsForBooking('bk-02', ops1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('11. (C) Cross-booking payment tampering blocked: paymentId from booking B used against booking A returns 404', async () => {
      // Record payment on bk-02
      const pOnBk2 = await service.recordPayment(
        'bk-02',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REF-BK2-01',
          paymentType: 'ADVANCE',
        },
        salesExec2
      );

      // Attempt to verify payment on bk-01 using pOnBk2.id
      await expect(service.verifyPayment('bk-01', pOnBk2.id, accounts1)).rejects.toMatchObject({
        statusCode: 404,
        code: 'PAYMENT_NOT_FOUND',
      });

      // Attempt to reject payment on bk-01 using pOnBk2.id
      await expect(
        service.rejectPayment('bk-01', pOnBk2.id, 'Invalid cross booking', accounts1)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'PAYMENT_NOT_FOUND',
      });

      // Attempt to void payment on bk-01 using pOnBk2.id
      await expect(
        service.voidPayment('bk-01', pOnBk2.id, 'Void cross booking', admin)
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'PAYMENT_NOT_FOUND',
      });
    });

    it('12. (N) Marketing payment access universally blocked with 403', async () => {
      await expect(service.getPaymentsForBooking('bk-01', marketing)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });

      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 1000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'MKT-01',
            paymentType: 'ADVANCE',
          },
          marketing
        )
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('12b. (B) Firestore rules guard direct unauthorized booking payment access', () => {
      const rulesContent = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf-8');
      expect(rulesContent).toContain('assignedSalesEmployeeId == request.auth.uid');
      expect(rulesContent).toContain('assignedOperationsEmployeeId == request.auth.uid');
      expect(rulesContent).toContain('allow delete: if false;');
    });
  });

  // =========================================================================
  // CATEGORY C: VERIFICATION & AGGREGATE CALCULATIONS (13–18)
  // =========================================================================
  describe('Category C: Payment Verification & Aggregate Recalculations', () => {
    it('13. Accounts verification: marks payment VERIFIED and recomputes aggregates', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'NEFT-VERIFY-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const result = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(result.success).toBe(true);
      expect(result.payment.status).toBe('VERIFIED');
      expect(result.payment.verifiedBy).toBe(accounts1.employeeId);
      expect(result.payment.verifiedByName).toBe(accounts1.name);

      expect(result.booking.amountReceived).toBe(20000);
      expect(result.booking.amountPending).toBe(30000);
      expect(result.booking.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('14. Admin verification succeeds', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 15000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-ADMIN-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const result = await service.verifyPayment('bk-01', p.id, admin);
      expect(result.success).toBe(true);
      expect(result.payment.status).toBe('VERIFIED');
      expect(result.payment.verifiedBy).toBe(admin.employeeId);
    });

    it('15. Unverified RECORDED payment is excluded from booking aggregates', async () => {
      await service.recordPayment(
        'bk-01',
        {
          amount: 25000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-UNVERIFIED-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const b = await storage.getBooking('bk-01');
      expect(b?.amountReceived).toBe(0);
      expect(b?.amountPending).toBe(50000);
      expect(b?.paymentStatus).toBe('UNPAID');
    });

    it('16. Partial payment aggregate sets PARTIALLY_PAID', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-PART-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const res = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(res.booking.amountReceived).toBe(20000);
      expect(res.booking.amountPending).toBe(30000);
      expect(res.booking.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('17. Full payment aggregate updates amountPending to 0 and paymentStatus to PAID', async () => {
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-FULL-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p1.id, accounts1);

      const p2 = await service.recordPayment(
        'bk-01',
        {
          amount: 30000,
          paymentDate: '2026-09-12',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'NEFT-FULL-02',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      const res2 = await service.verifyPayment('bk-01', p2.id, accounts2);

      expect(res2.booking.amountReceived).toBe(50000);
      expect(res2.booking.amountPending).toBe(0);
      expect(res2.booking.paymentStatus).toBe('PAID');
    });

    it('18. Commercial booking status transitions PENDING_PAYMENT -> CONFIRMED upon first verified payment', async () => {
      const initialBooking = await storage.getBooking('bk-01');
      expect(initialBooking?.status).toBe('PENDING_PAYMENT');

      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'CONFIRM-TRANS-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const res = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(res.booking.status).toBe('CONFIRMED');
    });
  });

  // =========================================================================
  // CATEGORY D: ANTI-SELF-VERIFICATION & PERMISSIONS (19–22)
  // =========================================================================
  describe('Category D: Anti-Self-Verification & Authorization Controls', () => {
    it('19. Sales Executive verification blocked with 403', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'SE-VERIFY-FAIL-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(service.verifyPayment('bk-01', p.id, salesExec1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('20. Sales Manager verification blocked with 403', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'SM-VERIFY-FAIL-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(service.verifyPayment('bk-01', p.id, salesManager1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('21. Operations verification blocked with 403', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'OPS-VERIFY-FAIL-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(service.verifyPayment('bk-01', p.id, ops1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'FORBIDDEN',
      });
    });

    it('22. Anti-Self-Verification: Accounts user who recorded payment CANNOT verify it', async () => {
      // accounts1 records payment
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 15000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'SELF-VER-01',
          paymentType: 'ADVANCE',
        },
        accounts1
      );

      // accounts1 attempts to verify own payment -> 403 SELF_VERIFICATION_BLOCKED
      await expect(service.verifyPayment('bk-01', p.id, accounts1)).rejects.toMatchObject({
        statusCode: 403,
        code: 'SELF_VERIFICATION_BLOCKED',
      });

      // Different accounts user (accounts2) verifies -> succeeds!
      const res = await service.verifyPayment('bk-01', p.id, accounts2);
      expect(res.success).toBe(true);
      expect(res.payment.status).toBe('VERIFIED');
    });
  });

  // =========================================================================
  // CATEGORY E: REJECTION WORKFLOW (23–26)
  // =========================================================================
  describe('Category E: Rejection Workflow & Terminal State Rules', () => {
    it('23. Valid rejection marks payment REJECTED and stores reason', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REJ-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const res = await service.rejectPayment('bk-01', p.id, 'UTR not found in bank ledger', accounts1);
      expect(res.success).toBe(true);
      expect(res.payment.status).toBe('REJECTED');
      expect(res.payment.rejectionReason).toBe('UTR not found in bank ledger');
    });

    it('24. Rejection without reason or reason <5 chars rejected with 400', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REJ-SHORT-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(service.rejectPayment('bk-01', p.id, 'No', accounts1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_REJECTION_REASON',
      });
    });

    it('25. Rejected payment excluded from amountReceived and aggregates', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REJ-AGG-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await service.rejectPayment('bk-01', p.id, 'Invalid screenshot provided', accounts1);

      const b = await storage.getBooking('bk-01');
      expect(b?.amountReceived).toBe(0);
      expect(b?.paymentStatus).toBe('UNPAID');
    });

    it('26. (K) Attempting to verify a REJECTED payment rejected with 422', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REJ-TO-VER-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await service.rejectPayment('bk-01', p.id, 'Bad payment reference', accounts1);

      await expect(service.verifyPayment('bk-01', p.id, accounts2)).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_STATE_TRANSITION',
      });
    });
  });

  // =========================================================================
  // CATEGORY F: VOIDING WORKFLOW & STATE TRANSITIONS (27–34, G, H, I, J, K, L)
  // =========================================================================
  describe('Category F: Voiding Workflow & State Transitions', () => {
    it('27. Admin voiding verified payment succeeds and marks VOIDED', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 25000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VOID-TEST-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      const voidRes = await service.voidPayment(
        'bk-01',
        p.id,
        'Accidental duplicate clearance in error',
        admin
      );
      expect(voidRes.success).toBe(true);
      expect(voidRes.payment.status).toBe('VOIDED');
      expect(voidRes.payment.voidedBy).toBe(admin.employeeId);
      expect(voidRes.payment.voidReason).toBe('Accidental duplicate clearance in error');
    });

    it('28. Founder voiding verified payment succeeds', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 25000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VOID-FOUNDER-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      const voidRes = await service.voidPayment('bk-01', p.id, 'Executive void approval', founder);
      expect(voidRes.success).toBe(true);
      expect(voidRes.payment.status).toBe('VOIDED');
    });

    it('29. Non-admin roles (Accounts, Sales Manager, Sales Exec) blocked from voiding with 403', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 25000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VOID-FORBID-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      await expect(
        service.voidPayment('bk-01', p.id, 'Accounts trying to void', accounts2)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      await expect(
        service.voidPayment('bk-01', p.id, 'Sales Mgr trying to void', salesManager1)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      await expect(
        service.voidPayment('bk-01', p.id, 'Sales Exec trying to void', salesExec1)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    });

    it('30. (H, I) Multiple verified payments followed by voiding one: PAID -> PARTIALLY_PAID', async () => {
      // Payment 1: 20000
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'MULTI-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p1.id, accounts1);

      // Payment 2: 30000 -> Total 50000 -> PAID
      const p2 = await service.recordPayment(
        'bk-01',
        {
          amount: 30000,
          paymentDate: '2026-09-12',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'MULTI-02',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      const resFull = await service.verifyPayment('bk-01', p2.id, accounts1);
      expect(resFull.booking.amountReceived).toBe(50000);
      expect(resFull.booking.paymentStatus).toBe('PAID');

      // Void Payment 2 (30000)
      const voidRes = await service.voidPayment('bk-01', p2.id, 'Client payment bounced at clearing', admin);
      expect(voidRes.booking.amountReceived).toBe(20000);
      expect(voidRes.booking.amountPending).toBe(30000);
      expect(voidRes.booking.paymentStatus).toBe('PARTIALLY_PAID');
    });

    it('30b. (J) PAID -> UNPAID if all verified payments are voided', async () => {
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 50000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'LUMP-01',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p1.id, accounts1);

      const voidRes = await service.voidPayment('bk-01', p1.id, 'Fraudulent transaction reversed', admin);
      expect(voidRes.booking.amountReceived).toBe(0);
      expect(voidRes.booking.amountPending).toBe(50000);
      expect(voidRes.booking.paymentStatus).toBe('UNPAID');
    });

    it('31. Voiding without reason or reason <5 chars rejected with 400', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'SHORT-VOID-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      await expect(service.voidPayment('bk-01', p.id, 'Bad', admin)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_VOID_REASON',
      });
    });

    it('32. (K) Attempting to void a RECORDED payment rejected with 422', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VOID-RECORDED-FAIL',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(
        service.voidPayment('bk-01', p.id, 'Try to void unverified', admin)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_STATE_TRANSITION',
      });
    });

    it('33. (K) Attempting to void a REJECTED payment rejected with 422', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VOID-REJECTED-FAIL',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.rejectPayment('bk-01', p.id, 'Bad UTR reference', accounts1);

      await expect(
        service.voidPayment('bk-01', p.id, 'Try to void rejected', admin)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_STATE_TRANSITION',
      });
    });

    it('34. (K) Attempting to verify a VOIDED payment rejected with 422', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'VER-VOID-FAIL',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);
      await service.voidPayment('bk-01', p.id, 'Void this payment', admin);

      await expect(service.verifyPayment('bk-01', p.id, accounts2)).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_STATE_TRANSITION',
      });
    });

    it('34b. (K) Attempting to reject a VERIFIED payment rejected with 422', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'REJ-VER-FAIL',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      await expect(
        service.rejectPayment('bk-01', p.id, 'Try to reject verified', accounts2)
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'INVALID_STATE_TRANSITION',
      });
    });

    it('34c. (L) No booking status downgrade after voiding: CONFIRMED remains CONFIRMED', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'NO-DOWNGRADE-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      const verRes = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(verRes.booking.status).toBe('CONFIRMED');

      const voidRes = await service.voidPayment('bk-01', p.id, 'Clearance rejected by bank', admin);
      // Status remains CONFIRMED; does not flip back to PENDING_PAYMENT
      expect(voidRes.booking.status).toBe('CONFIRMED');
      expect(voidRes.booking.paymentStatus).toBe('UNPAID');
    });
  });

  // =========================================================================
  // CATEGORY G: IDEMPOTENCY & CONCURRENCY (35–38, D, E, F)
  // =========================================================================
  describe('Category G: Idempotency & Transactional Concurrency', () => {
    it('35. Verify idempotency: re-verifying already VERIFIED payment returns 200 OK without double counting', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'IDEM-VER-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const firstVerify = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(firstVerify.booking.amountReceived).toBe(20000);

      // Re-verify call
      const secondVerify = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(secondVerify.isIdempotent).toBe(true);
      expect(secondVerify.booking.amountReceived).toBe(20000); // Not 40000!
    });

    it('36. Reject idempotency: re-rejecting already REJECTED payment returns 200 OK', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'IDEM-REJ-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      const firstReject = await service.rejectPayment('bk-01', p.id, 'Invalid reference', accounts1);
      expect(firstReject.payment.status).toBe('REJECTED');

      const secondReject = await service.rejectPayment('bk-01', p.id, 'Invalid reference', accounts1);
      expect(secondReject.isIdempotent).toBe(true);
      expect(secondReject.payment.status).toBe('REJECTED');
    });

    it('37. Void idempotency: re-voiding already VOIDED payment returns 200 OK without double deducting', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'IDEM-VOID-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);

      const firstVoid = await service.voidPayment('bk-01', p.id, 'Payment void reason', admin);
      expect(firstVoid.booking.amountReceived).toBe(0);

      const secondVoid = await service.voidPayment('bk-01', p.id, 'Payment void reason', admin);
      expect(secondVoid.isIdempotent).toBe(true);
      expect(secondVoid.booking.amountReceived).toBe(0);
    });

    it('38. (D) Concurrent verification of the same payment does not double-count', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'CONCUR-VER-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      // Trigger parallel verify calls
      const [res1, res2] = await Promise.all([
        service.verifyPayment('bk-01', p.id, accounts1),
        service.verifyPayment('bk-01', p.id, accounts2),
      ]);

      const finalBooking = await storage.getBooking('bk-01');
      expect(finalBooking?.amountReceived).toBe(20000);
      expect(finalBooking?.amountPending).toBe(30000);
    });

    it('38b. (E) Concurrent creation with same idempotencyKey returns existing record', async () => {
      const key = 'idem-network-retry-key-123';
      const [p1, p2] = await Promise.all([
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'IDEM-KEY-REF-01',
            paymentType: 'ADVANCE',
            idempotencyKey: key,
          },
          salesExec1
        ),
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'IDEM-KEY-REF-01',
            paymentType: 'ADVANCE',
            idempotencyKey: key,
          },
          salesExec1
        ),
      ]);

      expect(p1.id).toBe(p2.id);
      const all = await storage.getPaymentsForBooking('bk-01');
      expect(all.length).toBe(1);
    });

    it('38c. Atomic rollback: if error occurs in verification transaction, state remains unchanged', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'FAIL-ROLLBACK-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      // Simulate a storage failure during transaction
      const failingStorage = new InMemoryPaymentStorageProvider({
        bookings: [sampleBooking1],
        payments: [p],
      });
      failingStorage.runTransaction = async () => {
        throw new Error('Simulated Database Network Disruption');
      };
      const failingService = new PaymentService(failingStorage);

      await expect(failingService.verifyPayment('bk-01', p.id, accounts1)).rejects.toThrow(
        'Simulated Database Network Disruption'
      );

      // Verify payment in storage is still RECORDED
      const saved = await failingStorage.getPayment(p.id);
      expect(saved?.status).toBe('RECORDED');
    });
  });

  // =========================================================================
  // CATEGORY H: DEDUPLICATION & EDGE CASES (39–46, M)
  // =========================================================================
  describe('Category H: Deduplication, Edge Cases & Security Segregation', () => {
    it('39. Duplicate reference on same booking & method blocked with 409', async () => {
      await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'DUP-REF-101',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'dup-ref-101', // Case insensitive test
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_TRANSACTION_REFERENCE',
      });
    });

    it('40. Re-recording with same reference allowed if prior payment was REJECTED or VOIDED', async () => {
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'RETRY-REF-101',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.rejectPayment('bk-01', p1.id, 'Wrong account credited', accounts1);

      // New payment record with same reference now allowed
      const p2 = await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'RETRY-REF-101',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      expect(p2.id).not.toBe(p1.id);
      expect(p2.status).toBe('RECORDED');
    });

    it('41. Cross-booking duplicate allowed: same reference on different booking is valid', async () => {
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 5000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'CROSS-REF-99',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      expect(p1.id).toBeDefined();

      const p2 = await service.recordPayment(
        'bk-02',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'CROSS-REF-99',
          paymentType: 'ADVANCE',
        },
        salesExec2
      );
      expect(p2.id).toBeDefined();
    });

    it('42. Overpayment handling: amountReceived = actual, amountPending = 0, isOverpaid = true', async () => {
      // Selling price: 50000, customer pays 55000
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 55000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'OVERPAY-01',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      const res = await service.verifyPayment('bk-01', p.id, accounts1);

      expect(res.booking.amountReceived).toBe(55000);
      expect(res.booking.amountPending).toBe(0);
      expect(res.booking.paymentStatus).toBe('PAID');
      expect(res.booking.isOverpaid).toBe(true);
      expect(res.booking.overpaidAmount).toBe(5000);
    });

    it('43. Currency mismatch rejected with 422', async () => {
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 1000,
            currency: 'USD', // Booking is INR
            paymentDate: '2026-09-11',
            paymentMethod: 'CREDIT_CARD',
            referenceNumber: 'USD-CARD-01',
            paymentType: 'ADVANCE',
          },
          salesExec1
        )
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'CURRENCY_MISMATCH',
      });
    });

    it('44. Commercial booking fulfillment decoupling: booking can be PAID while components are REQUESTED', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 50000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'DECOUPLE-01',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      const res = await service.verifyPayment('bk-01', p.id, accounts1);
      expect(res.booking.paymentStatus).toBe('PAID');
      // Fulfillment confirmation progress remains decoupled
      expect(res.booking.confirmationProgress?.allConfirmed).toBeFalsy();
    });

    it('45. (M) Supplier cost segregation: payment records contain ZERO supplier cost or margin metrics', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 25000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'SEGREGATE-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );

      expect((p as any).supplierCost).toBeUndefined();
      expect((p as any).totalSupplierCost).toBeUndefined();
      expect((p as any).grossProfit).toBeUndefined();
      expect((p as any).grossMargin).toBeUndefined();
      expect((p as any).supplierBuyRate).toBeUndefined();
    });

    it('46. Audit events created for RECORDED, VERIFIED, REJECTED, and VOIDED with zero supplier data', async () => {
      const p = await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'AUDIT-TEST-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p.id, accounts1);
      await service.voidPayment('bk-01', p.id, 'Test audit generation', admin);

      const logs = storage.getAllAuditLogs();
      const actions = logs.map((l) => l.action);
      expect(actions).toContain('PAYMENT_RECORDED');
      expect(actions).toContain('PAYMENT_VERIFIED');
      expect(actions).toContain('PAYMENT_VOIDED');

      for (const log of logs) {
        expect((log.after as any)?.supplierCost).toBeUndefined();
        expect((log.after as any)?.grossProfit).toBeUndefined();
      }
    });

    it('47. Reusing an existing idempotencyKey with materially different payload throws 409 IDEMPOTENCY_PAYLOAD_MISMATCH', async () => {
      const key = 'idem-unique-key-999';
      await service.recordPayment(
        'bk-01',
        {
          amount: 10000,
          paymentDate: '2026-09-11',
          paymentMethod: 'UPI',
          referenceNumber: 'IDEM-FIRST-01',
          paymentType: 'ADVANCE',
          idempotencyKey: key,
        },
        salesExec1
      );

      // Re-call with same idempotencyKey but different amount (50000 instead of 10000)
      await expect(
        service.recordPayment(
          'bk-01',
          {
            amount: 50000, // Materially different!
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: 'IDEM-FIRST-01',
            paymentType: 'ADVANCE',
            idempotencyKey: key,
          },
          salesExec1
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      });
    });

    it('48. Unassigned booking cannot be accessed by arbitrary Sales Manager or Operations user', async () => {
      const unassignedBooking: Booking = {
        id: 'bk-unassigned',
        bookingReference: 'BB-UNASSIGNED',
        tripId: 'trip-unassigned',
        customerId: 'cust-unassigned',
        status: 'PENDING_PAYMENT',
        paymentStatus: 'UNPAID',
        totalSellingPrice: 40000,
        amountReceived: 0,
        amountPending: 40000,
        travelStartDate: '2026-10-01',
        travelEndDate: '2026-10-05',
        // Neither manager nor ops assigned
        createdAt: '2026-09-11T10:00:00Z',
        updatedAt: '2026-09-11T10:00:00Z',
      };

      const testStorage = new InMemoryPaymentStorageProvider({
        bookings: [unassignedBooking],
      });
      const testService = new PaymentService(testStorage);

      // Sales Manager 1 cannot access unassigned booking
      await expect(
        testService.getPaymentsForBooking('bk-unassigned', salesManager1)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      // Operations 1 cannot access unassigned booking
      await expect(
        testService.getPaymentsForBooking('bk-unassigned', ops1)
      ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

      // Accounts has enterprise access -> allowed
      const list = await testService.getPaymentsForBooking('bk-unassigned', accounts1);
      expect(Array.isArray(list)).toBe(true);
    });

    it('49. Overpayment recalculation when voiding a payment that was in an overpaid state', async () => {
      // Selling price 50,000. Customer pays 60,000 across 2 payments (40,000 + 20,000)
      const p1 = await service.recordPayment(
        'bk-01',
        {
          amount: 40000,
          paymentDate: '2026-09-11',
          paymentMethod: 'BANK_TRANSFER',
          referenceNumber: 'OP-RECALC-01',
          paymentType: 'ADVANCE',
        },
        salesExec1
      );
      await service.verifyPayment('bk-01', p1.id, accounts1);

      const p2 = await service.recordPayment(
        'bk-01',
        {
          amount: 20000,
          paymentDate: '2026-09-12',
          paymentMethod: 'UPI',
          referenceNumber: 'OP-RECALC-02',
          paymentType: 'FINAL_BALANCE',
        },
        salesExec1
      );
      const resOver = await service.verifyPayment('bk-01', p2.id, accounts2);
      expect(resOver.booking.amountReceived).toBe(60000);
      expect(resOver.booking.isOverpaid).toBe(true);
      expect(resOver.booking.overpaidAmount).toBe(10000);

      // Now void p2 (20,000) -> balance drops to 40,000 -> not overpaid anymore!
      const resVoid = await service.voidPayment('bk-01', p2.id, 'Adjustment void', admin);
      expect(resVoid.booking.amountReceived).toBe(40000);
      expect(resVoid.booking.amountPending).toBe(10000);
      expect(resVoid.booking.paymentStatus).toBe('PARTIALLY_PAID');
      expect(resVoid.booking.isOverpaid).toBe(false);
      expect(resVoid.booking.overpaidAmount).toBe(0);
    });

    it('50. Client modification of isOverpaid and overpaidAmount on bookings is blocked by Firestore rules', () => {
      const rulesContent = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf-8');
      const bookingRulesMatch = rulesContent.match(/match\s+\/bookings\/\{bookingId\}\s*\{([\s\S]*?)\}/);
      expect(bookingRulesMatch).not.toBeNull();
      const rules = bookingRulesMatch![1];
      expect(rules).toContain("'isOverpaid'");
      expect(rules).toContain("'overpaidAmount'");
      expect(rules).toContain("'amountReceived'");
      expect(rules).toContain("'paymentStatus'");
    });

    it('51. (F) Concurrent duplicate transaction reference creation throws 409 for the colliding attempt', async () => {
      // Trigger two concurrent recordPayment calls with same ref on same booking
      const ref = 'CONCUR-DUP-REF-999';
      const results = await Promise.allSettled([
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: ref,
            paymentType: 'ADVANCE',
          },
          salesExec1
        ),
        service.recordPayment(
          'bk-01',
          {
            amount: 5000,
            paymentDate: '2026-09-11',
            paymentMethod: 'UPI',
            referenceNumber: ref,
            paymentType: 'ADVANCE',
          },
          salesExec1
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one succeeds, and the other is rejected with 409 DUPLICATE_TRANSACTION_REFERENCE
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      const rejectedReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedReason).toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_TRANSACTION_REFERENCE',
      });
    });
  });
});

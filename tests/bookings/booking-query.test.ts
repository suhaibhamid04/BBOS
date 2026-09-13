import { describe, it, expect } from 'bun:test';
import { BookingQueryService } from '../../src/services/booking/bookingQueryService';
import { InMemoryBookingQueryProvider } from '../../src/services/booking/bookingQueryProvider';
import { Booking } from '../../src/types/booking';
import { PaymentActor } from '../../src/services/payment/paymentService';
import { BookingListFilter } from '../../src/types/bookingApi';

// =========================================================================
// MOCK DATA
// =========================================================================

const mockAdmin: PaymentActor = { id: 'admin1', name: 'Admin', role: 'Admin' };
const mockFounder: PaymentActor = { id: 'founder1', name: 'Founder', role: 'Founder' };
const mockAccounts: PaymentActor = { id: 'accounts1', name: 'Accounts', role: 'Accounts' };
const mockManager: PaymentActor = { id: 'mgr1', name: 'Manager', role: 'Sales Manager' };
const mockExec1: PaymentActor = { id: 'exec1', name: 'Exec 1', role: 'Sales Executive' };
const mockExec2: PaymentActor = { id: 'exec2', name: 'Exec 2', role: 'Sales Executive' };
const mockOps1: PaymentActor = { id: 'ops1', name: 'Ops 1', role: 'Operations' };
const mockMarketing: PaymentActor = { id: 'mkt1', name: 'Marketing', role: 'Marketing' };

const b1: Booking = {
  id: 'bk-1', bookingReference: 'BK-001', tripId: 't1', customerId: 'c1', customerName: 'John Doe',
  status: 'CONFIRMED', paymentStatus: 'PAID', amountReceived: 1000, amountPending: 0, totalSellingPrice: 1000,
  travelStartDate: '2026-10-01', travelEndDate: '2026-10-05', createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z',
  assignedSalesEmployeeId: 'exec1', assignedSalesManagerId: 'mgr1', assignedOperationsEmployeeId: 'ops1'
};

const b2: Booking = {
  id: 'bk-2', bookingReference: 'BK-002', tripId: 't2', customerId: 'c2', customerName: 'Jane Smith',
  status: 'PENDING_PAYMENT', paymentStatus: 'UNPAID', amountReceived: 0, amountPending: 2000, totalSellingPrice: 2000,
  travelStartDate: '2026-11-01', travelEndDate: '2026-11-05', createdAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z',
  assignedSalesEmployeeId: 'exec2', assignedSalesManagerId: 'mgr1'
};

const b3: Booking = {
  id: 'bk-3', bookingReference: 'BK-003', tripId: 't3', customerId: 'c3', customerName: 'Bob',
  status: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', amountReceived: 500, amountPending: 500, totalSellingPrice: 1000,
  travelStartDate: '2026-12-01', travelEndDate: '2026-12-05', createdAt: '2026-09-03T10:00:00Z', updatedAt: '2026-09-03T10:00:00Z',
  assignedSalesEmployeeId: 'exec1' // No manager, no ops
};

const provider = new InMemoryBookingQueryProvider({ bookings: [b1, b2, b3] });
const service = new BookingQueryService(provider as any);

describe('BBOS Phase 2B-6 Stage 1 - Booking Query & Detail Engine', () => {

  describe('1. Role-Based Visibility (List API)', () => {
    it('Admin/Founder/Accounts can view all bookings', async () => {
      const resAdmin = await service.listBookings({}, mockAdmin);
      expect(resAdmin.data.length).toBe(3);
      const resFounder = await service.listBookings({}, mockFounder);
      expect(resFounder.data.length).toBe(3);
      const resAccounts = await service.listBookings({}, mockAccounts);
      expect(resAccounts.data.length).toBe(3);
    });

    it('Sales Executive sees only assigned bookings', async () => {
      const res = await service.listBookings({}, mockExec1);
      expect(res.data.length).toBe(2);
      expect(res.data.map(b => b.id).sort()).toEqual(['bk-1', 'bk-3'].sort());
    });

    it('Sales Manager sees authorized bookings', async () => {
      const res = await service.listBookings({}, mockManager);
      expect(res.data.length).toBe(2);
      expect(res.data.map(b => b.id).sort()).toEqual(['bk-1', 'bk-2'].sort());
    });

    it('Operations sees only assigned operational bookings', async () => {
      const res = await service.listBookings({}, mockOps1);
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('bk-1');
    });

    it('Marketing is denied access', async () => {
      expect(service.listBookings({}, mockMarketing)).rejects.toThrow('Marketing role has no access');
    });
  });

  describe('2. Detail API & IDOR Protection', () => {
    it('Sales Executive CANNOT access another executives booking', async () => {
      expect(service.getBookingDetail('bk-2', mockExec1)).rejects.toThrow('Sales Executive is not authorized');
    });

    it('Operations CANNOT access unassigned booking', async () => {
      expect(service.getBookingDetail('bk-2', mockOps1)).rejects.toThrow('Operations user is not assigned');
    });

    it('Sales Manager CAN access authorized booking', async () => {
      const detail = await service.getBookingDetail('bk-2', mockManager);
      expect(detail.booking.id).toBe('bk-2');
    });

    it('Sales Manager CANNOT access unauthorized booking', async () => {
      expect(service.getBookingDetail('bk-3', mockManager)).rejects.toThrow('Sales Manager is not authorized');
    });
  });

  describe('3. Pagination & Cursor Safety', () => {
    it('Cursor pagination returns correct subset and nextCursor', async () => {
      const res1 = await service.listBookings({ limit: 1 }, mockAdmin);
      expect(res1.data.length).toBe(1);
      expect(res1.hasMore).toBe(true);
      expect(res1.nextCursor).not.toBeNull();
      
      // Expected order is createdAt DESC: bk-3, bk-2, bk-1
      expect(res1.data[0].id).toBe('bk-3');

      const res2 = await service.listBookings({ limit: 1, cursor: res1.nextCursor! }, mockAdmin);
      expect(res2.data.length).toBe(1);
      expect(res2.data[0].id).toBe('bk-2');
    });

    it('Cursor pagination preserves role boundaries (IDOR prevention via query composition)', async () => {
      // Exec1 only has bk-3 and bk-1.
      const res1 = await service.listBookings({ limit: 1 }, mockExec1);
      
      const res2 = await service.listBookings({ limit: 1, cursor: res1.nextCursor! }, mockExec1);
      
      expect(res2.data.find(b => b.id === 'bk-2')).toBeUndefined();
    });

    it('Rejects malformed cursor safely', async () => {
      expect(service.listBookings({ cursor: 'invalid_base64_or_json' }, mockAdmin)).rejects.toThrow('Malformed cursor.');
    });

    it('Rejects cursor if query context (filters) has changed', async () => {
      const res1 = await service.listBookings({ limit: 1, status: 'CONFIRMED' }, mockAdmin);
      
      // Attempt to reuse the cursor with a different status filter
      expect(service.listBookings({ limit: 1, status: 'PENDING_PAYMENT', cursor: res1.nextCursor! }, mockAdmin))
        .rejects.toThrow('Cursor is invalid or used in a different query context.');
    });
    
    it('Rejects cursor if role scope (actor) has changed', async () => {
      const res1 = await service.listBookings({ limit: 1 }, mockAdmin);
      
      // Attempt to reuse the cursor with a different actor
      expect(service.listBookings({ limit: 1, cursor: res1.nextCursor! }, mockFounder))
        .rejects.toThrow('Cursor is invalid or used in a different query context.');
    });
  });

  describe('4. Filters', () => {
    it('Filters by status', async () => {
      const res = await service.listBookings({ status: 'CONFIRMED' }, mockAdmin);
      expect(res.data.length).toBe(2);
      expect(res.data.every(b => b.status === 'CONFIRMED')).toBe(true);
    });

    it('Filters by paymentStatus', async () => {
      const res = await service.listBookings({ paymentStatus: 'UNPAID' }, mockAdmin);
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('bk-2');
    });

    it('Searches by bookingReference (query)', async () => {
      const res = await service.listBookings({ query: 'bk-001' }, mockAdmin);
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('bk-1');
    });
    
    it('Searches by customerName (query)', async () => {
      const res = await service.listBookings({ query: 'jane' }, mockAdmin);
      expect(res.data.length).toBe(1);
      expect(res.data[0].id).toBe('bk-2');
    });
  });

  describe('5. Data Security & Sanitization', () => {
    it('Detail Response omits totalSellingPrice for Operations role', async () => {
      const detail = await service.getBookingDetail('bk-1', mockOps1);
      expect(detail.booking.totalSellingPrice).toBeUndefined();
      expect(detail.paymentSummary?.totalSellingPrice).toBeUndefined();
    });

    it('Detail Response includes totalSellingPrice for Sales Executive', async () => {
      const detail = await service.getBookingDetail('bk-1', mockExec1);
      expect(detail.booking.totalSellingPrice).toBe(1000);
      expect(detail.paymentSummary?.totalSellingPrice).toBe(1000);
    });

    it('Booking schema intrinsically lacks supplier cost and profit fields', async () => {
      const detail = await service.getBookingDetail('bk-1', mockAdmin);
      expect((detail.booking as any).supplierCost).toBeUndefined();
      expect((detail.booking as any).grossProfit).toBeUndefined();
      expect((detail.booking as any).grossMargin).toBeUndefined();
    });

    it('Payment Summary uses safe aggregate fields', async () => {
      const detail = await service.getBookingDetail('bk-1', mockAdmin);
      expect(detail.paymentSummary).toBeDefined();
      expect(detail.paymentSummary?.amountReceived).toBe(1000);
      expect(detail.paymentSummary?.paymentStatus).toBe('PAID');
    });
  });
});

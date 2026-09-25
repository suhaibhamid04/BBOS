import { describe, it, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import { BookingQueryService } from '../../src/services/booking/bookingQueryService';
import { InMemoryBookingQueryProvider } from '../../src/services/booking/bookingQueryProvider';
import type { Booking, FinancialSnapshot } from '../../src/types/booking';
import type { AuthorizationPrincipal } from '../../server/authorization/policyTypes';

function actor(
  role: AuthorizationPrincipal['role'],
  employeeId: string,
  salesTeamId?: string,
): AuthorizationPrincipal & { id: string } {
  return {
    id: `compat-${employeeId}`,
    employeeId,
    role,
    active: true,
    ...(salesTeamId ? { salesTeamId } : {}),
  };
}

const founder = actor('Founder', 'founder-1');
const admin = actor('Admin', 'admin-1');
const accounts = actor('Accounts', 'accounts-1');
const managerA = actor('Sales Manager', 'manager-1', 'team-a');
const managerB = actor('Sales Manager', 'manager-2', 'team-b');
const executive1 = actor('Sales Executive', 'exec-1', 'team-a');
const reservations1 = actor('Reservations', 'res-1');
const reservations2 = actor('Reservations', 'res-2');
const operations1 = actor('Operations', 'ops-1');
const operations2 = actor('Operations', 'ops-2');
const marketing = actor('Marketing', 'marketing-1');

function booking(id: string, overrides: Partial<Booking> = {}): Booking {
  return {
    id,
    bookingReference: `BK-${id}`,
    tripId: `trip-${id}`,
    customerId: `customer-${id}`,
    customerName: `Customer ${id}`,
    customerPhone: '+91-9999999999',
    customerEmail: `${id}@example.com`,
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    currency: 'INR',
    totalSellingPrice: 1_000,
    totalAmount: 1_000,
    amountReceived: 1_000,
    amountPending: 0,
    travelStartDate: '2026-10-01',
    travelEndDate: '2026-10-05',
    createdAt: `2026-09-0${id.slice(-1)}T10:00:00Z`,
    updatedAt: '2026-09-01T10:00:00Z',
    ...overrides,
  };
}

const own = booking('bk-1', {
  assignedSalesEmployeeId: 'exec-1',
  assignedSalesManagerId: 'legacy-manager-that-must-not-authorize',
  salesTeamId: 'team-a',
  assignedReservationsEmployeeId: 'res-1',
  assignedOperationsEmployeeId: 'ops-1',
});
const sameTeam = booking('bk-2', {
  assignedSalesEmployeeId: 'exec-2',
  assignedSalesManagerId: 'manager-elsewhere',
  salesTeamId: 'team-a',
  assignedReservationsEmployeeId: 'res-2',
  assignedOperationsEmployeeId: 'ops-2',
});
const otherTeam = booking('bk-3', {
  assignedSalesEmployeeId: 'exec-3',
  assignedSalesManagerId: 'manager-1',
  salesTeamId: 'team-b',
  assignedReservationsEmployeeId: 'res-2',
  assignedOperationsEmployeeId: 'ops-2',
});
const missingMetadata = booking('bk-4');

const snapshot: FinancialSnapshot = {
  id: 'snapshot-1',
  bookingId: own.id,
  snapshotVersion: 1,
  quoteId: 'quote-1',
  quoteVersion: 1,
  currency: 'INR',
  totalSellingPrice: 1_000,
  totalSupplierCost: 700,
  accommodationSupplierCost: 500,
  transportSupplierCost: 150,
  activitySupplierCost: 50,
  otherSupplierCosts: 0,
  grossProfit: 300,
  grossMargin: 30,
  rateValidationFingerprint: 'fingerprint',
  createdAt: '2026-09-01T10:00:00Z',
  createdBy: 'exec-1',
  lineItems: [{
    serviceId: 'hotel-1',
    serviceType: 'ACCOMMODATION',
    supplierId: 'supplier-1',
    supplierName: 'Supplier One',
    inventoryMasterId: 'hotel-master-1',
    ratePeriodId: 'rate-1',
    rateContractType: 'NEGOTIATED',
    frozenSupplierUnitRate: 500,
    units: 1,
    frozenSupplementsCost: 0,
    frozenTotalSupplierCost: 500,
    taxTreatment: 'INCLUSIVE',
    taxAmount: 0,
    rateVerifiedAt: '2026-09-01T10:00:00Z',
  }],
};

function service() {
  return new BookingQueryService(new InMemoryBookingQueryProvider({
    bookings: [own, sameTeam, otherTeam, missingMetadata],
    financialSnapshots: [snapshot],
  }));
}

describe('Stage D3A - Booking read/query authorization', () => {
  it('Founder, Admin, and Accounts have ALL Booking read scope', async () => {
    for (const principal of [founder, admin, accounts]) {
      expect((await service().listBookings({}, principal)).data).toHaveLength(4);
    }
  });

  it('Sales Executive lists and opens OWN only using canonical employeeId', async () => {
    expect(executive1.id).not.toBe(executive1.employeeId);
    const list = await service().listBookings({}, executive1);
    expect(list.data.map(item => item.id)).toEqual(['bk-1']);
    expect((await service().getBookingDetail('bk-1', executive1)).booking.id).toBe('bk-1');
    expect(service().getBookingDetail('bk-2', executive1)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('denies out-of-scope detail before loading services or financial snapshots', async () => {
    const provider = new InMemoryBookingQueryProvider({ bookings: [sameTeam] });
    let relatedReads = 0;
    const original = provider.getBookingWithServices.bind(provider);
    provider.getBookingWithServices = async bookingId => {
      relatedReads += 1;
      return original(bookingId);
    };
    const queryService = new BookingQueryService(provider);

    expect(queryService.getBookingDetail('bk-2', executive1)).rejects.toMatchObject({ statusCode: 403 });
    expect(relatedReads).toBe(0);
  });

  it('Sales Manager uses immutable salesTeamId, not assignedSalesManagerId', async () => {
    const team = await service().listBookings({}, managerA);
    expect(team.data.map(item => item.id).sort()).toEqual(['bk-1', 'bk-2']);
    expect((await service().getBookingDetail('bk-2', managerA)).booking.id).toBe('bk-2');
    expect(service().getBookingDetail('bk-3', managerA)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service().getBookingDetail('bk-3', managerB)).booking.id).toBe('bk-3');
  });

  it('Reservations lists and opens only ASSIGNED Bookings', async () => {
    const list = await service().listBookings({}, reservations1);
    expect(list.data.map(item => item.id)).toEqual(['bk-1']);
    const detail = await service().getBookingDetail('bk-1', reservations1);
    expect(detail.booking.customerEmail).toBe(own.customerEmail);
    expect(detail.booking.assignedOperationsEmployeeId).toBeUndefined();
    expect(service().getBookingDetail('bk-2', reservations1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service().getBookingDetail('bk-2', reservations2)).booking.id).toBe('bk-2');
  });

  it('Operations lists and opens only ASSIGNED Bookings', async () => {
    expect((await service().listBookings({}, operations1)).data.map(item => item.id)).toEqual(['bk-1']);
    const detail = await service().getBookingDetail('bk-1', operations1);
    expect(detail.booking.id).toBe('bk-1');
    expect(detail.booking.assignedReservationsEmployeeId).toBeUndefined();
    expect(service().getBookingDetail('bk-2', operations1)).rejects.toMatchObject({ statusCode: 403 });
    expect((await service().getBookingDetail('bk-2', operations2)).booking.id).toBe('bk-2');
  });

  it('Marketing is denied raw Booking access', async () => {
    expect(service().listBookings({}, marketing)).rejects.toMatchObject({ statusCode: 403 });
    expect(service().getBookingDetail('bk-1', marketing)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('passes centralized OWN, TEAM, and ASSIGNED constraints into the provider', async () => {
    const captured: Record<string, unknown[]> = {};
    for (const [label, principal] of [
      ['own', executive1],
      ['team', managerA],
      ['reservations', reservations1],
      ['operations', operations1],
    ] as const) {
      const provider = new InMemoryBookingQueryProvider({ bookings: [own, sameTeam, otherTeam] });
      const original = provider.listBookings.bind(provider);
      provider.listBookings = async (filter, constraints) => {
        captured[label] = constraints;
        return original(filter, constraints);
      };
      await new BookingQueryService(provider).listBookings({}, principal);
    }

    expect(captured.own).toContainEqual({ field: 'assignedSalesEmployeeId', operator: '==', value: 'exec-1' });
    expect(captured.team).toContainEqual({ field: 'salesTeamId', operator: '==', value: 'team-a' });
    expect(captured.reservations).toContainEqual({ field: 'assignedReservationsEmployeeId', operator: '==', value: 'res-1' });
    expect(captured.operations).toContainEqual({ field: 'assignedOperationsEmployeeId', operator: '==', value: 'ops-1' });
  });

  it('missing owner, team, and assignment metadata fails closed for scoped roles', async () => {
    for (const principal of [executive1, managerA, reservations1, operations1]) {
      expect(service().getBookingDetail('bk-4', principal)).rejects.toMatchObject({
        statusCode: 403,
        code: 'MISSING_SCOPE_METADATA',
      });
    }
  });

  it('Reservations receives supplier rates/costs but no profit or margin', async () => {
    const detail = await service().getBookingDetail('bk-1', reservations1);
    expect(detail.financialSnapshot?.totalSupplierCost).toBe(700);
    expect(detail.financialSnapshot?.lineItems?.[0].frozenSupplierUnitRate).toBe(500);
    expect(detail.financialSnapshot?.grossProfit).toBeUndefined();
    expect(detail.financialSnapshot?.grossMargin).toBeUndefined();
    expect(detail.paymentSummary).toBeNull();
  });

  it('Operations receives operational fields but no supplier cost, selling price, or profit', async () => {
    const detail = await service().getBookingDetail('bk-1', operations1);
    expect(detail.financialSnapshot).toBeUndefined();
    expect(detail.booking.totalSellingPrice).toBeUndefined();
    expect(detail.booking.amountReceived).toBeUndefined();
    expect(detail.paymentSummary).toBeNull();
  });

  it('Sales OWN/TEAM and Accounts retain authorized financial visibility', async () => {
    for (const principal of [executive1, managerA, accounts]) {
      const detail = await service().getBookingDetail('bk-1', principal);
      expect(detail.booking.totalSellingPrice).toBe(1_000);
      expect(detail.financialSnapshot?.totalSupplierCost).toBe(700);
      expect(detail.financialSnapshot?.grossProfit).toBe(300);
      expect(detail.financialSnapshot?.grossMargin).toBe(30);
    }
  });

  it('keeps pagination bounded and cursor-bound to actor scope', async () => {
    const first = await service().listBookings({ limit: 1 }, managerA);
    expect(first.data).toHaveLength(1);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();

    const second = await service().listBookings({ limit: 1, cursor: first.nextCursor! }, managerA);
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
    expect(service().listBookings({ limit: 1, cursor: first.nextCursor! }, managerB))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_CURSOR' });
  });

  it('retains one-at-a-time status, payment, and exact-reference filters', async () => {
    expect((await service().listBookings({ status: 'CONFIRMED' }, accounts)).data).toHaveLength(4);
    expect((await service().listBookings({ paymentStatus: 'PAID' }, accounts)).data).toHaveLength(4);
    expect((await service().listBookings({ query: 'BK-bk-1' }, accounts)).data.map(item => item.id)).toEqual(['bk-1']);
    expect(service().listBookings({ status: 'CONFIRMED', paymentStatus: 'PAID' }, accounts))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_FILTER' });
  });

  it('blocks direct browser reads of Booking roots and modern Booking services', () => {
    const rules = fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8');
    for (const collection of ['bookings', 'booking_accommodations', 'booking_transports', 'booking_activities']) {
      const match = rules.match(new RegExp(`match\\s+\\/${collection}\\/\\{[^}]+\\}\\s*\\{([\\s\\S]*?)allow create`));
      expect(match).not.toBeNull();
      expect(match![1]).toContain('allow read: if false;');
    }
  });
});

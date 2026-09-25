import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { accommodationRouter } from '../../server/routes/accommodation';
import { transportRouter } from '../../server/routes/transport';
import { tripsRouter } from '../../server/routes/trips';
import { sanitizeFinancialData } from '../../server/middleware/financialGuard';
import { APP_CONFIG } from '../../src/config';
import { UserRole } from '../../src/types/index';
const mockBookingData = {
  id: 'bkg-1',
  customerName: 'Test Customer',
  totalSellingPrice: 50000,
  totalSupplierCost: 40000,
  grossProfit: 10000,
  grossMargin: 20,
  itinerary: [
    {
      day: 1,
      hotel: {
        name: 'Grand Hotel',
        supplierCost: 5000,
        negotiatedBaseRate: 4500,
        internalNotes: 'VIP guest'
      },
      supplierCost: 5500
    }
  ],
  quoteItems: [
    {
      type: 'TRANSPORT',
      supplierCost: 2000
    }
  ],
  bookingDetails: {
    internalCost: 100,
    commercialDiscount: 50
  }
};

describe('TICKET-001 & TICKET-009: API Financial Data Sanitization', () => {
  const getApiResponseForRole = async (role: string) => {
    // Legacy endpoints without a resource authorization decision must remain
    // fail-closed. Stage D3A Booking endpoints are tested separately through
    // their explicit resource-scoped Booking DTOs.
    return sanitizeFinancialData(mockBookingData, role);
  };

  it('1. Founder receives authorized financial fields', async () => {
    const data = await getApiResponseForRole('Founder');
    expect(data.totalSupplierCost).toBe(40000);
    expect(data.itinerary[0].hotel.supplierCost).toBe(5000);
  });

  it('2. Admin receives authorized financial fields', async () => {
    const data = await getApiResponseForRole('Admin');
    expect(data.totalSupplierCost).toBe(40000);
    expect(data.itinerary[0].hotel.supplierCost).toBe(5000);
  });

  it('3. Accounts receives authorized financial fields', async () => {
    const data = await getApiResponseForRole('Accounts');
    expect(data.totalSupplierCost).toBe(40000);
    expect(data.itinerary[0].hotel.supplierCost).toBe(5000);
  });

  it('4. Sales Manager does not receive supplierCost', async () => {
    const data = await getApiResponseForRole('Sales Manager');
    expect(data.itinerary[0].hotel.supplierCost).toBeUndefined();
    expect(data.itinerary[0].supplierCost).toBeUndefined();
    expect(data.quoteItems[0].supplierCost).toBeUndefined();
  });

  it('5. Unscoped legacy Sales Manager response fails closed without a resource decision', async () => {
    const data = await getApiResponseForRole('Sales Manager');
    expect(data.grossProfit).toBeUndefined();
    expect(data.grossMargin).toBeUndefined();
  });

  it('6. Sales Executive does not receive supplierCost', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.itinerary[0].hotel.supplierCost).toBeUndefined();
    expect(data.totalSupplierCost).toBeUndefined();
  });

  it('7. Sales Executive does not receive grossProfit', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.grossProfit).toBeUndefined();
  });

  it('8. Sales Executive does not receive grossMargin', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.grossMargin).toBeUndefined();
  });

  it('9. Sales Executive does not receive negotiatedBaseRate', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.itinerary[0].hotel.negotiatedBaseRate).toBeUndefined();
  });

  it('10. Marketing receives no restricted financial fields', async () => {
    const data = await getApiResponseForRole('Marketing');
    expect(data.grossProfit).toBeUndefined();
    expect(data.itinerary[0].hotel.supplierCost).toBeUndefined();
  });

  it('11. Operations receives neither supplier costs nor margin fields', async () => {
    const data = await getApiResponseForRole('Operations');
    expect(data.grossProfit).toBeUndefined();
    expect(data.grossMargin).toBeUndefined();
    expect(data.bookingDetails.commercialDiscount).toBeUndefined();
    expect(data.itinerary[0].hotel.supplierCost).toBeUndefined();
    expect(data.totalSupplierCost).toBeUndefined();
  });

  it('Reservations receives supplier costs but no package profit or margin', async () => {
    const data = await getApiResponseForRole('Reservations');
    expect(data.itinerary[0].hotel.supplierCost).toBe(5000);
    expect(data.totalSupplierCost).toBe(40000);
    expect(data.grossProfit).toBeUndefined();
    expect(data.grossMargin).toBeUndefined();
  });

  it('12. Nested itinerary supplierCost is removed', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.itinerary[0].supplierCost).toBeUndefined();
  });

  it('13. Nested accommodation supplierCost is removed', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.itinerary[0].hotel.supplierCost).toBeUndefined();
  });

  it('14. Nested quote item supplierCost is removed', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.quoteItems[0].supplierCost).toBeUndefined();
  });

  it('15. Nested booking financial fields are removed', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(data.bookingDetails.internalCost).toBeUndefined();
    expect(data.bookingDetails.commercialDiscount).toBeUndefined();
  });

  it('16. Arrays are sanitized recursively', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    expect(Array.isArray(data.itinerary)).toBe(true);
    expect(data.itinerary[0].day).toBe(1); // non-financial kept
    expect(data.itinerary[0].supplierCost).toBeUndefined(); // financial removed
  });

  it('17. Original input object is not unintentionally mutated', () => {
    const original = { a: 1, supplierCost: 100, date: new Date() };
    const dateRef = original.date;
    const sanitized = sanitizeFinancialData(original, 'Sales Executive');
    expect(original.supplierCost).toBe(100); // Original intact
    expect(sanitized.supplierCost).toBeUndefined();
    expect(sanitized.date).toBeInstanceOf(Date);
    expect(sanitized.date).not.toBe(dateRef); // Should be a cloned date
  });

  it('fails if ANY restricted key exists anywhere in the returned JSON tree for Sales Executive', async () => {
    const data = await getApiResponseForRole('Sales Executive');
    const jsonString = JSON.stringify(data);
    expect(jsonString).not.toContain('supplierCost');
    expect(jsonString).not.toContain('totalSupplierCost');
    expect(jsonString).not.toContain('grossProfit');
    expect(jsonString).not.toContain('grossMargin');
    expect(jsonString).not.toContain('internalCost');
    expect(jsonString).not.toContain('negotiatedBaseRate');
    expect(jsonString).not.toContain('commercialDiscount');
  });

  it('fails closed for an unknown runtime role', () => {
    const sanitized = sanitizeFinancialData(mockBookingData, 'Unknown Role');
    expect((sanitized as any).totalSupplierCost).toBeUndefined();
    expect((sanitized as any).grossProfit).toBeUndefined();
    expect((sanitized as any).grossMargin).toBeUndefined();
  });
});

describe('HTTP Integration Tests for calculate-rate and calculate-costs', () => {
  let app: any;
  let server: any;
  let port: number;

  beforeEach((done) => {
    APP_CONFIG.DEMO_MODE = true;
    app = express();
    app.use(express.json());
    app.use((req: any, res: any, next: any) => {
      const role = req.headers['x-role'] as UserRole;
      const identityByRole: Record<UserRole, { employeeId: string; salesTeamId?: string }> = {
        Founder: { employeeId: 'emp-founder-01' },
        Admin: { employeeId: 'emp-admin-01' },
        Accounts: { employeeId: 'emp-acc-01' },
        'Sales Manager': { employeeId: 'emp-mgr-01', salesTeamId: 'sales-team-01' },
        'Sales Executive': { employeeId: 'emp-sales-01', salesTeamId: 'sales-team-01' },
        Reservations: { employeeId: 'emp-res-01' },
        Operations: { employeeId: 'emp-ops-01' },
        Marketing: { employeeId: 'emp-mkt-01' },
      };
      const identity = identityByRole[role];
      req.user = {
        id: `compat:${identity.employeeId}`,
        uid: identity.employeeId,
        firebaseUid: `firebase:${identity.employeeId}`,
        employeeId: identity.employeeId,
        role,
        active: true,
        name: role,
        email: `${identity.employeeId}@example.com`,
        ...identity,
      };
      next();
    });
    app.use('/api/accommodation', accommodationRouter);
    app.use('/api/transport', transportRouter);
    app.use('/api/trips', tripsRouter);
    server = app.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  const fetchAsRole = async (path: string, payload: any, role: UserRole) => {
    const res = await fetch(`http://localhost:${port}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-role': role },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.error) console.log('ERROR JSON:', json);
    return json;
  };
  const accommodationPayload = {
    propertyId: 'accom-sgr-kareemresidency',
    roomCategoryId: 'rc-accom-sgr-kareemresidency',
    checkInDate: '2026-10-01',
    nights: 2,
    adults: 2,
    children: 0,
    childrenWithBed: 0,
    childrenWithoutBed: 0,
    mealPlan: 'MAP',
    useNegotiatedRate: false
  };

  const transportPayload = {
    vehicleCategoryId: 'vc_innova_crysta',
    startDate: '2026-10-01',
    days: 2,
    serviceType: 'MULTI_DAY_JOURNEY'
  };

  const tripsPayload = {
    tripId: 'trip-demo-01',
    items: []
  };

  it('Sales Executive: Accommodation calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/accommodation/calculate-rate', accommodationPayload, 'Sales Executive');
    expect(res.success).toBe(true);
    expect(res.data.supplierCostPerNight).toBeUndefined();
    expect(res.data.totalSupplierCost).toBeUndefined();
    expect(res.data.available).toBe(true);
  });

  it('Sales Manager: Accommodation calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/accommodation/calculate-rate', accommodationPayload, 'Sales Manager');
    expect(res.success).toBe(true);
    expect(res.data.supplierCostPerNight).toBeUndefined();
    expect(res.data.totalSupplierCost).toBeUndefined();
  });

  it('Operations: Accommodation calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/accommodation/calculate-rate', accommodationPayload, 'Operations');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeUndefined();
  });

  it('Reservations: Accommodation calculate-rate shows supplier costs', async () => {
    const res = await fetchAsRole('/api/accommodation/calculate-rate', accommodationPayload, 'Reservations');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeGreaterThan(0);
  });

  it('Founder: Accommodation calculate-rate shows supplier costs', async () => {
    const res = await fetchAsRole('/api/accommodation/calculate-rate', accommodationPayload, 'Founder');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeDefined();
  });

  it('Sales Executive: Transport calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/transport/calculate-rate', transportPayload, 'Sales Executive');
    expect(res.success).toBe(true);
    expect(res.data.baseSupplierCost).toBeUndefined();
    expect(res.data.supplementCost).toBeUndefined();
    expect(res.data.supplierCost).toBeUndefined();
  });

  it('Operations: Transport calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/transport/calculate-rate', transportPayload, 'Operations');
    expect(res.success).toBe(true);
    expect(res.data.baseSupplierCost).toBeUndefined();
    expect(res.data.supplierCost).toBeUndefined();
  });

  it('Reservations: Transport calculate-rate shows supplier costs', async () => {
    const res = await fetchAsRole('/api/transport/calculate-rate', transportPayload, 'Reservations');
    expect(res.success).toBe(true);
    expect(res.data.baseSupplierCost).toBeDefined();
    expect(res.data.supplierCost).toBeDefined();
  });

  it('Sales Manager: Transport calculate-rate hides supplier costs', async () => {
    const res = await fetchAsRole('/api/transport/calculate-rate', transportPayload, 'Sales Manager');
    expect(res.success).toBe(true);
    expect(res.data.supplierCost).toBeUndefined();
    expect(res.data.baseSupplierCost).toBeUndefined();
    expect(res.data.supplementCost).toBeUndefined();
  });

  it('Sales Executive OWN: Trips calculate-costs returns full authorized financials', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Sales Executive');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBe(0);
    expect(res.data.grossProfit).toBe(82500);
    expect(res.data.grossMargin).toBe(100);
  });

  it('Operations: Trips calculate-costs is denied before calculation', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Operations');
    expect(res.code).toBe('RESOURCE_ACCESS_DENIED');
  });

  it('Reservations: Trips calculate-costs is denied commercial mutation authority', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Reservations');
    expect(res.code).toBe('RESOURCE_ACCESS_DENIED');
  });

  it('Admin: Trips calculate-costs shows everything', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Admin');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeDefined();
    expect(res.data.grossProfit).toBeDefined();
  });
});

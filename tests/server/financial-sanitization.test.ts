import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Request, Response } from 'express';
import express from 'express';
import { bookingsRouter } from '../../server/routes/bookings';
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

import { BookingQueryService } from '../../src/services/booking/bookingQueryService';

BookingQueryService.prototype.getBookingDetail = async () => (mockBookingData as any);

describe('TICKET-001 & TICKET-009: API Financial Data Sanitization', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;
  let handler: any;

  beforeEach(() => {
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => ({ json: jsonMock }));
    res = { json: jsonMock, status: statusMock };
    const route = (bookingsRouter as any).stack.find((r: any) => r.route && r.route.path === '/:bookingId' && r.route.methods.get);
    handler = route.route.stack[route.route.stack.length - 1].handle;
  });

  afterEach(() => {
    mock.restore();
  });

  const getApiResponseForRole = async (role: string) => {
    req = {
      params: { bookingId: 'bkg-1' },
      user: { id: 'usr-1', uid: 'uid-1', role, name: 'Test' } as any
    };
    await handler(req as Request, res as Response, () => {});
    return jsonMock.mock.calls[0][0].data;
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

  it('5. Sales Manager receives allowed margin fields', async () => {
    const data = await getApiResponseForRole('Sales Manager');
    expect(data.grossProfit).toBe(10000);
    expect(data.grossMargin).toBe(20);
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
      req.user = { id: 'usr-1', role: req.headers['x-role'] as string };
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
    tripId: 'trip-1',
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

  it('Sales Executive: Trips calculate-costs hides supplier costs but keeps malformed fields safe', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Sales Executive');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeUndefined();
  });

  it('Operations: Trips calculate-costs hides supplier costs and margins', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Operations');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeUndefined();
    expect(res.data.grossProfit).toBeUndefined();
  });

  it('Reservations: Trips calculate-costs shows supplier costs but hides margins', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Reservations');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeDefined();
    expect(res.data.grossProfit).toBeUndefined();
  });

  it('Admin: Trips calculate-costs shows everything', async () => {
    const res = await fetchAsRole('/api/trips/calculate-costs', tripsPayload, 'Admin');
    expect(res.success).toBe(true);
    expect(res.data.totalSupplierCost).toBeDefined();
    expect(res.data.grossProfit).toBeDefined();
  });
});

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

import { DEMO_RATE_PERIODS, DEMO_ROOM_CATEGORIES } from '../../src/services/accommodationDemoData';
import { APP_CONFIG } from '../../src/config';

const originalDemoMode = APP_CONFIG.DEMO_MODE;
let tripWriteCount = 0;
let storedTrip = {
  id: 'trip-123',
  assignedSalesEmployeeId: 'emp-sales-01',
  salesTeamId: 'sales-team-01',
  status: 'DRAFT',
  totalSellingPrice: 50000,
};
let storedItineraryItems: any[] = [];

// Mock getAdminDb to bypass actual Firebase Admin SDK in tests
// Must simulate the full where().where().get() chain for tripCosting
mock.module('../../server/firebaseAdmin.ts', () => ({
  getAdminDb: () => {
    return {
      collection: (colName: string) => {
        let filters: any[] = [];
        const mockQuery = {
          where: (field: string, op: string, val: any) => {
            filters.push({ field, val });
            return mockQuery;
          },
          get: async () => {
            let data: any[] = [];
            if (colName === 'rate_periods') {
              data = DEMO_RATE_PERIODS;
            } else if (colName === 'room_categories') {
              data = DEMO_ROOM_CATEGORIES;
            } else if (colName === 'itinerary_days') {
              data = [{ id: 'day-123', tripId: storedTrip.id, items: storedItineraryItems }];
            }
            
            // Apply mock filters (specifically for propertyId and roomCategoryId)
            for (const f of filters) {
              data = data.filter(item => (item as any)[f.field] === f.val);
            }
            
            return {
              docs: data.map(d => ({ data: () => d }))
            };
          }
        };
        return {
          doc: (id: string) => ({
            get: async () => ({
              id,
              exists: colName === 'trips' && id === storedTrip.id,
              data: () => storedTrip,
            }),
            update: async () => {
              if (colName === 'trips') tripWriteCount += 1;
            }
          }),
          where: mockQuery.where,
          get: mockQuery.get
        };
      }
    };
  }
}));

// We can test the route logic by importing it and calling it directly 
// or using supertest. For simplicity, we'll mock the express Request/Response
import { tripsRouter } from '../../server/routes/trips';
import { Request, Response } from 'express';

describe('POST /api/trips/calculate-costs', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    APP_CONFIG.DEMO_MODE = false;
    tripWriteCount = 0;
    storedItineraryItems = [];
    storedTrip = {
      id: 'trip-123',
      assignedSalesEmployeeId: 'emp-sales-01',
      salesTeamId: 'sales-team-01',
      status: 'DRAFT',
      totalSellingPrice: 50000,
    };
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => {
      return { json: jsonMock };
    });
    
    req = {
      user: {
        id: 'compat-founder', uid: 'emp-founder-01', firebaseUid: 'firebase-founder',
        employeeId: 'emp-founder-01', role: 'Founder', active: true, name: 'Founder', email: 'founder@example.com',
      } as any,
      body: {}
    };
    
    res = {
      json: jsonMock,
      status: statusMock
    };
  });

  afterEach(() => {
    APP_CONFIG.DEMO_MODE = originalDemoMode;
    mock.restore();
  });

  it('calculates true supplier cost and ignores client-provided cost', async () => {
    req.body = {
      tripId: 'trip-123',
      totalSellingPrice: 50000,
      items: [
        {
          type: 'HOTEL',
          supplierCost: 999999, // Malicious client cost
          metadata: {
            propertyId: 'accom-sgr-kareemresidency',
            roomCategoryId: 'rc-accom-sgr-kareemresidency',
            checkInDate: '2026-09-15',
            nights: 2,
            adults: 2,
            children: 0
          }
        }
      ]
    };

    // The route handler is the first layer in tripsRouter stack
    const handler = (tripsRouter as any).stack[0].route.stack[0].handle;
    storedItineraryItems = req.body.items;
    
    await handler(req as Request, res as Response, () => {});

    // For Kareem Residency in Sept, rate is 3500 per night. 2 nights = 7000.
    // Selling price = 50000. Gross profit = 50000 - 7000 = 43000. Margin = 43000 / 50000 = 86%
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data.totalSupplierCost).toBe(7000); // Successfully ignored 999999
    expect(result.data.grossProfit).toBe(43000);
    expect(result.data.grossMargin).toBe(86);
  });

  it('returns full financial metrics for an authorized owning Sales Executive', async () => {
    req.user = {
      id: 'compat-sales-1', uid: 'emp-sales-01', firebaseUid: 'firebase-sales-1',
      employeeId: 'emp-sales-01', role: 'Sales Executive', active: true,
      salesTeamId: 'sales-team-01', name: 'Sales', email: 'sales@example.com',
    } as any;
    req.body = {
      tripId: 'trip-123',
      totalSellingPrice: 50000,
      items: [
        {
          type: 'HOTEL',
          metadata: {
            propertyId: 'accom-sgr-kareemresidency',
            roomCategoryId: 'rc-accom-sgr-kareemresidency',
            checkInDate: '2026-09-15',
            nights: 2,
            adults: 2,
            children: 0
          }
        }
      ]
    };

    const handler = (tripsRouter as any).stack[0].route.stack[0].handle;
    storedItineraryItems = req.body.items;
    await handler(req as Request, res as Response, () => {});

    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data.totalSupplierCost).toBe(7000);
    expect(result.data.grossProfit).toBe(43000);
    expect(result.data.grossMargin).toBe(86);
  });

  it('applies October rate for Kareem Residency correctly', async () => {
    req.body = {
      tripId: 'trip-123',
      totalSellingPrice: null, // Malicious/missing client value is ignored
      items: [
        {
          type: 'HOTEL',
          metadata: {
            propertyId: 'accom-sgr-kareemresidency',
            roomCategoryId: 'rc-accom-sgr-kareemresidency',
            checkInDate: '2026-10-05', // October
            nights: 3,
            adults: 2,
            children: 0
          }
        }
      ]
    };

    const handler = (tripsRouter as any).stack[0].route.stack[0].handle;
    storedItineraryItems = req.body.items;
    await handler(req as Request, res as Response, () => {});

    // For Kareem Residency in Oct, rate is 4000 per night. 3 nights = 12000.
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data.totalSupplierCost).toBe(12000);
    expect(result.data.grossProfit).toBe(38000); // Uses stored totalSellingPrice=50000
    expect(result.data.grossMargin).toBe(76);
    expect(tripWriteCount).toBe(1);
  });

  it('allows a same-team Sales Manager and rejects another-team Sales Manager', async () => {
    const handler = (tripsRouter as any).stack[0].route.stack[0].handle;
    req.user = {
      id: 'compat-manager', uid: 'emp-mgr-01', firebaseUid: 'firebase-manager',
      employeeId: 'emp-mgr-01', role: 'Sales Manager', active: true,
      salesTeamId: 'sales-team-01', name: 'Manager', email: 'manager@example.com',
    } as any;
    req.body = { tripId: 'trip-123', items: [] };
    storedItineraryItems = req.body.items;
    await handler(req as Request, res as Response, () => {});
    expect(jsonMock.mock.calls[0][0].success).toBe(true);
    expect(tripWriteCount).toBe(1);

    jsonMock.mockClear();
    statusMock.mockClear();
    tripWriteCount = 0;
    req.user = { ...(req.user as any), salesTeamId: 'sales-team-other' };
    await handler(req as Request, res as Response, () => {});
    expect(statusMock.mock.calls[0][0]).toBe(403);
    expect(jsonMock.mock.calls[0][0].code).toBe('RESOURCE_ACCESS_DENIED');
    expect(tripWriteCount).toBe(0);
  });

  it('denies Marketing, Operations, another Executive, and missing owner metadata before calculation or write', async () => {
    const handler = (tripsRouter as any).stack[0].route.stack[0].handle;
    const deniedActors = [
      { employeeId: 'emp-mkt-01', role: 'Marketing' },
      { employeeId: 'emp-ops-01', role: 'Operations' },
      { employeeId: 'emp-sales-02', role: 'Sales Executive', salesTeamId: 'sales-team-01' },
    ];

    for (const denied of deniedActors) {
      let calculationInvoked = false;
      const trappedItems: any[] = [];
      Object.defineProperty(trappedItems, Symbol.iterator, {
        value: () => {
          calculationInvoked = true;
          throw new Error('calculation must not run');
        },
      });
      req.user = {
        id: `compat:${denied.employeeId}`,
        uid: denied.employeeId,
        firebaseUid: `firebase:${denied.employeeId}`,
        employeeId: denied.employeeId,
        role: denied.role,
        active: true,
        name: denied.role,
        email: `${denied.employeeId}@example.com`,
        ...('salesTeamId' in denied ? { salesTeamId: denied.salesTeamId } : {}),
      } as any;
      req.body = { tripId: 'trip-123', items: trappedItems };
      await handler(req as Request, res as Response, () => {});
      expect(statusMock.mock.calls.at(-1)?.[0]).toBe(403);
      expect(calculationInvoked).toBe(false);
      expect(tripWriteCount).toBe(0);
    }

    storedTrip = { ...storedTrip, assignedSalesEmployeeId: undefined as any };
    req.user = {
      id: 'compat-sales-1', uid: 'emp-sales-01', firebaseUid: 'firebase-sales-1',
      employeeId: 'emp-sales-01', role: 'Sales Executive', active: true,
      salesTeamId: 'sales-team-01', name: 'Sales', email: 'sales@example.com',
    } as any;
    req.body = { tripId: 'trip-123', items: [] };
    await handler(req as Request, res as Response, () => {});
    expect(statusMock.mock.calls.at(-1)?.[0]).toBe(403);
    expect(tripWriteCount).toBe(0);
  });
});

import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';

// Mock getAdminDb to bypass actual Firebase Admin SDK in tests
mock.module('../../server/firebaseAdmin.ts', () => ({
  getAdminDb: () => ({
    collection: () => ({
      doc: () => ({
        update: async () => Promise.resolve()
      })
    })
  })
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
    jsonMock = mock((data: any) => data);
    statusMock = mock((code: number) => {
      return { json: jsonMock };
    });
    
    req = {
      user: { id: 'test-user', role: 'Founder' } as any,
      body: {}
    };
    
    res = {
      json: jsonMock,
      status: statusMock
    };
  });

  afterEach(() => {
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
    
    await handler(req as Request, res as Response, () => {});

    // For Kareem Residency in Sept, rate is 3500 per night. 2 nights = 7000.
    // Selling price = 50000. Gross profit = 50000 - 7000 = 43000. Margin = 43000 / 50000 = 86%
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data.totalCost).toBe(7000); // Successfully ignored 999999
    expect(result.data.grossProfit).toBe(43000);
    expect(result.data.grossMargin).toBe(86);
  });

  it('hides financial metrics for Sales Executives', async () => {
    req.user = { id: 'sales-1', role: 'Sales Executive' } as any;
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
    await handler(req as Request, res as Response, () => {});

    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined(); // Crucial security check: Data is undefined for Sales
  });

  it('applies October rate for Kareem Residency correctly', async () => {
    req.body = {
      tripId: 'trip-123',
      totalSellingPrice: null, // Undefined selling price
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
    await handler(req as Request, res as Response, () => {});

    // For Kareem Residency in Oct, rate is 4000 per night. 3 nights = 12000.
    
    expect(jsonMock).toHaveBeenCalled();
    const result = jsonMock.mock.calls[0][0];
    
    expect(result.success).toBe(true);
    expect(result.data.totalCost).toBe(12000);
    expect(result.data.grossProfit).toBeNull(); // Because totalSellingPrice was null
    expect(result.data.grossMargin).toBeNull();
  });
});

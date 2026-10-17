import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import express from 'express';
import type { Server } from 'node:http';
import { activitiesRouter } from '../../server/routes/activities';
import { transportRouter } from '../../server/routes/transport';
import { inventoryManagementService } from '../../server/services/inventoryManagementService';
import { projectSupplierCalculation, sanitizeFinancialData } from '../../server/middleware/financialGuard';
import { APP_CONFIG } from '../../src/config';
import { DEMO_TRIPS } from '../../src/services/demoData';
import type { UserRole } from '../../src/types';

describe('rate calculation HTTP financial boundary', () => {
  let server: Server;
  let base: string;
  let role: UserRole;
  let previousDemo: boolean;
  const spies: Array<{ mockRestore(): void }> = [];
  beforeEach(() => {
    previousDemo = APP_CONFIG.DEMO_MODE;
    APP_CONFIG.DEMO_MODE = true;
    role = 'Operations';
    DEMO_TRIPS.push({ id: 'audit-calculation-trip', status: 'BOOKED', assignedSalesEmployeeId: 'employee',
      salesTeamId: 'team', assignedOperationsEmployeeId: 'employee', assignedReservationsEmployeeId: 'employee' } as any);
    spies.push(spyOn(inventoryManagementService, 'activitySnapshot').mockResolvedValue({ id: 'activity', active: true } as any));
    spies.push(spyOn(inventoryManagementService, 'vehicleSnapshot').mockResolvedValue({ id: 'vehicle', active: true } as any));
    spies.push(spyOn(inventoryManagementService, 'supplierSnapshot').mockResolvedValue({ id: 'supplier', name: 'Private supplier' } as any));
    spies.push(spyOn(inventoryManagementService, 'activityCalculationData').mockResolvedValue([{
      id: 'activity-rate', activityId: 'activity', supplierId: 'supplier', status: 'ACTIVE',
      validFrom: '2026-01-01', validTo: '2026-12-31', pricingModel: 'PER_PERSON',
      pricingComponents: { adult: 1250 }, availabilityStatus: 'AVAILABLE',
    }] as any));
    spies.push(spyOn(inventoryManagementService, 'transportCalculationData').mockResolvedValue([{
      id: 'transport-rate', vehicleCategoryId: 'vehicle', supplierId: 'supplier', status: 'ACTIVE',
      validFrom: '2026-01-01', validTo: '2026-12-31', serviceType: 'MULTI_DAY_JOURNEY',
      pricingUnit: 'PER_DAY', baseRate: 2500, inclusions: {}, availabilityStatus: 'AVAILABLE',
    }] as any));
    const app = express();
    app.use(express.json());
    // Authentication is covered separately. Exercise real routers, role gates,
    // resource policy, calculation engines and projections with trusted fixtures.
    app.use((req, _res, next) => {
      req.user = { id: 'employee', employeeId: 'employee', uid: 'employee', firebaseUid: 'firebase-user', role, active: true, name: 'Employee', email: 'audit@example.test', salesTeamId: 'team' };
      next();
    });
    app.use('/activities', activitiesRouter);
    app.use('/transport', transportRouter);
    server = app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    spies.splice(0).forEach(spy => spy.mockRestore());
    APP_CONFIG.DEMO_MODE = previousDemo;
    const tripIndex = DEMO_TRIPS.findIndex(trip => trip.id === 'audit-calculation-trip');
    if (tripIndex >= 0) DEMO_TRIPS.splice(tripIndex, 1);
  });
  async function calculate(kind: 'activities' | 'transport') {
    const response = await fetch(`${base}/${kind}/calculate-rate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tripId: 'audit-calculation-trip', activityId: 'activity', date: '2026-10-01', adults: 2,
        vehicleCategoryId: 'vehicle', startDate: '2026-10-01', serviceType: 'MULTI_DAY_JOURNEY', vehicleDays: 2 }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  }
  it('returns availability to assigned Operations without amount aliases, supplier identity or breakdowns', async () => {
    for (const kind of ['activities', 'transport'] as const) {
      const data = await calculate(kind);
      expect(data.available).toBe(true);
      expect(data.totalAmount).toBeUndefined();
      expect(data.breakdown).toBeUndefined();
      expect(data.supplierCost).toBeUndefined();
      expect(data.supplierName).toBeUndefined();
      expect(data.rateId).toBeUndefined();
    }
  });
  it('preserves costs for authorized scoped Sales and Reservations', async () => {
    for (const authorizedRole of ['Sales Executive', 'Sales Manager', 'Reservations', 'Accounts'] as const) {
      role = authorizedRole;
      expect((await calculate('activities')).totalAmount).toBe(2500);
      expect((await calculate('transport')).totalAmount).toBe(5000);
    }
  });
  it('projects accommodation supplements and future cost fields without removing customer totals elsewhere', () => {
    const result = projectSupplierCalculation({ available: true, nights: 2, applicableSupplements: [{ displayAmount: 900 }],
      nightlyRateBreakdown: [{ amount: 8000 }], futureCostField: 4000 }, 'Operations');
    expect(result).toEqual({ available: true, nights: 2 });
    expect(projectSupplierCalculation({ available: true, totalAmount: 900 }, 'unknown')).toEqual({ available: true });
    expect(projectSupplierCalculation({ available: true, totalAmount: 900 }, 'Sales Executive')).toEqual({ available: true });
    expect(sanitizeFinancialData({ totalAmount: 2000 }, 'Operations')).toEqual({ totalAmount: 2000 });
  });
});

describe('production configuration', () => {
  it('never selects ephemeral demo storage in production even when both demo flags are enabled', () => {
    for (const nodeEnv of ['production', 'development']) {
      const result = Bun.spawnSync([process.execPath, '-e', "import { APP_CONFIG } from './src/config.ts'; console.log(JSON.stringify(APP_CONFIG));"], {
        cwd: process.cwd(), env: { ...process.env, NODE_ENV: nodeEnv, BBOS_DEMO_MODE: 'true', VITE_BBOS_DEMO_MODE: 'true' },
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout.toString()).DEMO_MODE).toBe(nodeEnv !== 'production');
    }
  });
});

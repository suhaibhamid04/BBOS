import { afterEach, describe, expect, it } from 'bun:test';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../src/config';
import { tripsRouter } from '../../server/routes/trips';
import { quotesRouter } from '../../server/routes/quotes';
import { sanitizeFinancialData } from '../../server/middleware/financialGuard';
import { authorizeResource, resolveQueryScope } from '../../server/authorization/policyEngine';
import {
  applyFirestoreQueryScope,
  assertRawListScope,
  scopeInMemoryRecords,
} from '../../server/authorization/scopedList';
import { quoteResourceContext, tripResourceContext } from '../../server/authorization/resourceContext';
import type { AuthorizationPrincipal } from '../../server/authorization/policyTypes';

function principal(
  role: string,
  employeeId: string,
  salesTeamId?: string,
): AuthorizationPrincipal {
  return {
    firebaseUid: `firebase:${employeeId}`,
    employeeId,
    role,
    active: true,
    ...(salesTeamId ? { salesTeamId } : {}),
  };
}

const trips = [
  { id: 'trip-own', assignedSalesEmployeeId: 'exec-1', salesTeamId: 'team-a', status: 'DRAFT' },
  { id: 'trip-same-team', assignedSalesEmployeeId: 'exec-2', salesTeamId: 'team-a', status: 'BOOKED', assignedReservationsEmployeeId: 'res-1', assignedOperationsEmployeeId: 'ops-1' },
  { id: 'trip-other-team', assignedSalesEmployeeId: 'exec-3', salesTeamId: 'team-b', status: 'BOOKED', assignedReservationsEmployeeId: 'res-2', assignedOperationsEmployeeId: 'ops-2' },
  { id: 'trip-missing-owner', salesTeamId: 'team-a', status: 'DRAFT' },
  { id: 'trip-missing-team', assignedSalesEmployeeId: 'exec-4', status: 'DRAFT' },
];

const quotes = [
  { id: 'quote-own', salesEmployeeId: 'exec-1', salesTeamId: 'team-a', status: 'SENT' },
  { id: 'quote-same-team', salesEmployeeId: 'exec-2', salesTeamId: 'team-a', status: 'SENT' },
  { id: 'quote-other-team', salesEmployeeId: 'exec-3', salesTeamId: 'team-b', status: 'SENT' },
  { id: 'quote-missing-owner', salesTeamId: 'team-a', status: 'SENT' },
  { id: 'quote-missing-team', salesEmployeeId: 'exec-4', status: 'SENT' },
];

describe('Stage C.1 scoped trip listing', () => {
  it('returns only OWN trips to a Sales Executive and does not widen on missing metadata', () => {
    const result = scopeInMemoryRecords(
      principal('Sales Executive', 'exec-1', 'team-a'),
      'TRIP',
      'READ_DETAIL',
      trips,
      tripResourceContext,
    );
    expect(result.map(trip => trip.id)).toEqual(['trip-own']);
  });

  it('returns same-team trips to a Sales Manager and excludes other/missing teams', () => {
    const result = scopeInMemoryRecords(
      principal('Sales Manager', 'manager-1', 'team-a'),
      'TRIP',
      'READ_DETAIL',
      trips,
      tripResourceContext,
    );
    expect(result.map(trip => trip.id)).toEqual(['trip-own', 'trip-same-team', 'trip-missing-owner']);
    expect(result.some(trip => trip.id === 'trip-other-team')).toBe(false);
    expect(result.some(trip => trip.id === 'trip-missing-team')).toBe(false);
  });

  it('enforces Reservations and Operations assignment plus workflow state', () => {
    const reservations = scopeInMemoryRecords(
      principal('Reservations', 'res-1'), 'TRIP', 'READ_DETAIL', trips, tripResourceContext,
    );
    const operations = scopeInMemoryRecords(
      principal('Operations', 'ops-1'), 'TRIP', 'READ_DETAIL', trips, tripResourceContext,
    );
    expect(reservations.map(trip => trip.id)).toEqual(['trip-same-team']);
    expect(operations.map(trip => trip.id)).toEqual(['trip-same-team']);
  });

  it('denies Marketing raw trip scope', () => {
    const descriptor = resolveQueryScope(principal('Marketing', 'mkt-1'), 'TRIP', 'READ_DETAIL');
    expect(descriptor.scope).toBe('NONE');
    expect(() => assertRawListScope(descriptor)).toThrow('not authorized');
  });

  it('translates OWN, TEAM, and ASSIGNED into Firestore where clauses before reads', () => {
    const calls: Array<[string, string, unknown]> = [];
    const query = {
      where(field: string, operator: string, value: unknown) {
        calls.push([field, operator, value]);
        return this;
      },
    };

    applyFirestoreQueryScope(query, resolveQueryScope(principal('Sales Executive', 'exec-1'), 'TRIP', 'READ_DETAIL'));
    expect(calls).toEqual([['assignedSalesEmployeeId', '==', 'exec-1']]);

    calls.length = 0;
    applyFirestoreQueryScope(query, resolveQueryScope(principal('Sales Manager', 'mgr-1', 'team-a'), 'TRIP', 'READ_DETAIL'));
    expect(calls).toEqual([['salesTeamId', '==', 'team-a']]);

    calls.length = 0;
    applyFirestoreQueryScope(query, resolveQueryScope(principal('Operations', 'ops-1'), 'TRIP', 'READ_DETAIL'));
    expect(calls[0]).toEqual(['assignedOperationsEmployeeId', '==', 'ops-1']);
    expect(calls[1][0]).toBe('status');
    expect(calls[1][1]).toBe('in');
  });
});

describe('Stage C.1 scoped quote listing', () => {
  it('enforces OWN and TEAM without exposing other-team or metadata-deficient quotes', () => {
    const executive = scopeInMemoryRecords(
      principal('Sales Executive', 'exec-1', 'team-a'), 'QUOTE', 'READ_DETAIL', quotes, quoteResourceContext,
    );
    const manager = scopeInMemoryRecords(
      principal('Sales Manager', 'manager-1', 'team-a'), 'QUOTE', 'READ_DETAIL', quotes, quoteResourceContext,
    );
    expect(executive.map(quote => quote.id)).toEqual(['quote-own']);
    expect(manager.map(quote => quote.id)).toEqual(['quote-own', 'quote-same-team', 'quote-missing-owner']);
    expect(manager.some(quote => quote.id === 'quote-other-team')).toBe(false);
    expect(manager.some(quote => quote.id === 'quote-missing-team')).toBe(false);
  });

  it('denies Reservations, Operations, and Marketing raw quotes', () => {
    for (const role of ['Reservations', 'Operations', 'Marketing']) {
      const descriptor = resolveQueryScope(principal(role, `${role}-1`), 'QUOTE', 'READ_DETAIL');
      expect(descriptor.scope).toBe('NONE');
      expect(() => assertRawListScope(descriptor)).toThrow('not authorized');
    }
  });
});

describe('Stage C.1 Sales financial policy convergence', () => {
  const data = {
    totalSellingPrice: 100_000,
    totalSupplierCost: 70_000,
    grossProfit: 30_000,
    grossMargin: 30,
  };

  it('shows all financial fields for Sales Executive OWN and Sales Manager TEAM decisions', () => {
    const executive = principal('Sales Executive', 'exec-1', 'team-a');
    const executiveDecision = authorizeResource(
      executive, 'TRIP', 'READ_DETAIL', tripResourceContext(trips[0]),
    );
    const manager = principal('Sales Manager', 'manager-1', 'team-a');
    const managerDecision = authorizeResource(
      manager, 'TRIP', 'READ_DETAIL', tripResourceContext(trips[0]),
    );

    expect(sanitizeFinancialData(data, executive.role, executiveDecision)).toEqual(data);
    expect(sanitizeFinancialData(data, manager.role, managerDecision)).toEqual(data);
  });

  it('fails closed when a Sales financial response lacks an allowed resource decision', () => {
    const response = sanitizeFinancialData(data, 'Sales Executive');
    expect(response.totalSupplierCost).toBeUndefined();
    expect(response.grossProfit).toBeUndefined();
  });
});

describe('Stage C.1 list endpoint integration', () => {
  const originalDemoMode = APP_CONFIG.DEMO_MODE;

  afterEach(() => {
    APP_CONFIG.DEMO_MODE = originalDemoMode;
  });

  async function invokeList(
    router: any,
    role: string,
    employeeId: string,
    salesTeamId?: string,
  ) {
    APP_CONFIG.DEMO_MODE = true;
    const layer = router.stack.find((entry: any) => entry.route?.path === '/' && entry.route.methods.get);
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    let statusCode = 200;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: any) { body = payload; return this; },
    } as unknown as Response;
    const request = {
      query: {},
      user: {
        id: `compat:${employeeId}`,
        uid: employeeId,
        firebaseUid: `firebase:${employeeId}`,
        employeeId,
        role,
        active: true,
        name: role,
        email: `${employeeId}@example.com`,
        ...(salesTeamId ? { salesTeamId } : {}),
      },
    } as unknown as Request;
    await handler(request, response);
    return { statusCode, body };
  }

  it('scopes demo trip lists for Executive and Manager and denies Marketing', async () => {
    const owner = await invokeList(tripsRouter, 'Sales Executive', 'emp-sales-01', 'sales-team-01');
    expect(owner.statusCode).toBe(200);
    expect(owner.body.data.map((trip: any) => trip.id)).toEqual(['trip-demo-01']);
    expect(owner.body.data[0].totalSupplierCost).toBe(55_400);

    const otherExecutive = await invokeList(tripsRouter, 'Sales Executive', 'emp-sales-02', 'sales-team-01');
    expect(otherExecutive.body.data).toEqual([]);

    const sameTeamManager = await invokeList(tripsRouter, 'Sales Manager', 'emp-mgr-01', 'sales-team-01');
    expect(sameTeamManager.body.data.map((trip: any) => trip.id)).toEqual(['trip-demo-01']);

    const otherTeamManager = await invokeList(tripsRouter, 'Sales Manager', 'emp-mgr-02', 'sales-team-02');
    expect(otherTeamManager.body.data).toEqual([]);

    const marketing = await invokeList(tripsRouter, 'Marketing', 'emp-mkt-01');
    expect(marketing.statusCode).toBe(403);
  });

  it('scopes quote lists and rejects Operations raw access', async () => {
    const owner = await invokeList(quotesRouter, 'Sales Executive', 'emp-sales-01', 'sales-team-01');
    expect(owner.body.data.map((quote: any) => quote.id)).toEqual(['quote-demo-01']);
    expect(owner.body.data[0].totalSupplierCost).toBe(65_000);

    const otherExecutive = await invokeList(quotesRouter, 'Sales Executive', 'emp-sales-02', 'sales-team-01');
    expect(otherExecutive.body.data).toEqual([]);

    const sameTeamManager = await invokeList(quotesRouter, 'Sales Manager', 'emp-mgr-01', 'sales-team-01');
    expect(sameTeamManager.body.data.map((quote: any) => quote.id)).toEqual(['quote-demo-01']);

    const otherTeamManager = await invokeList(quotesRouter, 'Sales Manager', 'emp-mgr-02', 'sales-team-02');
    expect(otherTeamManager.body.data).toEqual([]);

    const operations = await invokeList(quotesRouter, 'Operations', 'emp-ops-01');
    expect(operations.statusCode).toBe(403);

    const marketing = await invokeList(quotesRouter, 'Marketing', 'emp-mkt-01');
    expect(marketing.statusCode).toBe(403);

    const reservations = await invokeList(quotesRouter, 'Reservations', 'emp-res-01');
    expect(reservations.statusCode).toBe(403);
  });
});

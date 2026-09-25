import { afterEach, describe, expect, it } from 'bun:test';
import type { Request, Response } from 'express';
import { APP_CONFIG } from '../../src/config';
import { tripsRouter } from '../../server/routes/trips';
import { quotesRouter } from '../../server/routes/quotes';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../../server/authorization/assertAuthorizedResource';
import { authorizeResource, resolveQueryScope } from '../../server/authorization/policyEngine';
import { bookingResourceContext, quoteResourceContext, tripResourceContext } from '../../server/authorization/resourceContext';
import { buildResourceDto } from '../../server/authorization/resourceDto';
import type { AuthorizationPrincipal, ResourceContext } from '../../server/authorization/policyTypes';

function principal(
  role: string,
  employeeId: string,
  overrides: Partial<AuthorizationPrincipal> = {},
): AuthorizationPrincipal {
  return {
    firebaseUid: `firebase:${employeeId}`,
    employeeId,
    role,
    active: true,
    ...overrides,
  };
}

const ownTrip: ResourceContext = {
  resourceId: 'trip-1',
  ownerEmployeeId: 'exec-1',
  salesTeamId: 'team-a',
  assignedReservationsEmployeeId: 'res-1',
  assignedOperationsEmployeeId: 'ops-1',
  status: 'BOOKED',
};

describe('Stage C centralized authorization policy', () => {
  it('covers all eight roles with explicit scopes', () => {
    const cases: Array<{
      role: string;
      employeeId: string;
      team?: string;
      resource: any;
      action: any;
      context: ResourceContext;
      scope: string;
    }> = [
      { role: 'Founder', employeeId: 'founder-1', resource: 'TRIP', action: 'READ_DETAIL', context: {}, scope: 'ALL' },
      { role: 'Admin', employeeId: 'admin-1', resource: 'BOOKING', action: 'READ_DETAIL', context: {}, scope: 'ALL' },
      { role: 'Accounts', employeeId: 'accounts-1', resource: 'QUOTE', action: 'READ_FINANCIALS', context: {}, scope: 'ALL' },
      { role: 'Sales Manager', employeeId: 'manager-1', team: 'team-a', resource: 'TRIP', action: 'READ_DETAIL', context: ownTrip, scope: 'TEAM' },
      { role: 'Sales Executive', employeeId: 'exec-1', resource: 'TRIP', action: 'READ_DETAIL', context: ownTrip, scope: 'OWN' },
      { role: 'Reservations', employeeId: 'res-1', resource: 'BOOKING', action: 'READ_DETAIL', context: { ...ownTrip, status: 'CONFIRMED' }, scope: 'ASSIGNED' },
      { role: 'Operations', employeeId: 'ops-1', resource: 'BOOKING', action: 'READ_OPERATIONAL', context: { ...ownTrip, status: 'IN_OPERATIONS' }, scope: 'ASSIGNED' },
      { role: 'Marketing', employeeId: 'marketing-1', resource: 'ATTRIBUTION_REPORT', action: 'READ_AGGREGATE', context: {}, scope: 'AGGREGATE' },
    ];

    for (const item of cases) {
      const result = authorizeResource(
        principal(item.role, item.employeeId, item.team ? { salesTeamId: item.team } : {}),
        item.resource,
        item.action,
        item.context,
      );
      expect(result.allowed).toBe(true);
      expect(result.scope).toBe(item.scope);
    }
  });

  it('enforces Sales Executive OWN, not same-role or same-team access', () => {
    const exec = principal('Sales Executive', 'exec-1', { salesTeamId: 'team-a' });
    expect(authorizeResource(exec, 'TRIP', 'READ_DETAIL', ownTrip).allowed).toBe(true);
    expect(authorizeResource(exec, 'TRIP', 'READ_DETAIL', { ...ownTrip, ownerEmployeeId: 'exec-2' }).allowed).toBe(false);
    expect(authorizeResource(exec, 'TRIP', 'READ_DETAIL', { ...ownTrip, ownerEmployeeId: 'exec-3', salesTeamId: 'team-b' }).allowed).toBe(false);
  });

  it('enforces Sales Manager TEAM and fails closed when either team identifier is missing', () => {
    const manager = principal('Sales Manager', 'manager-1', { salesTeamId: 'team-a' });
    expect(authorizeResource(manager, 'QUOTE', 'READ_DETAIL', ownTrip).allowed).toBe(true);
    expect(authorizeResource(manager, 'QUOTE', 'READ_DETAIL', { ...ownTrip, salesTeamId: 'team-b' }).allowed).toBe(false);
    expect(authorizeResource(manager, 'QUOTE', 'READ_DETAIL', { ...ownTrip, salesTeamId: undefined }).code).toBe('MISSING_SCOPE_METADATA');
    expect(authorizeResource(principal('Sales Manager', 'manager-1'), 'QUOTE', 'READ_DETAIL', ownTrip).code).toBe('MISSING_SCOPE_METADATA');
  });

  it('keeps Reservations inventory ALL separate from assigned commercial resources', () => {
    const reservations = principal('Reservations', 'res-1');
    expect(authorizeResource(reservations, 'INVENTORY', 'READ_INVENTORY', {}).scope).toBe('ALL');
    expect(authorizeResource(reservations, 'BOOKING', 'READ_DETAIL', { ...ownTrip, status: 'CONFIRMED' }).allowed).toBe(true);
    expect(authorizeResource(reservations, 'BOOKING', 'READ_DETAIL', { ...ownTrip, assignedReservationsEmployeeId: 'res-2', status: 'CONFIRMED' }).allowed).toBe(false);
    expect(authorizeResource(reservations, 'BOOKING', 'READ_DETAIL', { ...ownTrip, assignedReservationsEmployeeId: undefined, status: 'CONFIRMED' }).code).toBe('MISSING_SCOPE_METADATA');
  });

  it('enforces Operations assignment and supported workflow state', () => {
    const operations = principal('Operations', 'ops-1');
    expect(authorizeResource(operations, 'BOOKING', 'READ_OPERATIONAL', { ...ownTrip, status: 'IN_OPERATIONS' }).allowed).toBe(true);
    expect(authorizeResource(operations, 'BOOKING', 'READ_OPERATIONAL', { ...ownTrip, assignedOperationsEmployeeId: 'ops-2', status: 'IN_OPERATIONS' }).allowed).toBe(false);
    expect(authorizeResource(operations, 'BOOKING', 'READ_OPERATIONAL', { ...ownTrip, status: 'PENDING_PAYMENT' }).code).toBe('WORKFLOW_STATE_DENIED');
  });

  it('allows Accounts finance reads without granting commercial mutation', () => {
    const accounts = principal('Accounts', 'accounts-1');
    expect(authorizeResource(accounts, 'QUOTE', 'READ_FINANCIALS', {}).allowed).toBe(true);
    expect(authorizeResource(accounts, 'QUOTE', 'UPDATE_COMMERCIAL', { status: 'DRAFT' }).allowed).toBe(false);
  });

  it('denies Marketing raw detail while permitting aggregate attribution only', () => {
    const marketing = principal('Marketing', 'marketing-1');
    expect(authorizeResource(marketing, 'TRIP', 'READ_DETAIL', ownTrip).allowed).toBe(false);
    expect(authorizeResource(marketing, 'ATTRIBUTION_REPORT', 'READ_AGGREGATE', {}).allowed).toBe(true);
  });

  it('fails closed for unknown roles, inactive principals, and malformed contexts', () => {
    expect(authorizeResource(principal('Super User', 'bad-1'), 'TRIP', 'READ_DETAIL', ownTrip).code).toBe('UNKNOWN_ROLE');
    expect(authorizeResource(principal('Admin', 'admin-1', { active: false }), 'TRIP', 'READ_DETAIL', {}).code).toBe('INVALID_PRINCIPAL');
    expect(authorizeResource(principal('Admin', 'admin-1'), 'TRIP', 'READ_DETAIL', { ownerEmployeeId: 42 } as any).code).toBe('MALFORMED_CONTEXT');
  });

  it('denies unsupported states, missing ownership, stale assignments, and guessed IDs', () => {
    const exec = principal('Sales Executive', 'exec-1');
    const reservations = principal('Reservations', 'res-1');
    expect(authorizeResource(exec, 'TRIP', 'READ_DETAIL', { status: 'DRAFT' }).code).toBe('MISSING_SCOPE_METADATA');
    expect(authorizeResource(exec, 'TRIP', 'READ_DETAIL', { ...ownTrip, resourceId: 'guessed-id', ownerEmployeeId: 'exec-2' }).allowed).toBe(false);
    expect(authorizeResource(reservations, 'TRIP', 'READ_DETAIL', { ...ownTrip, assignedReservationsEmployeeId: 'former-res', status: 'BOOKED' }).allowed).toBe(false);
    expect(authorizeResource(reservations, 'TRIP', 'READ_DETAIL', { ...ownTrip, status: 'DRAFT' }).code).toBe('WORKFLOW_STATE_DENIED');
  });

  it('keeps historical ownership stable when an employee changes teams', () => {
    const transferredExec = principal('Sales Executive', 'exec-1', { salesTeamId: 'team-new' });
    expect(authorizeResource(transferredExec, 'TRIP', 'READ_DETAIL', ownTrip).allowed).toBe(true);
    expect(tripResourceContext({ assignedSalesEmployeeId: 'exec-1', salesTeamId: 'team-a' }).ownerEmployeeId).toBe('exec-1');
  });

  it('supports approval-aware denial without implementing an approval engine', () => {
    const exec = principal('Sales Executive', 'exec-1');
    expect(authorizeResource(exec, 'QUOTE', 'CONVERT_TO_BOOKING', {
      ...ownTrip,
      status: 'SENT',
      approval: { required: true, state: 'PENDING' },
    }).code).toBe('APPROVAL_REQUIRED');
    expect(authorizeResource(exec, 'QUOTE', 'CONVERT_TO_BOOKING', {
      ...ownTrip,
      status: 'SENT',
      approval: { required: true, state: 'APPROVED' },
    }).allowed).toBe(true);
  });

  it('assert helper returns a consistent 403 error for authenticated IDOR attempts', () => {
    try {
      assertAuthorizedResource(principal('Sales Executive', 'exec-2'), 'TRIP', 'READ_DETAIL', ownTrip);
      throw new Error('Expected authorization denial');
    } catch (error) {
      expect(error).toBeInstanceOf(ResourceAuthorizationError);
      expect((error as ResourceAuthorizationError).statusCode).toBe(403);
      expect((error as ResourceAuthorizationError).code).toBe('RESOURCE_ACCESS_DENIED');
      expect((error as Error).message).not.toContain('trip-1');
    }
  });

  it('normalizes existing resource-specific owner fields into canonical context', () => {
    expect(tripResourceContext({ id: 't1', assignedSalesEmployeeId: 'e1' }).ownerEmployeeId).toBe('e1');
    expect(quoteResourceContext({ id: 'q1', salesEmployeeId: 'e2' }).ownerEmployeeId).toBe('e2');
    expect(bookingResourceContext({ id: 'b1', assignedSalesEmployeeId: 'e3' }).ownerEmployeeId).toBe('e3');
  });

  it('produces structured query descriptors for ALL, TEAM, OWN, ASSIGNED, and AGGREGATE', () => {
    expect(resolveQueryScope(principal('Admin', 'admin-1'), 'TRIP', 'READ_DETAIL').scope).toBe('ALL');
    expect(resolveQueryScope(principal('Sales Manager', 'manager-1', { salesTeamId: 'team-a' }), 'TRIP', 'READ_DETAIL')).toMatchObject({
      scope: 'TEAM', constraints: [{ field: 'salesTeamId', operator: '==', value: 'team-a' }],
    });
    expect(resolveQueryScope(principal('Sales Executive', 'exec-1'), 'QUOTE', 'READ_DETAIL')).toMatchObject({
      scope: 'OWN', constraints: [{ field: 'salesEmployeeId', operator: '==', value: 'exec-1' }],
    });
    const reservationsScope = resolveQueryScope(principal('Reservations', 'res-1'), 'BOOKING', 'READ_DETAIL');
    expect(reservationsScope.scope).toBe('ASSIGNED');
    expect(reservationsScope.constraints).toContainEqual(
      { field: 'assignedReservationsEmployeeId', operator: '==', value: 'res-1' },
    );
    expect(reservationsScope.constraints).toContainEqual(
      { field: 'status', operator: 'in', value: ['CONFIRMED', 'IN_OPERATIONS', 'TRAVELLING', 'COMPLETED'] },
    );
    expect(resolveQueryScope(principal('Marketing', 'mkt-1'), 'ATTRIBUTION_REPORT', 'READ_AGGREGATE')).toMatchObject({
      scope: 'AGGREGATE', aggregateOnly: true,
    });
    expect(resolveQueryScope(principal('Sales Manager', 'manager-1'), 'TRIP', 'READ_DETAIL').scope).toBe('NONE');
  });
});

describe('Stage C resource DTO foundation', () => {
  const financialResource = {
    id: 'trip-1',
    totalSellingPrice: 100_000,
    totalSupplierCost: 70_000,
    grossProfit: 30_000,
    grossMargin: 30,
    itinerary: [{ supplierCost: 20_000, operationalNotes: 'Call driver' }],
  };

  function dtoFor(role: string, employeeId: string, context: ResourceContext, team?: string) {
    const actor = principal(role, employeeId, team ? { salesTeamId: team } : {});
    const auth = authorizeResource(actor, 'TRIP', 'READ_DETAIL', context);
    return buildResourceDto(actor, 'TRIP', financialResource, auth) as any;
  }

  it('returns full commercial financials for Sales Executive OWN and Sales Manager TEAM', () => {
    for (const dto of [
      dtoFor('Sales Executive', 'exec-1', ownTrip),
      dtoFor('Sales Manager', 'manager-1', ownTrip, 'team-a'),
    ]) {
      expect(dto.totalSupplierCost).toBe(70_000);
      expect(dto.totalSellingPrice).toBe(100_000);
      expect(dto.grossProfit).toBe(30_000);
      expect(dto.grossMargin).toBe(30);
    }
  });

  it('returns supplier costs but not package profit for assigned Reservations', () => {
    const dto = dtoFor('Reservations', 'res-1', ownTrip);
    expect(dto.totalSupplierCost).toBe(70_000);
    expect(dto.totalSellingPrice).toBe(100_000);
    expect(dto.grossProfit).toBeUndefined();
    expect(dto.grossMargin).toBeUndefined();
  });

  it('returns operational fields without costs, selling amounts, or profit for assigned Operations', () => {
    const dto = dtoFor('Operations', 'ops-1', ownTrip);
    expect(dto.itinerary[0].operationalNotes).toBe('Call driver');
    expect(dto.itinerary[0].supplierCost).toBeUndefined();
    expect(dto.totalSupplierCost).toBeUndefined();
    expect(dto.totalSellingPrice).toBeUndefined();
    expect(dto.grossProfit).toBeUndefined();
  });

  it('returns full finance data for Accounts and Founder/Admin', () => {
    for (const role of ['Accounts', 'Founder', 'Admin']) {
      const dto = dtoFor(role, `${role.toLowerCase()}-1`, ownTrip);
      expect(dto.totalSupplierCost).toBe(70_000);
      expect(dto.grossProfit).toBe(30_000);
    }
  });

  it('refuses to build any DTO from a denied record decision', () => {
    const actor = principal('Marketing', 'mkt-1');
    const denied = authorizeResource(actor, 'TRIP', 'READ_DETAIL', ownTrip);
    expect(() => buildResourceDto(actor, 'TRIP', financialResource, denied)).toThrow('denied authorization');
  });
});

describe('Stage C representative trip detail integration', () => {
  const originalDemoMode = APP_CONFIG.DEMO_MODE;

  afterEach(() => {
    APP_CONFIG.DEMO_MODE = originalDemoMode;
  });

  async function invokeTripDetail(employeeId: string, tripId: string) {
    APP_CONFIG.DEMO_MODE = true;
    const layer = (tripsRouter as any).stack.find(
      (entry: any) => entry.route?.path === '/:id' && entry.route.methods.get,
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    let statusCode = 200;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: any) { body = payload; return this; },
    } as unknown as Response;
    const request = {
      params: { id: tripId },
      user: {
        id: employeeId,
        uid: employeeId,
        firebaseUid: `demo:${employeeId}`,
        employeeId,
        role: 'Sales Executive',
        active: true,
        name: 'Test Executive',
        email: 'exec@example.com',
      },
    } as unknown as Request;
    await handler(request, response);
    return { statusCode, body };
  }

  it('returns full financial detail to the owning Sales Executive', async () => {
    const response = await invokeTripDetail('emp-sales-01', 'trip-demo-01');
    expect(response.statusCode).toBe(200);
    expect(response.body.data.totalSupplierCost).toBe(55_400);
    expect(response.body.data.grossProfit).toBe(27_100);
  });

  it('returns 403 for another Executive and 404 for a guessed missing ID', async () => {
    expect((await invokeTripDetail('emp-sales-02', 'trip-demo-01')).statusCode).toBe(403);
    expect((await invokeTripDetail('emp-sales-01', 'trip-does-not-exist')).statusCode).toBe(404);
  });
});

describe('Stage C representative quote detail integration', () => {
  const originalDemoMode = APP_CONFIG.DEMO_MODE;

  afterEach(() => {
    APP_CONFIG.DEMO_MODE = originalDemoMode;
  });

  async function invokeQuoteDetail(employeeId: string, teamId: string | undefined, quoteId: string) {
    APP_CONFIG.DEMO_MODE = true;
    const layer = (quotesRouter as any).stack.find(
      (entry: any) => entry.route?.path === '/:id' && entry.route.methods.get,
    );
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;
    let statusCode = 200;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: any) { body = payload; return this; },
    } as unknown as Response;
    const request = {
      params: { id: quoteId },
      user: {
        id: employeeId,
        uid: employeeId,
        firebaseUid: `demo:${employeeId}`,
        employeeId,
        role: teamId ? 'Sales Manager' : 'Sales Executive',
        active: true,
        name: 'Test Sales User',
        email: 'sales@example.com',
        ...(teamId ? { salesTeamId: teamId } : {}),
      },
    } as unknown as Request;
    await handler(request, response);
    return { statusCode, body };
  }

  it('returns full financial detail for the owner and same-team manager', async () => {
    const owner = await invokeQuoteDetail('emp-sales-01', undefined, 'quote-demo-01');
    expect(owner.statusCode).toBe(200);
    expect(owner.body.data.totalSupplierCost).toBe(65_000);
    expect(owner.body.data.grossProfit).toBe(25_000);

    const manager = await invokeQuoteDetail('emp-mgr-01', 'sales-team-01', 'quote-demo-01');
    expect(manager.statusCode).toBe(200);
    expect(manager.body.data.grossMargin).toBe(27.8);
  });

  it('denies another Executive and does not return a guessed missing quote', async () => {
    expect((await invokeQuoteDetail('emp-sales-02', undefined, 'quote-demo-01')).statusCode).toBe(403);
    expect((await invokeQuoteDetail('emp-sales-01', undefined, 'quote-missing')).statusCode).toBe(404);
  });

  it('denies a Manager from another team', async () => {
    expect((await invokeQuoteDetail('emp-mgr-02', 'sales-team-02', 'quote-demo-01')).statusCode).toBe(403);
  });
});

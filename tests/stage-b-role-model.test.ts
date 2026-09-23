import { describe, expect, it, mock } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { createAuthenticate, requireRole } from '../server/middleware/auth';
import { sanitizeFinancialData } from '../server/middleware/financialGuard';
import { accommodationRouter } from '../server/routes/accommodation';
import { getRoleNavigationVisibility } from '../src/services/navigationAccess';
import { PRESET_USERS, ROLE_DEFINITIONS } from '../src/services/permissions';
import { DEMO_BOOKINGS, DEMO_TRIPS } from '../src/services/demoData';
import { isUserRole, USER_ROLES } from '../src/types';

const EXPECTED_ROLES = [
  'Founder',
  'Admin',
  'Accounts',
  'Sales Manager',
  'Sales Executive',
  'Reservations',
  'Operations',
  'Marketing',
] as const;

function buildResponse() {
  let statusCode = 200;
  let body: any;
  const response: Partial<Response> = {};
  response.status = mock((code: number) => {
    statusCode = code;
    return response as Response;
  }) as any;
  response.json = mock((value: any) => {
    body = value;
    return response as Response;
  }) as any;
  return {
    response: response as Response,
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

describe('Stage B canonical role model', () => {
  it('recognizes exactly the eight canonical production roles', () => {
    expect(USER_ROLES).toEqual(EXPECTED_ROLES);
    expect(new Set(USER_ROLES).size).toBe(8);
    for (const role of USER_ROLES) expect(isUserRole(role)).toBe(true);
    expect(isUserRole('Unknown Role')).toBe(false);
  });

  it('keeps permission definitions exhaustive against the canonical role list', () => {
    expect(Object.keys(ROLE_DEFINITIONS).sort()).toEqual([...USER_ROLES].sort());
    for (const role of USER_ROLES) expect(ROLE_DEFINITIONS[role].role).toBe(role);
  });

  it('gives Reservations conservative supplier-facing UX permissions', () => {
    const permissions = ROLE_DEFINITIONS.Reservations;
    expect(permissions.canManageReservations).toBe(true);
    expect(permissions.canViewSupplierRates).toBe(true);
    expect(permissions.canViewFinancials).toBe(false);
    expect(permissions.canViewMargins).toBe(false);
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canManageSettings).toBe(false);
    expect(permissions.canManageOperations).toBe(false);
    expect(permissions.canManageBookings).toBe(false);
  });

  it('does not grant Reservations Founder/Admin middleware privileges', () => {
    const request = { user: { role: 'Reservations' } } as unknown as Request;
    const result = buildResponse();
    const next = mock(() => undefined) as unknown as NextFunction;
    requireRole(['Admin'])(request, result.response, next);

    expect(next).not.toHaveBeenCalled();
    expect(result.statusCode).toBe(403);
  });

  it('keeps Operations separate from Reservations and supplier-rate visibility', () => {
    const permissions = ROLE_DEFINITIONS.Operations;
    expect(permissions.canManageReservations).toBe(false);
    expect(permissions.canViewSupplierRates).toBe(false);
    expect(permissions.canManageOperations).toBe(true);
  });
});

describe('Stage B Reservations financial boundary', () => {
  const payload = {
    totalSupplierCost: 40_000,
    negotiatedBaseRate: 8_500,
    grossProfit: 10_000,
    grossMargin: 20,
  };

  it('exposes supplier cost inputs to Reservations but strips profit and margin', () => {
    const result = sanitizeFinancialData(payload, 'Reservations');
    expect(result.totalSupplierCost).toBe(40_000);
    expect(result.negotiatedBaseRate).toBe(8_500);
    expect(result.grossProfit).toBeUndefined();
    expect(result.grossMargin).toBeUndefined();
  });

  it('strips both supplier costs and margins for Operations and unknown roles', () => {
    for (const role of ['Operations', 'Unknown Role']) {
      const result = sanitizeFinancialData(payload, role);
      expect(result.totalSupplierCost).toBeUndefined();
      expect(result.negotiatedBaseRate).toBeUndefined();
      expect(result.grossProfit).toBeUndefined();
      expect(result.grossMargin).toBeUndefined();
    }
  });

  it('admits Reservations but rejects Operations on protected supplier-rate routes', () => {
    const route = (accommodationRouter as any).stack.find(
      (layer: any) => layer.route?.path === '/properties/:id/rates',
    );
    const guard = route.route.stack[0].handle;

    const reservationsNext = mock(() => undefined);
    guard(
      { user: { role: 'Reservations' } } as Request,
      buildResponse().response,
      reservationsNext,
    );
    expect(reservationsNext).toHaveBeenCalledTimes(1);

    const operationsResult = buildResponse();
    const operationsNext = mock(() => undefined);
    guard(
      { user: { role: 'Operations' } } as Request,
      operationsResult.response,
      operationsNext,
    );
    expect(operationsNext).not.toHaveBeenCalled();
    expect(operationsResult.statusCode).toBe(403);
  });
});

describe('Stage B demo and navigation behavior', () => {
  it('provides a Reservations demo persona and safe navigation without Operations access', () => {
    const demoUser = PRESET_USERS.find((user) => user.role === 'Reservations');
    expect(demoUser?.id).toBe('emp-res-01');

    const navigation = getRoleNavigationVisibility(ROLE_DEFINITIONS.Reservations);
    expect(navigation.inventory).toBe(true);
    expect(navigation.accommodation).toBe(true);
    expect(navigation.transport).toBe(true);
    expect(navigation.activities).toBe(true);
    expect(navigation.operations).toBe(false);
    expect(navigation.bookings).toBe(false);
    expect(navigation.crm).toBe(false);
    expect(navigation.sales).toBe(false);
  });

  it('resolves the Reservations demo identity only in explicit non-production demo mode', async () => {
    const demoRequest = { headers: { 'x-demo-user-id': 'emp-res-01' } } as unknown as Request;
    const demoResult = buildResponse();
    const demoNext = mock(() => undefined) as unknown as NextFunction;
    await createAuthenticate({ demoMode: true, nodeEnv: 'development' })(
      demoRequest,
      demoResult.response,
      demoNext,
    );
    expect(demoNext).toHaveBeenCalledTimes(1);
    expect(demoRequest.user?.role).toBe('Reservations');

    const disabledRequest = { headers: { 'x-demo-user-id': 'emp-res-01' } } as unknown as Request;
    const disabledResult = buildResponse();
    await createAuthenticate({ demoMode: false, nodeEnv: 'development' })(
      disabledRequest,
      disabledResult.response,
      mock(() => undefined) as unknown as NextFunction,
    );
    expect(disabledResult.statusCode).toBe(401);

    const productionRequest = { headers: { 'x-demo-user-id': 'emp-res-01' } } as unknown as Request;
    const productionResult = buildResponse();
    await createAuthenticate({ demoMode: true, nodeEnv: 'production' })(
      productionRequest,
      productionResult.response,
      mock(() => undefined) as unknown as NextFunction,
    );
    expect(productionResult.statusCode).toBe(401);
  });

  it('prepares stable employee assignments on booking and trip fixtures', () => {
    expect(DEMO_BOOKINGS[0].assignedReservationsEmployeeId).toBe('emp-res-01');
    expect(DEMO_TRIPS[0].assignedReservationsEmployeeId).toBe('emp-res-01');
  });
});

describe('Stage B targeted Firestore rate policy', () => {
  const rules = readFileSync('firestore.rules', 'utf8');

  it('recognizes Reservations and removes Operations from rate collection blocks', () => {
    expect(rules).toContain("getUserRole() == 'Reservations'");

    for (const collection of [
      'rate_periods',
      'rate_supplements',
      'negotiated_rates',
      'transport_rate_periods',
      'transport_supplements',
      'negotiated_transport_rates',
      'activity_rate_periods',
      'negotiated_activity_rates',
    ]) {
      const marker = `match /${collection}/`;
      const start = rules.indexOf(marker);
      const block = rules.slice(start, rules.indexOf('\n    }', start));
      expect(start).toBeGreaterThan(-1);
      expect(block).toContain('isReservations()');
      expect(block).not.toContain('isOperations()');
    }
  });
});

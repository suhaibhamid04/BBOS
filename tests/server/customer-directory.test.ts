import { describe, expect, it } from 'bun:test';
import { canAccessCustomerRecord, parseCustomerInput, projectCustomerDirectoryDto } from '../../server/routes/customers';

const executiveA = { firebaseUid: 'firebase-a', employeeId: 'sales-a', role: 'Sales Executive', active: true, salesTeamId: 'team-1' };
const executiveB = { firebaseUid: 'firebase-b', employeeId: 'sales-b', role: 'Sales Executive', active: true, salesTeamId: 'team-2' };
const managerA = { firebaseUid: 'firebase-manager', employeeId: 'manager-a', role: 'Sales Manager', active: true, salesTeamId: 'team-1' };
const founder = { firebaseUid: 'firebase-founder', employeeId: 'founder', role: 'Founder', active: true };
const customer = { id: 'customer-a', name: 'Scoped Customer', ownerEmployeeId: 'sales-a', salesTeamId: 'team-1' };
const teamOneLead = { id: 'lead-a', customerId: 'customer-a', assignedEmployeeId: 'sales-a', salesTeamId: 'team-1' };

describe('Sprint 1 canonical customer boundary', () => {
  it('applies OWN, TEAM and ALL using canonical employee metadata', () => {
    expect(canAccessCustomerRecord(executiveA, customer, [teamOneLead])).toBe(true);
    expect(canAccessCustomerRecord(executiveB, customer, [teamOneLead])).toBe(false);
    expect(canAccessCustomerRecord(managerA, customer, [teamOneLead])).toBe(true);
    expect(canAccessCustomerRecord(founder, customer, [])).toBe(true);
  });

  it('fails closed for missing resource scope and invalid principals', () => {
    expect(canAccessCustomerRecord(executiveA, { id: 'unowned' }, [])).toBe(false);
    expect(canAccessCustomerRecord(managerA, { id: 'unowned' }, [])).toBe(false);
    expect(() => canAccessCustomerRecord({ ...executiveA, active: false }, customer, [teamOneLead])).toThrow('active canonical employee');
    expect(() => canAccessCustomerRecord({ ...managerA, salesTeamId: undefined }, customer, [teamOneLead])).toThrow('Sales team metadata');
  });

  it('uses employeeId rather than Firebase UID as the business owner key', () => {
    expect(canAccessCustomerRecord({ ...executiveA, firebaseUid: 'sales-a', employeeId: 'different-employee' }, customer, [])).toBe(false);
  });

  it('rejects client attempts to forge ownership, team, employee, role, or financial fields', () => {
    for (const protectedField of ['ownerEmployeeId', 'salesTeamId', 'employeeId', 'role', 'supplierCost', 'profit']) {
      expect(() => parseCustomerInput({
        name: 'Forged Customer', phone: '+91 90000 00000', email: 'forged@example.test',
        city: 'Srinagar', customerType: 'B2C', preferences: [], notes: '', [protectedField]: 'forged',
      })).toThrow('server-controlled');
    }
  });

  it('projects an explicit DTO without ownership, normalized lookup, audit, or financial internals', () => {
    const dto = projectCustomerDirectoryDto({
      ...customer, phone: '+91 90000 00000', email: 'customer@example.test', city: 'Srinagar',
      customerType: 'B2C', preferences: ['quiet stays'], notes: 'customer note', totalBookings: 1,
      lifetimeValue: 50_000, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z',
      normalizedPhone: '919000000000', normalizedEmail: 'customer@example.test', grossProfit: 99_999,
      createdByEmployeeId: 'sales-a', audit: { secret: true },
    }) as Record<string, unknown>;
    expect(dto).toMatchObject({ id: 'customer-a', name: 'Scoped Customer', totalBookings: 1, lifetimeValue: 50_000 });
    for (const field of ['ownerEmployeeId', 'salesTeamId', 'normalizedPhone', 'normalizedEmail', 'grossProfit', 'createdByEmployeeId', 'audit']) {
      expect(dto[field]).toBeUndefined();
    }
  });
});

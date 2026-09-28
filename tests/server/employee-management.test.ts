import { describe, expect, it } from 'bun:test';
import {
  EmployeeManagementError,
  EmployeeManagementService,
  InMemoryEmployeeManagementStore,
  type EmployeeManagementActor,
  type LoginIdentityDirectory,
  type StoredEmployeeCandidate,
  type StoredSalesTeam,
} from '../../server/services/employeeManagementService';

class FakeLoginDirectory implements LoginIdentityDirectory {
  constructor(private readonly validUids = new Set<string>()) {}

  async validateFirebaseUid(firebaseUid: string): Promise<void> {
    if (!this.validUids.has(firebaseUid)) {
      throw new EmployeeManagementError(422, 'FIREBASE_IDENTITY_INVALID', 'Unknown Firebase UID.');
    }
  }
}

const founder: EmployeeManagementActor = {
  firebaseUid: 'firebase-founder',
  employeeId: 'emp-founder-01',
  role: 'Founder',
  active: true,
  name: 'Founder User',
};

const admin: EmployeeManagementActor = {
  firebaseUid: 'firebase-admin',
  employeeId: 'emp-admin-01',
  role: 'Admin',
  active: true,
  name: 'Admin User',
};

const salesActor: EmployeeManagementActor = {
  firebaseUid: 'firebase-sales',
  employeeId: 'emp-sales-01',
  role: 'Sales Executive',
  active: true,
  name: 'Sales User',
  salesTeamId: 'sales-team-01',
};

const employee = (
  employeeId: string,
  role: string,
  overrides: Record<string, unknown> = {},
): StoredEmployeeCandidate => ({
  documentId: overrides.documentId as string || employeeId,
  data: {
    employeeId,
    name: `Employee ${employeeId}`,
    email: `${employeeId}@bookingbridge.com`,
    role,
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdByEmployeeId: 'seed',
    updatedByEmployeeId: 'seed',
    ...overrides,
  },
});

const teams: StoredSalesTeam[] = [
  {
    documentId: 'sales-team-01',
    data: {
      id: 'sales-team-01',
      name: 'Sales Team One',
      managerEmployeeId: 'emp-manager-01',
      active: true,
    },
  },
  {
    documentId: 'sales-team-02',
    data: {
      id: 'sales-team-02',
      name: 'Sales Team Two',
      managerEmployeeId: 'emp-manager-02',
      active: true,
    },
  },
  {
    documentId: 'sales-team-inactive',
    data: {
      id: 'sales-team-inactive',
      name: 'Inactive Team',
      managerEmployeeId: 'emp-manager-inactive',
      active: false,
    },
  },
];

function setup(extraEmployees: StoredEmployeeCandidate[] = []) {
  const storage = new InMemoryEmployeeManagementStore({
    employees: [
      employee('emp-founder-01', 'Founder', { firebaseUid: 'firebase-founder' }),
      employee('emp-admin-01', 'Admin', { firebaseUid: 'firebase-admin' }),
      employee('emp-manager-01', 'Sales Manager', { salesTeamId: 'sales-team-01' }),
      employee('emp-manager-02', 'Sales Manager', { salesTeamId: 'sales-team-02' }),
      employee('emp-manager-inactive', 'Sales Manager', {
        salesTeamId: 'sales-team-inactive',
        active: false,
      }),
      employee('emp-sales-01', 'Sales Executive', {
        salesTeamId: 'sales-team-01',
        managerEmployeeId: 'emp-manager-01',
        historicalMarker: 'must-survive-profile-edits',
      }),
      ...extraEmployees,
    ],
    teams,
  });
  const directory = new FakeLoginDirectory(new Set([
    'firebase-founder',
    'firebase-admin',
    'firebase-new-user',
    'firebase-second-user',
  ]));
  return { storage, service: new EmployeeManagementService(storage, directory) };
}

describe('BBOS Employee & Access Management MVP', () => {
  it('allows Founder to create an employee with canonical identity and audit metadata', async () => {
    const { storage, service } = setup();
    const created = await service.createEmployee({
      employeeId: 'emp-res-02',
      name: 'Reservations User',
      email: 'RESERVATIONS@bookingbridge.com',
      firebaseUid: 'firebase-new-user',
      role: 'Reservations',
      active: true,
      department: 'Reservations',
      designation: 'Reservations Executive',
      phone: '+91 99999 00000',
      joiningDate: '2026-09-26',
    }, founder);

    expect(created).toMatchObject({
      employeeId: 'emp-res-02',
      email: 'reservations@bookingbridge.com',
      firebaseUid: 'firebase-new-user',
      role: 'Reservations',
      active: true,
      createdByEmployeeId: founder.employeeId,
      updatedByEmployeeId: founder.employeeId,
    });
    expect(created.accessSummary.scope).toBe('ASSIGNED Reservations scope');
    expect(storage.getRawEmployee('emp-res-02')).not.toHaveProperty('accessSummary');
    expect(storage.getAuditLogs()).toEqual([
      expect.objectContaining({
        action: 'EMPLOYEE_CREATED',
        actorId: founder.employeeId,
        entityId: 'emp-res-02',
      }),
    ]);
  });

  it('allows Admin to create an employee but rejects non-administrative roles', async () => {
    const { storage, service } = setup();
    const created = await service.createEmployee({
      employeeId: 'emp-accounts-02',
      name: 'Accounts User',
      email: 'accounts2@bookingbridge.com',
      role: 'Accounts',
      active: true,
      department: 'Finance',
    }, admin);
    expect(created.createdByEmployeeId).toBe(admin.employeeId);

    const writesBefore = (await storage.listEmployees()).length;
    await expect(service.createEmployee({
      employeeId: 'emp-marketing-02',
      name: 'Marketing User',
      email: 'marketing2@bookingbridge.com',
      role: 'Marketing',
      active: true,
    }, salesActor)).rejects.toMatchObject({ statusCode: 403, code: 'EMPLOYEE_ADMIN_FORBIDDEN' });
    expect(await storage.listEmployees()).toHaveLength(writesBefore);
  });

  it('uses exactly the canonical role model and rejects forged server fields', async () => {
    const { service } = setup();
    await expect(service.createEmployee({
      employeeId: 'emp-invalid-role',
      name: 'Invalid Role',
      email: 'invalid-role@bookingbridge.com',
      role: 'Super Admin',
      active: true,
    }, founder)).rejects.toMatchObject({ code: 'INVALID_EMPLOYEE_ROLE' });

    await expect(service.createEmployee({
      employeeId: 'emp-forged',
      name: 'Forged User',
      email: 'forged@bookingbridge.com',
      role: 'Marketing',
      active: true,
      createdAt: '1900-01-01T00:00:00.000Z',
      createdByEmployeeId: 'forged-actor',
    }, founder)).rejects.toMatchObject({ code: 'SERVER_FIELD_FORBIDDEN' });
  });

  it('enforces unique employeeId, work email, and Firebase UID', async () => {
    const { service } = setup([
      employee('emp-existing', 'Marketing', { firebaseUid: 'firebase-second-user' }),
    ]);
    const base = {
      name: 'Duplicate User',
      role: 'Marketing',
      active: true,
    };
    await expect(service.createEmployee({
      ...base,
      employeeId: 'emp-existing',
      email: 'new-email@bookingbridge.com',
    }, founder)).rejects.toMatchObject({ code: 'EMPLOYEE_ID_EXISTS' });
    await expect(service.createEmployee({
      ...base,
      employeeId: 'emp-new-email',
      email: 'EMP-EXISTING@bookingbridge.com',
    }, founder)).rejects.toMatchObject({ code: 'EMPLOYEE_EMAIL_EXISTS' });
    await expect(service.createEmployee({
      ...base,
      employeeId: 'emp-new-uid',
      email: 'new-uid@bookingbridge.com',
      firebaseUid: 'firebase-second-user',
    }, founder)).rejects.toMatchObject({ code: 'FIREBASE_UID_EXISTS' });
  });

  it('validates Firebase UID linkage before writing', async () => {
    const { storage, service } = setup();
    const countBefore = (await storage.listEmployees()).length;
    await expect(service.createEmployee({
      employeeId: 'emp-bad-firebase',
      name: 'Bad Firebase User',
      email: 'bad-firebase@bookingbridge.com',
      firebaseUid: 'missing-firebase-uid',
      role: 'Marketing',
      active: true,
    }, founder)).rejects.toMatchObject({ code: 'FIREBASE_IDENTITY_INVALID' });
    expect(await storage.listEmployees()).toHaveLength(countBefore);
  });

  it('validates Sales team and manager relationships', async () => {
    const { service } = setup();
    const valid = await service.createEmployee({
      employeeId: 'emp-sales-02',
      name: 'Sales Two',
      email: 'sales2@bookingbridge.com',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-01',
      managerEmployeeId: 'emp-manager-01',
    }, admin);
    expect(valid.accessSummary.scope).toBe('OWN Sales scope');

    await expect(service.createEmployee({
      employeeId: 'emp-sales-self',
      name: 'Self Manager',
      email: 'self@bookingbridge.com',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-01',
      managerEmployeeId: 'emp-sales-self',
    }, admin)).rejects.toMatchObject({ code: 'SELF_MANAGER_FORBIDDEN' });

    await expect(service.createEmployee({
      employeeId: 'emp-sales-wrong-manager',
      name: 'Wrong Manager',
      email: 'wrong-manager@bookingbridge.com',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-01',
      managerEmployeeId: 'emp-sales-01',
    }, admin)).rejects.toMatchObject({ code: 'MANAGER_INVALID' });

    await expect(service.createEmployee({
      employeeId: 'emp-sales-inactive-team',
      name: 'Inactive Team User',
      email: 'inactive-team@bookingbridge.com',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-inactive',
      managerEmployeeId: 'emp-manager-inactive',
    }, admin)).rejects.toMatchObject({ code: 'SALES_TEAM_INVALID' });
  });

  it('keeps employeeId immutable and preserves legacy document IDs and unrelated stored metadata', async () => {
    const { storage, service } = setup();
    await expect(service.updateEmployee('emp-sales-01', {
      employeeId: 'emp-renamed',
      name: 'Attempted Rename',
    }, founder)).rejects.toMatchObject({ code: 'EMPLOYEE_ID_IMMUTABLE' });

    const updated = await service.updateEmployee('emp-sales-01', {
      designation: 'Senior Travel Consultant',
    }, founder);
    expect(updated.employeeId).toBe('emp-sales-01');
    expect(storage.getRawEmployee('emp-sales-01')).toMatchObject({
      employeeId: 'emp-sales-01',
      historicalMarker: 'must-survive-profile-edits',
      designation: 'Senior Travel Consultant',
    });
  });

  it('audits role, team, manager, activation, and deactivation changes with canonical actor identity', async () => {
    const { storage, service } = setup();
    const moved = await service.updateEmployee('emp-sales-01', {
      salesTeamId: 'sales-team-02',
      managerEmployeeId: 'emp-manager-02',
      reason: 'Approved sales team transfer',
    }, admin);
    expect(moved).toMatchObject({
      salesTeamId: 'sales-team-02',
      managerEmployeeId: 'emp-manager-02',
    });

    const deactivated = await service.updateEmployee('emp-sales-01', {
      active: false,
      reason: 'Employee departed',
    }, admin);
    expect(deactivated.reassignmentRequired).toBe(true);
    expect(deactivated.reassignmentNote).toContain('manual reassignment');

    const reactivated = await service.updateEmployee('emp-sales-01', {
      active: true,
      reason: 'Employee returned',
    }, founder);
    expect(reactivated.active).toBe(true);

    const actions = storage.getAuditLogs().map((audit) => audit.action);
    expect(actions).toContain('EMPLOYEE_TEAM_CHANGED');
    expect(actions).toContain('EMPLOYEE_MANAGER_CHANGED');
    expect(actions).toContain('EMPLOYEE_DEACTIVATED');
    expect(actions).toContain('EMPLOYEE_ACTIVATED');
    expect(storage.getAuditLogs().every((audit) =>
      audit.actorId === admin.employeeId || audit.actorId === founder.employeeId
    )).toBe(true);
  });

  it('prevents normal requests from deactivating or demoting the last active Founder', async () => {
    const { storage, service } = setup();
    await expect(service.updateEmployee('emp-founder-01', {
      active: false,
      reason: 'Accidental request',
    }, founder)).rejects.toMatchObject({ statusCode: 409, code: 'LAST_ACTIVE_FOUNDER' });
    expect(storage.getRawEmployee('emp-founder-01')?.active).toBe(true);

    const withSecondFounder = setup([
      employee('emp-founder-02', 'Founder', { firebaseUid: 'firebase-second-user' }),
    ]);
    const demoted = await withSecondFounder.service.updateEmployee('emp-founder-01', {
      role: 'Admin',
      reason: 'Founder succession completed',
    }, founder);
    expect(demoted.role).toBe('Admin');
    expect(withSecondFounder.storage.getAuditLogs().map((audit) => audit.action)).toContain('EMPLOYEE_ROLE_CHANGED');
  });

  it('lists role-derived access summaries without arbitrary per-user permission fields', async () => {
    const { service } = setup();
    const result = await service.listEmployees(admin);
    expect(result.teams).toHaveLength(3);
    expect(result.employees.find((item) => item.employeeId === 'emp-manager-01')?.accessSummary.scope)
      .toBe('TEAM Sales scope');
    expect(result.employees.find((item) => item.employeeId === 'emp-sales-01')?.accessSummary.scope)
      .toBe('OWN Sales scope');
    expect(result.employees.some((item) => 'permissions' in item)).toBe(false);
  });

  it('requires reassignment before changing an active manager role/team but permits explicit deactivation', async () => {
    const { service } = setup();
    await expect(service.updateEmployee('emp-manager-01', {
      role: 'Marketing',
      salesTeamId: null,
    }, founder)).rejects.toMatchObject({ code: 'ACTIVE_REPORTS_REQUIRE_REASSIGNMENT' });

    const deactivated = await service.updateEmployee('emp-manager-01', {
      active: false,
      reason: 'Manager departed; reports require manual reassignment',
    }, founder);
    expect(deactivated).toMatchObject({ active: false, reassignmentRequired: true });

    await expect(service.createEmployee({
      employeeId: 'emp-sales-new',
      name: 'New Sales User',
      email: 'sales-new@bookingbridge.com',
      role: 'Sales Executive',
      active: true,
      salesTeamId: 'sales-team-01',
      managerEmployeeId: 'emp-manager-01',
    }, founder)).rejects.toMatchObject({ code: 'MANAGER_INVALID' });
  });

  it('locks employee and employee-audit mutations to server APIs in Firestore rules', async () => {
    const rules = await Bun.file('firestore.rules').text();
    const employeeRules = rules.match(/match \/employees\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const teamRules = rules.match(/match \/sales_teams\/\{teamId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const auditRules = rules.match(/match \/audit_logs\/\{logId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(employeeRules).toContain('allow read, create, update, delete: if false;');
    expect(teamRules).toContain('allow read, create, update, delete: if false;');
    expect(auditRules).toContain("entityType != 'EMPLOYEE'");
    expect(auditRules).toContain('EMPLOYEE_CREATED');
    expect(auditRules).toContain('EMPLOYEE_DEACTIVATED');
  });
});

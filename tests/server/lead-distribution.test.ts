import { describe, expect, test } from 'bun:test';
import { LeadDistributionService, LeadDistributionError } from '../../server/services/leadDistributionService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import type { Lead } from '../../src/types';

const TEAM = 'sales-team-01';
const executive = { employeeId: 'sales-a', name: 'Sales A', role: 'Sales Executive' as const, active: true, salesTeamId: TEAM };
const manager = { employeeId: 'manager-c', name: 'Manager C', role: 'Sales Manager' as const, active: true, salesTeamId: TEAM };
const admin = { employeeId: 'admin-1', name: 'Admin', role: 'Admin' as const, active: true };

function storage() {
  const value = new InMemoryConversionStorageProvider();
  value.rawSet('sales_teams', TEAM, { id: TEAM, name: 'Kashmir Sales Team', active: true });
  value.rawSet('employees', 'sales-a', executive);
  value.rawSet('employees', 'sales-b', { employeeId: 'sales-b', name: 'Sales B', role: 'Sales Executive', active: true, salesTeamId: TEAM });
  value.rawSet('employees', 'manager-c', manager);
  value.rawSet('employees', 'inactive', { employeeId: 'inactive', name: 'Inactive', role: 'Sales Executive', active: false, salesTeamId: TEAM });
  value.rawSet('employees', 'wrong-team', { employeeId: 'wrong-team', name: 'Wrong Team', role: 'Sales Executive', active: true, salesTeamId: 'other-team' });
  return value;
}

function lead(id: string, customerId = `customer-${id}`, sourceId: Lead['sourceId'] = 'WEBSITE'): Lead {
  const now = `2026-10-02T10:${id.padStart(2, '0')}:00.000Z`;
  return {
    id, customerId, customerName: `Customer ${id}`, customerPhone: `9876500${id.padStart(3, '0')}`,
    sourceId, source: sourceId, sourcePlatform: sourceId,
    createdSourceType: sourceId === 'WEBSITE' ? 'WEBSITE' : 'MANUAL', tags: [],
    destination: 'Kashmir', children: 0, childAges: [], status: 'NEW', priority: 'NORMAL', notes: '',
    createdByEmployeeId: admin.employeeId, updatedByEmployeeId: admin.employeeId, createdAt: now, updatedAt: now,
  };
}

describe('LeadDistributionService', () => {
  test('fresh environment returns an explicit usable default configuration and empty state', async () => {
    const data = storage();
    const overview = await new LeadDistributionService(data).getOverview(admin);
    expect(overview.configuration).toMatchObject({
      id: 'kashmir-sales-default', salesTeamId: TEAM, salesTeamName: 'Kashmir Sales Team', enabled: true,
    });
    expect(overview.configuration.updatedAt).toBeUndefined();
    expect(overview.state).toMatchObject({ configId: 'kashmir-sales-default', sequence: 0 });
    expect(overview.roundRobinOrder).toEqual(['sales-a', 'sales-b', 'manager-c']);
  });

  test('manual Sales Executive and Manager Leads stay with their creator without consuming round robin', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    const own = await service.createLead({ lead: lead('01'), actor: executive });
    const managed = await service.createLead({ lead: lead('02'), actor: manager });

    expect(own.lead.assignedEmployeeId).toBe('sales-a');
    expect(own.lead.assignmentReason).toBe('MANUAL_CREATOR');
    expect(managed.lead.assignedEmployeeId).toBe('manager-c');
    expect(data.rawGet('lead_distribution_state', 'kashmir-sales-default')).toBeNull();
  });

  test('round robin is deterministic, includes managers, persists across service instances, and records SYSTEM', async () => {
    const data = storage();
    const first = new LeadDistributionService(data);
    const assigned: string[] = [];
    for (const id of ['01', '02']) assigned.push((await first.createLead({ lead: lead(id), actor: admin, isExternalDelivery: true })).lead.assignedEmployeeId!);
    const restarted = new LeadDistributionService(data);
    for (const id of ['03', '04']) assigned.push((await restarted.createLead({ lead: lead(id), actor: admin, isExternalDelivery: true })).lead.assignedEmployeeId!);

    expect(assigned).toEqual(['sales-a', 'sales-b', 'manager-c', 'sales-a']);
    expect(data.rawGet('lead_distribution_state', 'kashmir-sales-default').sequence).toBe(4);
    const histories = data.rawList('lead_assignment_history');
    expect(histories.every(event => event.actorEmployeeId === 'SYSTEM' && event.reason === 'ROUND_ROBIN')).toBe(true);
    expect(histories.every(event => event.ruleId === 'kashmir-default')).toBe(true);
  });

  test('inactive, excluded, and wrong-team employees are skipped', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    await service.updateConfiguration({ excludedEmployeeIds: ['sales-b'] }, admin);
    const recipients = await Promise.all(['01', '02', '03'].map(async id =>
      (await service.createLead({ lead: lead(id), actor: admin, isExternalDelivery: true })).lead.assignedEmployeeId,
    ));
    expect(new Set(recipients)).toEqual(new Set(['manager-c', 'sales-a']));
    expect(recipients).not.toContain('inactive');
    expect(recipients).not.toContain('wrong-team');
    expect(recipients).not.toContain('sales-b');
  });

  test('concurrent arrivals consume distinct serialized round-robin slots', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    const results = await Promise.all(['01', '02', '03'].map(id => service.createLead({ lead: lead(id), actor: admin, isExternalDelivery: true })));
    expect(new Set(results.map(result => result.lead.assignedEmployeeId))).toEqual(new Set(['manager-c', 'sales-a', 'sales-b']));
    expect(data.rawGet('lead_distribution_state', 'kashmir-sales-default').sequence).toBe(3);
  });

  test('repeat customer uses active previous salesperson without consuming sequence', async () => {
    const data = storage();
    data.rawSet('customers', 'repeat-customer', { id: 'repeat-customer', previousSalesEmployeeId: 'manager-c' });
    const service = new LeadDistributionService(data);
    const result = await service.createLead({ lead: lead('01', 'repeat-customer', 'REPEAT_CUSTOMER'), actor: admin, isExternalDelivery: true });
    expect(result.lead.assignedEmployeeId).toBe('manager-c');
    expect(result.lead.assignmentReason).toBe('PREVIOUS_SALESPERSON');
    expect(result.history.actorEmployeeId).toBe('SYSTEM');
    expect(data.rawGet('lead_distribution_state', 'kashmir-sales-default')).toBeNull();
  });

  test('inactive previous salesperson falls back to round robin', async () => {
    const data = storage();
    data.rawSet('customers', 'repeat-customer', { id: 'repeat-customer', previousSalesEmployeeId: 'inactive' });
    const result = await new LeadDistributionService(data).createLead({
      lead: lead('01', 'repeat-customer', 'REPEAT_CUSTOMER'), actor: admin, isExternalDelivery: true,
    });
    expect(result.lead.assignmentReason).toBe('ROUND_ROBIN');
    expect(result.lead.assignedEmployeeId).toBe('sales-a');
  });

  test('duplicate delivery returns the same Lead and does not consume another position', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    const incoming = lead('01');
    const [first, duplicate] = await Promise.all([
      service.createLead({ lead: incoming, actor: admin, isExternalDelivery: true }),
      service.createLead({ lead: incoming, actor: admin, isExternalDelivery: true }),
    ]);
    expect([first.idempotent, duplicate.idempotent].sort()).toEqual([false, true]);
    expect(duplicate.lead.assignedEmployeeId).toBe(first.lead.assignedEmployeeId);
    expect(data.rawGet('lead_distribution_state', 'kashmir-sales-default').sequence).toBe(1);
    expect(data.rawList('leads')).toHaveLength(1);
  });

  test('no eligible employee leaves a visible persisted assignment-required Lead', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    await service.updateConfiguration({ includeSalesExecutives: false, includeSalesManagers: false }, admin);
    const result = await service.createLead({ lead: lead('01'), actor: admin, isExternalDelivery: true });
    expect(result.lead.assignmentStatus).toBe('ASSIGNMENT_REQUIRED');
    expect(result.lead.assignedEmployeeId).toBeUndefined();
    expect(data.rawGet('leads', '01')).not.toBeNull();
    expect(data.rawList('audit_logs').some(event => event.action === 'LEAD_ASSIGNMENT_REQUIRED')).toBe(true);
  });

  test('reassignment enforces TEAM/ALL scope and appends immutable canonical history', async () => {
    const data = storage();
    const service = new LeadDistributionService(data);
    const created = await service.createLead({ lead: lead('01'), actor: executive });
    const reassigned = await service.reassignLead({
      leadId: '01', targetEmployeeId: 'sales-b', expectedUpdatedAt: created.lead.updatedAt,
      note: 'Coverage change', actor: manager,
    });
    expect(reassigned.history.previousEmployeeId).toBe('sales-a');
    expect(reassigned.history.newEmployeeId).toBe('sales-b');
    expect(reassigned.history.actorEmployeeId).toBe('manager-c');
    expect(data.rawList('lead_assignment_history')).toHaveLength(2);

    await expect(service.reassignLead({
      leadId: '01', targetEmployeeId: 'sales-a', expectedUpdatedAt: reassigned.lead.updatedAt, actor: executive,
    })).rejects.toMatchObject({ statusCode: 403 });

    data.rawSet('employees', 'other-manager', { employeeId: 'other-manager', name: 'Other', role: 'Sales Manager', active: true, salesTeamId: 'other-team' });
    await expect(service.reassignLead({
      leadId: '01', targetEmployeeId: 'sales-a', expectedUpdatedAt: reassigned.lead.updatedAt,
      actor: { employeeId: 'other-manager', name: 'Other', role: 'Sales Manager', active: true, salesTeamId: 'other-team' },
    })).rejects.toBeInstanceOf(LeadDistributionError);

    const byAdmin = await service.reassignLead({
      leadId: '01', targetEmployeeId: 'manager-c', expectedUpdatedAt: reassigned.lead.updatedAt, actor: admin,
    });
    expect(byAdmin.lead.assignedEmployeeId).toBe('manager-c');
    expect(byAdmin.history.reason).toBe('MANUAL_ADMIN_ASSIGNMENT');
    const byFounder = await service.reassignLead({
      leadId: '01', targetEmployeeId: 'sales-a', expectedUpdatedAt: byAdmin.lead.updatedAt,
      actor: { employeeId: 'founder-1', name: 'Founder', role: 'Founder', active: true },
    });
    expect(byFounder.lead.assignedEmployeeId).toBe('sales-a');
    expect(byFounder.history.actorEmployeeId).toBe('founder-1');
  });

  test('browser writes cannot alter distribution state or assignment history', async () => {
    const rules = await Bun.file('firestore.rules').text();
    for (const collection of ['lead_distribution_configs', 'lead_distribution_state', 'lead_assignment_history']) {
      expect(rules).toContain(`match /${collection}/`);
    }
    expect(rules.match(/match \/lead_distribution_state[\s\S]*?allow read, create, update, delete: if false;/)).not.toBeNull();
    expect(rules.match(/match \/lead_assignment_history[\s\S]*?allow read, create, update, delete: if false;/)).not.toBeNull();
  });
});

import { describe, expect, test } from 'bun:test';
import { LeadInteractionError, LeadInteractionService } from '../../server/services/leadInteractionService';
import { LeadDistributionService } from '../../server/services/leadDistributionService';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { businessDateKey, classifyLeadFollowUp } from '../../src/utils/businessTime';
import type { Lead, LeadInteractionInput } from '../../src/types';

const TEAM = 'sales-team-01';
const OTHER_TEAM = 'sales-team-02';
const now = new Date('2026-10-02T06:30:00.000Z'); // 12:00 in Asia/Kolkata
const executive = { employeeId: 'sales-a', name: 'Sales A', role: 'Sales Executive' as const, active: true, salesTeamId: TEAM };
const anotherExecutive = { employeeId: 'sales-b', name: 'Sales B', role: 'Sales Executive' as const, active: true, salesTeamId: TEAM };
const manager = { employeeId: 'manager-a', name: 'Manager A', role: 'Sales Manager' as const, active: true, salesTeamId: TEAM };
const otherManager = { employeeId: 'manager-b', name: 'Manager B', role: 'Sales Manager' as const, active: true, salesTeamId: OTHER_TEAM };
const founder = { employeeId: 'founder-1', name: 'Founder', role: 'Founder' as const, active: true };
const admin = { employeeId: 'admin-1', name: 'Admin', role: 'Admin' as const, active: true };

function lead(id: string, owner = executive.employeeId, team = TEAM, overrides: Partial<Lead> = {}): Lead {
  return {
    id, customerId: `customer-${id}`, customerName: `Customer ${id}`, customerPhone: '9876500000',
    sourceId: 'DIRECT_CALL', source: 'Direct Call', sourcePlatform: 'Direct Call', createdSourceType: 'MANUAL', tags: [],
    destination: 'Kashmir', children: 0, childAges: [], status: 'NEW', priority: 'NORMAL', notes: '',
    assignedEmployeeId: owner, assignedEmployeeName: owner, salesTeamId: team, assignmentStatus: 'ASSIGNED',
    createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z',
    ...overrides,
  };
}

function setup(leads: Lead[] = [lead('own')]) {
  const storage = new InMemoryConversionStorageProvider({ leads });
  for (const employee of [executive, anotherExecutive, manager, otherManager]) storage.rawSet('employees', employee.employeeId, employee);
  storage.rawSet('sales_teams', TEAM, { id: TEAM, name: 'Kashmir Sales Team', active: true });
  storage.rawSet('sales_teams', OTHER_TEAM, { id: OTHER_TEAM, name: 'Other Team', active: true });
  return { storage, service: new LeadInteractionService(storage, () => new Date(now)) };
}

function input(overrides: Partial<LeadInteractionInput> = {}): LeadInteractionInput {
  return {
    outcome: 'NO_ANSWER', expectedUpdatedAt: '2026-10-01T08:00:00.000Z',
    idempotencyKey: 'interaction-0001', ...overrides,
  };
}

describe('Sales Core M3 Lead interaction authority', () => {
  test('Sales Executive OWN is allowed and OTHER is denied with zero interaction writes', async () => {
    const { storage, service } = setup([lead('own'), lead('other', anotherExecutive.employeeId)]);
    await service.recordInteraction('own', input(), executive);
    expect(storage.rawGet('leads', 'own')).toMatchObject({ lastContactOutcome: 'NO_ANSWER', lastContactByEmployeeId: 'sales-a' });
    await expect(service.recordInteraction('other', input({ idempotencyKey: 'interaction-0002' }), executive))
      .rejects.toMatchObject({ statusCode: 403, code: 'LEAD_SCOPE_DENIED' });
    expect(storage.rawList('lead_events')).toHaveLength(1);
  });

  test('Sales Manager TEAM is allowed, outside TEAM denied, and Founder/Admin have ALL scope', async () => {
    const { service } = setup([lead('team'), lead('outside', 'sales-z', OTHER_TEAM)]);
    await service.recordInteraction('team', input({ idempotencyKey: 'interaction-team' }), manager);
    await expect(service.recordInteraction('outside', input({ idempotencyKey: 'interaction-outside' }), manager))
      .rejects.toMatchObject({ statusCode: 403 });
    await service.recordInteraction('outside', input({ idempotencyKey: 'interaction-founder' }), founder);
    const updatedAt = (await service.getSalesQueue(founder)).groups.NEEDS_ATTENTION.find(item => item.leadId === 'outside')?.updatedAt;
    await service.recordInteraction('outside', input({ expectedUpdatedAt: updatedAt, idempotencyKey: 'interaction-admin' }), admin);
  });

  test('NO_ANSWER records current action fields, optional note, next follow-up, event, and canonical audit actor', async () => {
    const { storage, service } = setup();
    const result = await service.recordInteraction('own', input({
      nextFollowUpAt: '2026-10-02T10:30:00.000Z', note: 'Will try after lunch.',
    }), executive);
    expect(result.lead).toMatchObject({
      status: 'CONTACTED', lastContactAt: now.toISOString(), lastContactOutcome: 'NO_ANSWER',
      lastContactByEmployeeId: 'sales-a', nextFollowUpAt: '2026-10-02T10:30:00.000Z',
    });
    expect(storage.rawList('lead_events')[0]).toMatchObject({
      actorId: 'sales-a', eventType: 'INTERACTION_RECORDED', metadata: { outcome: 'NO_ANSWER', note: 'Will try after lunch.' },
    });
    expect(storage.rawList('audit_logs')[0]).toMatchObject({ action: 'LEAD_INTERACTION_RECORDED', actorId: 'sales-a' });
  });

  test('CALLBACK_REQUESTED validates date/time and NEGOTIATING sets the canonical stage', async () => {
    const callbackSetup = setup();
    await expect(callbackSetup.service.recordInteraction('own', input({ outcome: 'CALLBACK_REQUESTED' }), executive))
      .rejects.toMatchObject({ statusCode: 400, code: 'NEXT_FOLLOW_UP_REQUIRED' });
    const callback = await callbackSetup.service.recordInteraction('own', input({
      outcome: 'CALLBACK_REQUESTED', nextFollowUpAt: '2026-10-03T04:30:00.000Z',
    }), executive);
    expect(callback.lead.nextFollowUpAt).toBe('2026-10-03T04:30:00.000Z');

    const negotiatingSetup = setup();
    const negotiating = await negotiatingSetup.service.recordInteraction('own', input({
      outcome: 'NEGOTIATING', nextFollowUpAt: '2026-10-03T05:30:00.000Z',
    }), executive);
    expect(negotiating.lead.status).toBe('NEGOTIATION');
  });

  test('ADVANCE_PROMISED records intent without changing payment state', async () => {
    const original = lead('own', executive.employeeId, TEAM, { paymentStatus: 'UNPAID', amountReceived: 0 } as Partial<Lead>);
    const { service } = setup([original]);
    const result = await service.recordInteraction('own', input({ outcome: 'ADVANCE_PROMISED' }), executive);
    expect((result.lead as any).paymentStatus).toBe('UNPAID');
    expect((result.lead as any).amountReceived).toBe(0);
    expect(result.lead.lastContactOutcome).toBe('ADVANCE_PROMISED');
  });

  test('NOT_INTERESTED uses the Drop workflow, requires a reason, and clears future follow-up', async () => {
    const seeded = lead('own', executive.employeeId, TEAM, { nextFollowUpAt: '2026-10-03T05:30:00.000Z' });
    const { service } = setup([seeded]);
    await expect(service.recordInteraction('own', input({ outcome: 'NOT_INTERESTED' }), executive))
      .rejects.toMatchObject({ code: 'DROP_REASON_REQUIRED' });
    const result = await service.recordInteraction('own', input({
      outcome: 'NOT_INTERESTED', dropReason: 'NOT_INTERESTED', note: 'Customer cancelled travel.',
    }), executive);
    expect(result.lead).toMatchObject({ status: 'DROPPED', dropReason: 'NOT_INTERESTED', nextFollowUpAt: null });
  });

  test('stale versions conflict and repeated idempotency keys create only one event and audit', async () => {
    const { storage, service } = setup();
    await expect(service.recordInteraction('own', input({ expectedUpdatedAt: 'stale-version' }), executive))
      .rejects.toMatchObject({ statusCode: 409, code: 'LEAD_VERSION_CONFLICT' });
    expect(storage.rawList('lead_events')).toHaveLength(0);

    const request = input({ idempotencyKey: 'interaction-deduplicated', nextFollowUpAt: '2026-10-02T10:30:00.000Z' });
    const first = await service.recordInteraction('own', request, executive);
    const duplicate = await service.recordInteraction('own', request, executive);
    expect(first.idempotent).toBe(false);
    expect(duplicate.idempotent).toBe(true);
    expect(storage.rawList('lead_events')).toHaveLength(1);
    expect(storage.rawList('audit_logs')).toHaveLength(1);
    await expect(service.recordInteraction('own', { ...request, outcome: 'INTERESTED' }, executive))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
  });
});

describe('Sales Core M3 queue projection and business time', () => {
  test('Lead interaction history and authoritative audits cannot be written directly by the browser', async () => {
    const rules = await Bun.file('firestore.rules').text();
    const eventRules = rules.match(/match \/lead_events\/\{eventId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    expect(eventRules).toContain('allow read, create, update, delete: if false;');
    expect(rules).toContain("'LEAD_INTERACTION_RECORDED'");
    expect(rules).toContain("'LEAD_DROPPED'");
  });

  test('Asia/Kolkata date keys and midnight boundaries classify overdue/today/upcoming correctly', () => {
    expect(businessDateKey('2026-10-02T18:29:59.999Z')).toBe('2026-10-02');
    expect(businessDateKey('2026-10-02T18:30:00.000Z')).toBe('2026-10-03');
    expect(classifyLeadFollowUp(lead('today', executive.employeeId, TEAM, {
      status: 'CONTACTED', lastContactAt: '2026-10-01T06:30:00.000Z', nextFollowUpAt: '2026-10-02T10:00:00.000Z',
    }), now)).toBe('TODAY');
    expect(classifyLeadFollowUp(lead('overdue', executive.employeeId, TEAM, {
      status: 'CONTACTED', lastContactAt: '2026-10-01T06:30:00.000Z', nextFollowUpAt: '2026-10-02T06:29:59.999Z',
    }), now)).toBe('OVERDUE');
    expect(classifyLeadFollowUp(lead('future', executive.employeeId, TEAM, {
      status: 'CONTACTED', lastContactAt: '2026-10-01T06:30:00.000Z', nextFollowUpAt: '2026-10-03T04:30:00.000Z',
    }), now)).toBe('UPCOMING');
  });

  test('legacy null follow-up is Needs Attention, closed Leads are excluded, and quote age is derived', async () => {
    const { storage, service } = setup([
      lead('legacy', executive.employeeId, TEAM, { status: 'IN_PROGRESS', nextFollowUpAt: null }),
      lead('closed', executive.employeeId, TEAM, { status: 'CONVERTED', nextFollowUpAt: '2026-10-01T00:00:00.000Z' }),
    ]);
    storage.rawSet('quotes', 'quote-legacy', {
      id: 'quote-legacy', leadId: 'legacy', salesEmployeeId: executive.employeeId, salesTeamId: TEAM,
      status: 'SENT', sharedAt: '2026-09-29T06:30:00.000Z',
    });
    const queue = await service.getSalesQueue(executive);
    expect(queue.businessDate).toBe('2026-10-02');
    expect(queue.groups.NEEDS_ATTENTION[0]).toMatchObject({
      leadId: 'legacy', quoteContext: { ageDays: 3, label: 'Quote sent 3 days ago' },
    });
    expect(Object.values(queue.groups).flat().some(item => item.leadId === 'closed')).toBe(false);
  });

  test('M2 reassignment naturally removes a Lead from the old owner queue and adds it to the new owner queue', async () => {
    const { storage, service } = setup([lead('move')]);
    expect((await service.getSalesQueue(executive)).groups.NEEDS_ATTENTION.map(item => item.leadId)).toContain('move');
    await new LeadDistributionService(storage).reassignLead({
      leadId: 'move', targetEmployeeId: anotherExecutive.employeeId,
      expectedUpdatedAt: '2026-10-01T08:00:00.000Z', actor: manager,
    });
    expect(Object.values((await service.getSalesQueue(executive)).groups).flat().some(item => item.leadId === 'move')).toBe(false);
    expect((await service.getSalesQueue(anotherExecutive)).groups.NEEDS_ATTENTION.map(item => item.leadId)).toContain('move');
  });

  test('manager queue is TEAM scoped and missing team metadata fails closed', async () => {
    const { service } = setup([lead('team'), lead('other', 'sales-z', OTHER_TEAM)]);
    expect(Object.values((await service.getSalesQueue(manager)).groups).flat().map(item => item.leadId)).toEqual(['team']);
    await expect(service.getSalesQueue({ ...manager, salesTeamId: undefined }))
      .rejects.toBeInstanceOf(LeadInteractionError);
    expect(Object.values((await service.getSalesQueue(otherManager)).groups).flat().map(item => item.leadId)).toEqual(['other']);
  });
});

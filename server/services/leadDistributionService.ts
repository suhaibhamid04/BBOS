import { randomUUID } from 'node:crypto';
import type {
  Lead,
  LeadAssignmentHistoryEntry,
  LeadAssignmentReason,
  LeadDistributionConfiguration,
  LeadDistributionOverview,
  LeadDistributionState,
} from '../../src/types/index.js';
import {
  FirestoreConversionStorageProvider,
  type ConversionStorageProvider,
  type ConversionTransaction,
} from '../../src/services/conversion/conversionStorageProvider.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';

type UnknownRecord = Record<string, any>;

export interface LeadAssignmentActor extends AuthorizationPrincipal {
  name: string;
}

export interface CreateDistributedLeadInput {
  lead: Lead;
  actor: LeadAssignmentActor;
  requestedAssigneeId?: string;
  isExternalDelivery?: boolean;
  newCustomer?: UnknownRecord;
  linkedExistingCustomer?: boolean;
}

export interface ReassignLeadInput {
  leadId: string;
  targetEmployeeId: string;
  expectedUpdatedAt: string;
  note?: string;
  actor: LeadAssignmentActor;
}

interface SalesEmployee {
  employeeId: string;
  name: string;
  role: 'Sales Executive' | 'Sales Manager';
  salesTeamId: string;
  active: true;
}

export const KASHMIR_DISTRIBUTION_CONFIG_ID = 'kashmir-sales-default';
export const DEFAULT_KASHMIR_TEAM_ID = 'sales-team-01';

export class LeadDistributionError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'LeadDistributionError';
  }
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(nonEmpty).filter((item): item is string => Boolean(item)))];
}

export function defaultLeadDistributionConfiguration(teamId = DEFAULT_KASHMIR_TEAM_ID): LeadDistributionConfiguration {
  return {
    id: KASHMIR_DISTRIBUTION_CONFIG_ID,
    enabled: true,
    salesTeamId: teamId,
    salesTeamName: 'Kashmir Sales Team',
    includeSalesExecutives: true,
    includeSalesManagers: true,
    previousSalespersonPreference: true,
    excludedEmployeeIds: [],
    rules: [
      {
        id: 'repeat-customer', name: 'Repeat Customer', active: true, priority: 10,
        salesTeamId: teamId, eligibleRoles: ['Sales Executive', 'Sales Manager'],
        excludedEmployeeIds: [], assignmentMethod: 'PREVIOUS_SALESPERSON', sourceCondition: 'REPEAT_CUSTOMER',
      },
      {
        id: 'kashmir-default', name: 'Kashmir Default', active: true, priority: 20,
        salesTeamId: teamId, eligibleRoles: ['Sales Executive', 'Sales Manager'],
        excludedEmployeeIds: [], assignmentMethod: 'ROUND_ROBIN', sourceCondition: 'DEFAULT',
      },
    ],
  };
}

function normalizeConfiguration(raw: UnknownRecord | null): LeadDistributionConfiguration {
  const teamId = nonEmpty(raw?.salesTeamId) || DEFAULT_KASHMIR_TEAM_ID;
  const defaults = defaultLeadDistributionConfiguration(teamId);
  if (!raw) return defaults;
  const configuration: LeadDistributionConfiguration = {
    ...defaults,
    enabled: raw.enabled !== false,
    salesTeamId: teamId,
    salesTeamName: nonEmpty(raw.salesTeamName) || defaults.salesTeamName,
    includeSalesExecutives: raw.includeSalesExecutives !== false,
    includeSalesManagers: raw.includeSalesManagers !== false,
    previousSalespersonPreference: raw.previousSalespersonPreference !== false,
    excludedEmployeeIds: uniqueStrings(raw.excludedEmployeeIds),
    ...(nonEmpty(raw.updatedAt) ? { updatedAt: nonEmpty(raw.updatedAt) } : {}),
    ...(nonEmpty(raw.updatedByEmployeeId) ? { updatedByEmployeeId: nonEmpty(raw.updatedByEmployeeId) } : {}),
  };
  configuration.rules = defaults.rules.map(rule => ({
    ...rule,
    eligibleRoles: [
      ...(configuration.includeSalesExecutives ? ['Sales Executive' as const] : []),
      ...(configuration.includeSalesManagers ? ['Sales Manager' as const] : []),
    ],
    excludedEmployeeIds: configuration.excludedEmployeeIds,
    active: configuration.enabled && (rule.assignmentMethod !== 'PREVIOUS_SALESPERSON' || configuration.previousSalespersonPreference),
  }));
  return configuration;
}

function normalizeEmployee(raw: UnknownRecord): SalesEmployee | null {
  const employeeId = nonEmpty(raw.employeeId) || nonEmpty(raw.id);
  const salesTeamId = nonEmpty(raw.salesTeamId) || nonEmpty(raw.teamId);
  const name = nonEmpty(raw.name);
  if (!employeeId || !salesTeamId || !name || raw.active !== true || !['Sales Executive', 'Sales Manager'].includes(raw.role)) return null;
  return { employeeId, salesTeamId, name, role: raw.role, active: true } as SalesEmployee;
}

function allowedByConfiguration(employee: SalesEmployee, config: LeadDistributionConfiguration): boolean {
  if (employee.salesTeamId !== config.salesTeamId || config.excludedEmployeeIds.includes(employee.employeeId)) return false;
  if (employee.role === 'Sales Executive') return config.includeSalesExecutives;
  return config.includeSalesManagers;
}

function distributionOrder(left: SalesEmployee, right: SalesEmployee): number {
  const roleOrder = (employee: SalesEmployee) => employee.role === 'Sales Executive' ? 0 : 1;
  return roleOrder(left) - roleOrder(right) || left.employeeId.localeCompare(right.employeeId);
}

function assignmentEvent(
  leadId: string,
  previousEmployeeId: string | undefined,
  newEmployeeId: string | undefined,
  salesTeamId: string,
  reason: LeadAssignmentReason,
  actorEmployeeId: string | 'SYSTEM',
  timestamp: string,
  ruleId?: string,
  note?: string,
): LeadAssignmentHistoryEntry {
  return {
    id: `lead-assignment-${randomUUID()}`, leadId,
    ...(previousEmployeeId ? { previousEmployeeId } : {}),
    ...(newEmployeeId ? { newEmployeeId } : {}),
    salesTeamId, reason, actorEmployeeId, timestamp,
    ...(ruleId ? { ruleId } : {}), ...(note ? { note } : {}),
  };
}

function auditEvent(action: string, actorEmployeeId: string, leadId: string, before: unknown, after: unknown, timestamp: string, reason: string) {
  return {
    id: `audit-${randomUUID()}`, action, entityType: 'LEAD', entityId: leadId,
    actorId: actorEmployeeId, actorName: actorEmployeeId === 'SYSTEM' ? 'BBOS System' : actorEmployeeId,
    actor: { id: actorEmployeeId, name: actorEmployeeId === 'SYSTEM' ? 'BBOS System' : actorEmployeeId, role: actorEmployeeId === 'SYSTEM' ? 'SYSTEM' : 'EMPLOYEE' },
    before: before || null, after: after || null, reason, summary: reason, timestamp,
  };
}

function canReadLead(actor: LeadAssignmentActor, lead: UnknownRecord): boolean {
  if (actor.role === 'Founder' || actor.role === 'Admin') return true;
  if (actor.role === 'Sales Executive') return lead.assignedEmployeeId === actor.employeeId;
  return actor.role === 'Sales Manager' && !!actor.salesTeamId && lead.salesTeamId === actor.salesTeamId;
}

export class LeadDistributionService {
  constructor(private readonly storage: ConversionStorageProvider = new FirestoreConversionStorageProvider()) {}

  private async configuration(tx: ConversionTransaction): Promise<LeadDistributionConfiguration> {
    return normalizeConfiguration(await tx.get('lead_distribution_configs', KASHMIR_DISTRIBUTION_CONFIG_ID));
  }

  private async teamEmployees(tx: ConversionTransaction, teamId: string): Promise<SalesEmployee[]> {
    const records = await tx.findByField('employees', 'salesTeamId', teamId, 500);
    return records.map(normalizeEmployee).filter((employee): employee is SalesEmployee => Boolean(employee));
  }

  private async previousOwner(tx: ConversionTransaction, customerId: string): Promise<string | undefined> {
    const customer = await tx.get('customers', customerId);
    const customerOwner = nonEmpty(customer?.salesOwnerEmployeeId) || nonEmpty(customer?.previousSalesEmployeeId);
    if (customerOwner) return customerOwner;
    const leads = await tx.findByField('leads', 'customerId', customerId, 100);
    const previousLead = leads
      .filter(candidate => nonEmpty(candidate.assignedEmployeeId))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0];
    if (previousLead) return nonEmpty(previousLead.assignedEmployeeId);
    const bookings = await tx.findByField('bookings', 'customerId', customerId, 100);
    const previousBooking = bookings
      .filter(candidate => nonEmpty(candidate.assignedSalesEmployeeId))
      .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))[0];
    return nonEmpty(previousBooking?.assignedSalesEmployeeId);
  }

  async createLead(input: CreateDistributedLeadInput): Promise<{ lead: Lead; history: LeadAssignmentHistoryEntry; idempotent: boolean }> {
    return this.storage.runTransaction(async tx => {
      const existing = await tx.get('leads', input.lead.id);
      if (existing) {
        const history = (await tx.findByField('lead_assignment_history', 'leadId', input.lead.id, 1))[0];
        return { lead: existing as Lead, history: history as LeadAssignmentHistoryEntry, idempotent: true };
      }

      const config = await this.configuration(tx);
      const teamEmployees = await this.teamEmployees(tx, config.salesTeamId);
      const eligible = teamEmployees.filter(employee => allowedByConfiguration(employee, config));
      const actor = input.actor;
      let requestedEmployee: SalesEmployee | undefined;
      if (input.requestedAssigneeId) {
        const requestedMatches = await tx.findByField('employees', 'employeeId', input.requestedAssigneeId, 2);
        if (requestedMatches.length === 1) requestedEmployee = normalizeEmployee(requestedMatches[0]) || undefined;
      }
      let selected: SalesEmployee | undefined;
      let reason: LeadAssignmentReason = 'FALLBACK_ASSIGNMENT';
      let ruleId: string | undefined;
      let systemAssignment = false;

      if (!input.isExternalDelivery && actor.role === 'Sales Executive') {
        if (!actor.salesTeamId) throw new LeadDistributionError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
        selected = { employeeId: actor.employeeId, name: actor.name, role: 'Sales Executive', salesTeamId: actor.salesTeamId, active: true };
        reason = 'MANUAL_CREATOR';
      } else if (!input.isExternalDelivery && actor.role === 'Sales Manager') {
        if (!actor.salesTeamId) throw new LeadDistributionError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
        const targetId = input.requestedAssigneeId || actor.employeeId;
        selected = targetId === actor.employeeId
          ? { employeeId: actor.employeeId, name: actor.name, role: 'Sales Manager', salesTeamId: actor.salesTeamId, active: true }
          : requestedEmployee;
        if (selected && selected.salesTeamId !== actor.salesTeamId) {
          throw new LeadDistributionError(403, 'LEAD_TEAM_SCOPE_DENIED', 'Sales Managers may assign Leads only within their team.');
        }
        if (!selected) throw new LeadDistributionError(422, 'ACTIVE_SALES_ASSIGNEE_REQUIRED', 'Choose an active Sales employee in your team.');
        reason = targetId === actor.employeeId ? 'MANUAL_CREATOR' : 'MANUAL_MANAGER_ASSIGNMENT';
      } else if (!input.isExternalDelivery && input.requestedAssigneeId) {
        selected = requestedEmployee;
        if (!selected) throw new LeadDistributionError(422, 'ACTIVE_SALES_ASSIGNEE_REQUIRED', 'Choose an active eligible Sales employee.');
        reason = 'MANUAL_ADMIN_ASSIGNMENT';
      } else {
        systemAssignment = true;
        if (config.enabled && config.previousSalespersonPreference && input.lead.sourceId === 'REPEAT_CUSTOMER') {
          const previousEmployeeId = await this.previousOwner(tx, input.lead.customerId);
          selected = eligible.find(employee => employee.employeeId === previousEmployeeId);
          if (selected) {
            reason = 'PREVIOUS_SALESPERSON';
            ruleId = 'repeat-customer';
          }
        }
        if (!selected && config.enabled && eligible.length > 0) {
          const state = (await tx.get('lead_distribution_state', config.id) || {}) as UnknownRecord;
          const orderedTeam = [...teamEmployees].sort(distributionOrder);
          const lastIndex = orderedTeam.findIndex(employee => employee.employeeId === state.lastAssignedEmployeeId);
          for (let offset = 1; offset <= orderedTeam.length; offset += 1) {
            const candidate = orderedTeam[(Math.max(lastIndex, -1) + offset) % orderedTeam.length];
            if (eligible.some(employee => employee.employeeId === candidate.employeeId)) { selected = candidate; break; }
          }
          if (selected) {
            reason = 'ROUND_ROBIN';
            ruleId = 'kashmir-default';
            tx.set('lead_distribution_state', config.id, {
              configId: config.id, lastAssignedEmployeeId: selected.employeeId,
              sequence: Number(state.sequence || 0) + 1, updatedAt: input.lead.createdAt,
            } satisfies LeadDistributionState);
          }
        }
      }

      const actorEmployeeId = systemAssignment ? 'SYSTEM' : actor.employeeId;
      const lead = {
        ...input.lead,
        salesTeamId: selected?.salesTeamId || config.salesTeamId,
        ...(selected ? { assignedEmployeeId: selected.employeeId, assignedEmployeeName: selected.name } : {}),
        assignmentStatus: selected ? 'ASSIGNED' : 'ASSIGNMENT_REQUIRED',
        assignmentReason: reason,
        ...(ruleId ? { assignmentRuleId: ruleId } : {}),
        assignedAt: input.lead.createdAt,
      } as Lead;
      const history = assignmentEvent(lead.id, undefined, selected?.employeeId, lead.salesTeamId!, reason, actorEmployeeId, lead.createdAt, ruleId);
      if (input.newCustomer) tx.set('customers', input.newCustomer.id, input.newCustomer);
      tx.set('leads', lead.id, lead);
      tx.set('lead_assignment_history', history.id, history);
      tx.set('audit_logs', `audit-lead-created-${lead.id}`, auditEvent('LEAD_CREATED', actor.employeeId, lead.id, null, lead, lead.createdAt, 'Structured travel enquiry created.'));
      if (input.linkedExistingCustomer) {
        tx.set('audit_logs', `audit-lead-customer-${lead.id}`, auditEvent('LEAD_CUSTOMER_LINKED', actor.employeeId, lead.id, null, { customerId: lead.customerId }, lead.createdAt, 'Existing Customer linked to Lead.'));
      }
      tx.set('audit_logs', `audit-lead-assignment-${lead.id}`, auditEvent(
        selected ? (systemAssignment ? 'LEAD_AUTO_ASSIGNED' : 'LEAD_REASSIGNED') : 'LEAD_ASSIGNMENT_REQUIRED',
        actorEmployeeId, lead.id, null,
        {
          ...(selected ? { assignedEmployeeId: selected.employeeId } : {}),
          salesTeamId: lead.salesTeamId, reason, ...(ruleId ? { ruleId } : {}),
        },
        lead.createdAt,
        selected ? `Lead assigned by ${reason}.` : 'No eligible Sales employee was available; manual assignment is required.',
      ));
      return { lead, history, idempotent: false };
    });
  }

  async reassignLead(input: ReassignLeadInput): Promise<{ lead: Lead; history: LeadAssignmentHistoryEntry }> {
    return this.storage.runTransaction(async tx => {
      const stored = await tx.get('leads', input.leadId) as Lead | null;
      if (!stored) throw new LeadDistributionError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      if (stored.updatedAt !== input.expectedUpdatedAt) throw new LeadDistributionError(409, 'LEAD_VERSION_CONFLICT', 'This Lead changed after you opened it. Reload before reassigning.');
      if (input.actor.role === 'Sales Executive') throw new LeadDistributionError(403, 'LEAD_REASSIGNMENT_DENIED', 'Sales Executives cannot reassign Leads.');
      if (!['Founder', 'Admin', 'Sales Manager'].includes(input.actor.role)) throw new LeadDistributionError(403, 'LEAD_REASSIGNMENT_DENIED', 'This role cannot reassign Leads.');
      if (input.actor.role === 'Sales Manager' && (!input.actor.salesTeamId || stored.salesTeamId !== input.actor.salesTeamId)) {
        throw new LeadDistributionError(403, 'LEAD_TEAM_SCOPE_DENIED', 'Sales Managers may reassign only Leads in their team.');
      }
      const targetMatches = await tx.findByField('employees', 'employeeId', input.targetEmployeeId, 2);
      if (targetMatches.length !== 1) throw new LeadDistributionError(422, 'ACTIVE_SALES_ASSIGNEE_REQUIRED', 'The target employee is invalid or ambiguous.');
      const target = normalizeEmployee(targetMatches[0]);
      if (!target) throw new LeadDistributionError(422, 'ACTIVE_SALES_ASSIGNEE_REQUIRED', 'The target must be an active Sales employee.');
      if (input.actor.role === 'Sales Manager' && target.salesTeamId !== input.actor.salesTeamId) {
        throw new LeadDistributionError(403, 'LEAD_TEAM_SCOPE_DENIED', 'Sales Managers cannot assign outside their team.');
      }
      const now = new Date().toISOString();
      const reason: LeadAssignmentReason = input.actor.role === 'Sales Manager' ? 'MANUAL_MANAGER_ASSIGNMENT' : 'MANUAL_ADMIN_ASSIGNMENT';
      const updated = {
        ...stored, assignedEmployeeId: target.employeeId, assignedEmployeeName: target.name,
        salesTeamId: target.salesTeamId, assignmentStatus: 'ASSIGNED', assignmentReason: reason,
        assignedAt: now, updatedAt: now, updatedByEmployeeId: input.actor.employeeId,
      } as Lead;
      const history = assignmentEvent(stored.id, stored.assignedEmployeeId, target.employeeId, target.salesTeamId, reason, input.actor.employeeId, now, undefined, input.note);
      tx.update('leads', stored.id, updated);
      tx.set('lead_assignment_history', history.id, history);
      tx.set('audit_logs', `audit-lead-reassigned-${history.id}`, auditEvent('LEAD_REASSIGNED', input.actor.employeeId, stored.id, stored, updated, now, input.note || 'Lead reassigned.'));
      return { lead: updated, history };
    });
  }

  async getHistory(leadId: string, actor: LeadAssignmentActor): Promise<LeadAssignmentHistoryEntry[]> {
    return this.storage.runTransaction(async tx => {
      const lead = await tx.get('leads', leadId);
      if (!lead) throw new LeadDistributionError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
      if (!canReadLead(actor, lead)) throw new LeadDistributionError(403, 'LEAD_SCOPE_DENIED', 'This Lead is outside your Sales scope.');
      const events = await tx.findByField('lead_assignment_history', 'leadId', leadId, 200);
      return events.sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp))) as LeadAssignmentHistoryEntry[];
    });
  }

  async getOverview(actor: LeadAssignmentActor): Promise<LeadDistributionOverview> {
    if (!['Founder', 'Admin'].includes(actor.role)) throw new LeadDistributionError(403, 'DISTRIBUTION_ADMIN_REQUIRED', 'Founder or Admin access is required.');
    return this.storage.runTransaction(async tx => {
      const configuration = await this.configuration(tx);
      const employees = await this.teamEmployees(tx, configuration.salesTeamId);
      const state = (await tx.get('lead_distribution_state', configuration.id) || {
        configId: configuration.id, sequence: 0, updatedAt: '',
      }) as LeadDistributionState;
      return {
        configuration,
        state,
        eligibleEmployees: employees.sort(distributionOrder).map(employee => ({
          employeeId: employee.employeeId, name: employee.name, role: employee.role, active: true,
          excluded: configuration.excludedEmployeeIds.includes(employee.employeeId),
        })),
        roundRobinOrder: employees.filter(employee => allowedByConfiguration(employee, configuration)).sort(distributionOrder).map(employee => employee.employeeId),
      };
    });
  }

  async updateConfiguration(raw: UnknownRecord, actor: LeadAssignmentActor): Promise<LeadDistributionOverview> {
    if (!['Founder', 'Admin'].includes(actor.role)) throw new LeadDistributionError(403, 'DISTRIBUTION_ADMIN_REQUIRED', 'Founder or Admin access is required.');
    const allowed = new Set(['enabled', 'salesTeamId', 'includeSalesExecutives', 'includeSalesManagers', 'previousSalespersonPreference', 'excludedEmployeeIds']);
    for (const field of Object.keys(raw)) if (!allowed.has(field)) throw new LeadDistributionError(400, 'INVALID_DISTRIBUTION_FIELD', `${field} is not configurable.`);
    for (const field of ['enabled', 'includeSalesExecutives', 'includeSalesManagers', 'previousSalespersonPreference']) {
      if (field in raw && typeof raw[field] !== 'boolean') throw new LeadDistributionError(400, 'INVALID_DISTRIBUTION_FIELD', `${field} must be boolean.`);
    }
    if ('excludedEmployeeIds' in raw && !Array.isArray(raw.excludedEmployeeIds)) {
      throw new LeadDistributionError(400, 'INVALID_DISTRIBUTION_FIELD', 'excludedEmployeeIds must be an array.');
    }
    await this.storage.runTransaction(async tx => {
      const existing = await this.configuration(tx);
      const teamId = nonEmpty(raw.salesTeamId) || existing.salesTeamId;
      const team = await tx.get('sales_teams', teamId);
      if (!team || team.active !== true) throw new LeadDistributionError(422, 'ACTIVE_SALES_TEAM_REQUIRED', 'Choose an active Sales team.');
      const now = new Date().toISOString();
      const configuration = defaultLeadDistributionConfiguration(teamId);
      configuration.enabled = typeof raw.enabled === 'boolean' ? raw.enabled : existing.enabled;
      configuration.salesTeamName = nonEmpty(team.name) || 'Kashmir Sales Team';
      configuration.includeSalesExecutives = typeof raw.includeSalesExecutives === 'boolean' ? raw.includeSalesExecutives : existing.includeSalesExecutives;
      configuration.includeSalesManagers = typeof raw.includeSalesManagers === 'boolean' ? raw.includeSalesManagers : existing.includeSalesManagers;
      configuration.previousSalespersonPreference = typeof raw.previousSalespersonPreference === 'boolean' ? raw.previousSalespersonPreference : existing.previousSalespersonPreference;
      configuration.excludedEmployeeIds = raw.excludedEmployeeIds === undefined ? existing.excludedEmployeeIds : uniqueStrings(raw.excludedEmployeeIds);
      configuration.updatedAt = now;
      configuration.updatedByEmployeeId = actor.employeeId;
      configuration.rules = defaultLeadDistributionConfiguration(teamId).rules.map(rule => ({
        ...rule,
        eligibleRoles: [
          ...(configuration.includeSalesExecutives ? ['Sales Executive' as const] : []),
          ...(configuration.includeSalesManagers ? ['Sales Manager' as const] : []),
        ],
        excludedEmployeeIds: configuration.excludedEmployeeIds,
        active: configuration.enabled && (rule.assignmentMethod !== 'PREVIOUS_SALESPERSON' || configuration.previousSalespersonPreference),
      }));
      tx.set('lead_distribution_configs', configuration.id, configuration);
      tx.set('audit_logs', `audit-distribution-${randomUUID()}`, auditEvent('DISTRIBUTION_RULE_UPDATED', actor.employeeId, configuration.id, existing, configuration, now, 'Lead distribution configuration updated.'));
    });
    return this.getOverview(actor);
  }

  async assignmentOptions(actor: LeadAssignmentActor): Promise<SalesEmployee[]> {
    if (!['Founder', 'Admin', 'Sales Manager'].includes(actor.role)) return [];
    return this.storage.runTransaction(async tx => {
      const config = await this.configuration(tx);
      const teamId = actor.role === 'Sales Manager' ? actor.salesTeamId : config.salesTeamId;
      if (!teamId) return [];
      return (await this.teamEmployees(tx, teamId)).sort((left, right) => left.name.localeCompare(right.name));
    });
  }
}

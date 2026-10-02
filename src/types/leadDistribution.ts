export type LeadAssignmentReason =
  | 'MANUAL_CREATOR'
  | 'PREVIOUS_SALESPERSON'
  | 'ROUND_ROBIN'
  | 'MANUAL_MANAGER_ASSIGNMENT'
  | 'MANUAL_ADMIN_ASSIGNMENT'
  | 'FALLBACK_ASSIGNMENT';

export type LeadAssignmentStatus = 'ASSIGNED' | 'ASSIGNMENT_REQUIRED';

export interface LeadDistributionRule {
  id: string;
  name: string;
  active: boolean;
  priority: number;
  salesTeamId: string;
  eligibleRoles: Array<'Sales Executive' | 'Sales Manager'>;
  excludedEmployeeIds: string[];
  assignmentMethod: 'PREVIOUS_SALESPERSON' | 'ROUND_ROBIN';
  sourceCondition?: 'REPEAT_CUSTOMER' | 'DEFAULT';
}

export interface LeadDistributionConfiguration {
  id: string;
  enabled: boolean;
  salesTeamId: string;
  salesTeamName: string;
  includeSalesExecutives: boolean;
  includeSalesManagers: boolean;
  previousSalespersonPreference: boolean;
  excludedEmployeeIds: string[];
  rules: LeadDistributionRule[];
  updatedAt?: string;
  updatedByEmployeeId?: string;
}

export interface LeadDistributionState {
  configId: string;
  lastAssignedEmployeeId?: string;
  sequence: number;
  updatedAt: string;
}

export interface LeadAssignmentHistoryEntry {
  id: string;
  leadId: string;
  previousEmployeeId?: string;
  newEmployeeId?: string;
  salesTeamId: string;
  reason: LeadAssignmentReason;
  ruleId?: string;
  actorEmployeeId: string | 'SYSTEM';
  timestamp: string;
  note?: string;
}

export interface LeadDistributionOverview {
  configuration: LeadDistributionConfiguration;
  state: LeadDistributionState;
  eligibleEmployees: Array<{
    employeeId: string;
    name: string;
    role: 'Sales Executive' | 'Sales Manager';
    active: boolean;
    excluded: boolean;
  }>;
  roundRobinOrder: string[];
}

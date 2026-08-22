import { UserRole } from '../../src/types/index.js';

export interface ToolContext {
  userId: string;
  userName: string;
  role: UserRole;
}

export interface ToolDefinition {
  name: string;
  description: string;
  requiredRole: UserRole[];
  parametersSchema: Record<string, string>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresApproval: boolean;
}

export const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  'crm.getLead': {
    name: 'crm.getLead',
    description: 'Fetch detailed information and conversation history for a specific lead.',
    requiredRole: ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'],
    parametersSchema: { leadId: 'string' },
    riskLevel: 'LOW',
    requiresApproval: false,
  },
  'crm.updateLead': {
    name: 'crm.updateLead',
    description: 'Update lead status, follow-up dates, notes, or score.',
    requiredRole: ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'],
    parametersSchema: { leadId: 'string', updates: 'object' },
    riskLevel: 'MEDIUM',
    requiresApproval: false,
  },
  'crm.createTask': {
    name: 'crm.createTask',
    description: 'Create an automated or manual follow-up task assigned to a team member.',
    requiredRole: ['Founder', 'Admin', 'Sales Manager', 'Sales Executive', 'Operations'],
    parametersSchema: { title: 'string', assignedTo: 'string', dueAt: 'string', priority: 'string' },
    riskLevel: 'LOW',
    requiresApproval: false,
  },
  'sales.generateQuote': {
    name: 'sales.generateQuote',
    description: 'Calculate pricing, inclusions, and draft an itinerary quote for Kashmir/Ladakh/Jammu travel.',
    requiredRole: ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'],
    parametersSchema: { leadId: 'string', packageId: 'string', customDiscount: 'number' },
    riskLevel: 'MEDIUM',
    requiresApproval: false,
  },
  'marketing.createContentDraft': {
    name: 'marketing.createContentDraft',
    description: 'Draft marketing content calendar items, Instagram reels scripts, or newsletter copy.',
    requiredRole: ['Founder', 'Admin', 'Marketing'],
    parametersSchema: { topic: 'string', platform: 'string', targetDestination: 'string' },
    riskLevel: 'LOW',
    requiresApproval: false,
  },
  'meta.createCampaign': {
    name: 'meta.createCampaign',
    description: 'Create and deploy a Meta Ads campaign for travel packages.',
    requiredRole: ['Founder', 'Marketing'],
    parametersSchema: { campaignName: 'string', budget: 'number', destination: 'string' },
    riskLevel: 'HIGH',
    requiresApproval: true,
  },
  'social.publishPost': {
    name: 'social.publishPost',
    description: 'Publish approved creatives to Instagram/Facebook feeds.',
    requiredRole: ['Founder', 'Marketing'],
    parametersSchema: { contentId: 'string', caption: 'string' },
    riskLevel: 'HIGH',
    requiresApproval: true,
  },
};

export function validateToolAccess(toolName: string, role: UserRole): { allowed: boolean; reason?: string } {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) {
    return { allowed: false, reason: `Unknown tool "${toolName}". Tool not registered in OS gateway.` };
  }
  if (role === 'Founder') {
    return { allowed: true };
  }
  if (!tool.requiredRole.includes(role)) {
    return {
      allowed: false,
      reason: `Access Denied: Role "${role}" is not authorized to invoke "${toolName}". Required: ${tool.requiredRole.join(', ')}`,
    };
  }
  return { allowed: true };
}

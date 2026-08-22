export type UserRole =
  | 'Founder'
  | 'Admin'
  | 'Sales Manager'
  | 'Sales Executive'
  | 'Marketing'
  | 'Operations'
  | 'Accounts';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  department: string;
  avatarUrl?: string;
  active: boolean;
  createdAt: string;
  lastLogin: string;
}

export interface RolePermissions {
  role: UserRole;
  description: string;
  canViewAllSales: boolean;
  canManageLeads: boolean;
  canSendQuotes: boolean;
  canManageMarketing: boolean;
  canViewFinancials: boolean;
  canManageOperations: boolean;
  canManageUsers: boolean;
  canAccessAiCommand: boolean;
  canApproveActions: boolean;
  canViewAuditLogs: boolean;
  canManageSettings: boolean;
  leadAccessScope: 'ALL' | 'ASSIGNED_ONLY' | 'NONE';
}

export type CustomerType = 'B2C' | 'B2B';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsApp?: string;
  email: string;
  city: string;
  customerType: CustomerType;
  preferences: string[];
  notes: string;
  totalBookings: number;
  lifetimeValue: number;
  companyId?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  gstNumber?: string;
  contactPerson: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
  isDemo?: boolean;
}

export type DestinationRegion =
  | 'Kashmir'
  | 'Jammu'
  | 'Ladakh'
  | 'Himachal'
  | 'Kerala'
  | 'Goa'
  | 'Golden Triangle'
  | 'General'
  | 'Other Domestic';

export type TripType =
  | 'Honeymoon'
  | 'Family Vacation'
  | 'Adventure & Trekking'
  | 'Luxury Houseboat & Resort'
  | 'Corporate Group'
  | 'Pilgrimage'
  | 'Custom Private Tour';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'QUOTE_SENT'
  | 'NEGOTIATION'
  | 'BOOKED'
  | 'LOST'
  | 'NURTURE';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface Lead {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  source: string;
  sourcePlatform: 'Meta Ads' | 'Google Ads' | 'Instagram Direct' | 'WhatsApp Inbound' | 'Website Form' | 'Referral' | 'Direct Call';
  campaignId?: string;
  destination: DestinationRegion;
  travelStartDate: string;
  travelEndDate: string;
  travelerCount: number;
  tripType: TripType;
  budget: number;
  status: LeadStatus;
  leadScore: number;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  priority: Priority;
  lastContactAt: string;
  nextFollowUpAt: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  isDemo?: boolean;
  scoreReasoning?: string;
  keyInterests?: string[];
}

export interface LeadEvent {
  id: string;
  leadId: string;
  actorType: 'HUMAN' | 'AI' | 'SYSTEM';
  actorId: string;
  actorName: string;
  eventType: 'STATUS_CHANGE' | 'NOTE_ADDED' | 'FOLLOWUP_SCHEDULED' | 'AI_ANALYSIS' | 'QUOTE_CREATED' | 'ASSIGNMENT';
  description: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type MessageSenderType = 'CUSTOMER' | 'EMPLOYEE' | 'AI' | 'SYSTEM';

export interface Message {
  id: string;
  conversationId: string;
  senderType: MessageSenderType;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  aiGenerated?: boolean;
  aiApproved?: boolean;
  metadata?: {
    intent?: string;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'hesitant';
    suggestedAction?: string;
  };
}

export interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  leadId?: string;
  channel: 'WhatsApp' | 'Instagram' | 'Facebook' | 'Email' | 'Website Chat' | 'Phone Log';
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  status: 'ACTIVE' | 'PENDING' | 'RESOLVED';
  unreadCount: number;
  lastMessage: string;
  lastMessageTimestamp: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export type TaskSource = 'HUMAN' | 'AI' | 'SYSTEM';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'PENDING';

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  assignedToId?: string;
  assignedToName: string;
  createdBy?: string;
  createdByName?: string;
  relatedLeadId?: string;
  relatedCustomerId?: string;
  priority: Priority;
  status: TaskStatus;
  dueAt: string;
  source: TaskSource;
  createdAt: string;
  completedAt?: string;
  aiReasoning?: string;
  isDemo?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'ALERT' | 'APPROVAL' | 'SUCCESS';
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface TravelPackage {
  id: string;
  title: string;
  destination: DestinationRegion;
  durationDays: number;
  durationNights: number;
  basePrice: number;
  featuredImage?: string;
  highlights: string[];
  inclusions: string[];
  itinerary: { day: number; title: string; description: string }[];
}

export interface Quote {
  id: string;
  leadId: string;
  customerId: string;
  customerName: string;
  destination: DestinationRegion;
  travelerCount: number;
  packageId?: string;
  packageName?: string;
  totalAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  validUntil: string;
  createdAt: string;
  notes?: string;
  isDemo?: boolean;
}

export interface Booking {
  id: string;
  quoteId?: string;
  leadId?: string;
  customerId: string;
  customerName: string;
  destination: DestinationRegion;
  travelStartDate: string;
  travelEndDate: string;
  travelerCount: number;
  totalAmount: number;
  paidAmount: number;
  status: 'CONFIRMED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  isDemo?: boolean;
}

export type AiCategory =
  | 'SALES'
  | 'MARKETING'
  | 'CUSTOMER'
  | 'OPERATIONS'
  | 'FINANCE'
  | 'GENERAL';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AiRecommendation {
  id: string;
  category: AiCategory;
  title: string;
  description: string;
  priority: Priority;
  relatedEntityType?: 'LEAD' | 'CAMPAIGN' | 'CUSTOMER' | 'QUOTE' | 'OPERATION';
  relatedEntityId?: string;
  recommendedAction: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'EXECUTED';
  confidenceScore: number;
  createdAt: string;
  isDemo?: boolean;
}

export type AiActionStatus =
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

export interface AiAction {
  id: string;
  agent: string;
  actionType: string;
  targetType: string;
  targetId: string;
  parameters: Record<string, any>;
  riskLevel: RiskLevel;
  approvalRequired: boolean;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: string;
  executedAt?: string;
  result?: string;
  status: AiActionStatus;
  reasoning: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface ApprovalItem {
  id: string;
  actionId?: string;
  title?: string;
  category?: string;
  summary: string;
  aiReasoning?: string;
  reason?: string;
  riskLevel?: RiskLevel;
  impactLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  actionType?: string;
  proposedData?: Record<string, any>;
  details?: Record<string, any>;
  originalData?: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedBy: string;
  requiresRole?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  feedback?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorType: 'HUMAN' | 'AI' | 'SYSTEM';
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  reason?: string;
  approvalId?: string;
}

export interface Integration {
  id: string;
  name: string;
  category: 'ADVERTISING' | 'MESSAGING' | 'CREATIVE' | 'PAYMENTS' | 'COMMUNICATION' | 'PRODUCTIVITY';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'REQUIRES_AUTH' | 'CONFIGURATION_REQUIRED';
  description: string;
  iconName: string;
  apiDocsUrl?: string;
  lastSync?: string;
  features: string[];
}

export interface SalesAiAnalysisResult {
  summary: string;
  intent: string;
  objections: string[];
  leadScore: number;
  recommendedAction: string;
  followUpRecommendation: string;
  draftReply: string;
  confidence: number;
  suggestedPackage?: string;
}

export interface MarketingAiStrategyResult {
  objective: string;
  audience: string;
  campaignIdea: string;
  contentPillars: string[];
  contentIdeas: { title: string; angle: string; format: string; hook: string }[];
  recommendedFormats: string[];
  recommendedCTA: string;
  KPIs: string[];
}

export interface ContentItem {
  id: string;
  title: string;
  channel: 'Instagram' | 'Facebook' | 'Meta Ads' | 'Email' | 'YouTube' | 'Blog';
  contentType: 'Reel' | 'Carousel' | 'Static Post' | 'Ad Copy' | 'Newsletter' | 'Story';
  destination: string;
  caption: string;
  visualPrompt?: string;
  hashtags: string[];
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  scheduledFor: string;
  generatedBy: 'AI' | 'HUMAN';
  createdAt?: string;
}

export interface MarketingPillar {
  id: string;
  pillarName: string;
  destination: string;
  theme: string;
  targetAudience: string;
  primaryChannel: string;
  sampleHooks: string[];
}

export interface AdCampaign {
  id: string;
  name: string;
  platform: 'Meta Ads' | 'Google Ads' | 'Instagram Sponsored';
  targetDestination: string;
  objective: string;
  budget: number;
  spent: number;
  leadsGenerated: number;
  bookingsCount: number;
  revenueGenerated: number;
  roas: number;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startDate: string;
  endDate?: string;
}

export interface AiAgentConfig {
  id: string;
  name: string;
  purpose: string;
  autonomyLevel: 'SUGGEST_ONLY' | 'ASSISTED' | 'SEMI_AUTONOMOUS' | 'FULL_AUTONOMOUS';
  permittedTools: string[];
  requiresHumanApproval: boolean;
  status: 'ACTIVE' | 'STANDBY' | 'MAINTENANCE';
}

export interface MarketingAiGenerateResult {
  campaignTitle: string;
  targetAudienceRecommendation: string;
  videoHooks: string[];
  adCopies: string[];
  instagramCaptions: string[];
  visualPrompts: string[];
}

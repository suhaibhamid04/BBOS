import { randomUUID } from 'node:crypto';
import { getAdminDb } from '../firebaseAdmin.js';
import { authorizeResource } from '../authorization/policyEngine.js';
import { bookingResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationPrincipal } from '../authorization/policyTypes.js';
import type { AuditLog, UserRole } from '../../src/types/index.js';
import type { Booking } from '../../src/types/booking.js';
import {
  EMERGENCY_SPEND_CATEGORIES,
  OPERATIONAL_ISSUE_CATEGORIES,
  OPERATIONAL_ISSUE_PRIORITIES,
  type EmergencySpendRequest,
  type EmergencySpendStatus,
  type OperationalChangeRequest,
  type OperationalIssue,
  type OperationalServiceLink,
} from '../../src/types/liveOperations.js';

type UnknownRecord = Record<string, unknown>;

export interface LiveOperationsActor extends AuthorizationPrincipal {
  name: string;
  role: UserRole;
}

interface EntityCommit<T> {
  entity: T;
  audit: AuditLog;
  expectedBookingUpdatedAt: string;
}

interface IssueUpdateCommit extends EntityCommit<OperationalIssue> {
  expectedIssueUpdatedAt: string;
}

interface SpendDecisionCommit extends EntityCommit<EmergencySpendRequest> {
  expectedSpendUpdatedAt: string;
}

export interface LiveOperationsStorage {
  getBooking(bookingId: string): Promise<Booking | null>;
  linkedServiceExists(bookingId: string, link: OperationalServiceLink): Promise<boolean>;
  getIssue(issueId: string): Promise<OperationalIssue | null>;
  createIssue(commit: EntityCommit<OperationalIssue>): Promise<void>;
  updateIssue(commit: IssueUpdateCommit): Promise<void>;
  listIssues(bookingIds: string[]): Promise<OperationalIssue[]>;
  createChangeRequest(commit: EntityCommit<OperationalChangeRequest>): Promise<void>;
  listChangeRequests(bookingIds: string[]): Promise<OperationalChangeRequest[]>;
  getSpendRequest(requestId: string): Promise<EmergencySpendRequest | null>;
  createSpendRequest(commit: EntityCommit<EmergencySpendRequest>): Promise<void>;
  decideSpendRequest(commit: SpendDecisionCommit): Promise<void>;
  listSpendRequests(filter: { status?: EmergencySpendStatus; requestedByEmployeeId?: string }): Promise<EmergencySpendRequest[]>;
  listSpendRequestsForBookings(bookingIds: string[]): Promise<EmergencySpendRequest[]>;
}

export class LiveOperationsError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'LiveOperationsError';
  }
}

function clone<T>(value: T): T { return structuredClone(value); }

function record(value: unknown, code: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LiveOperationsError(400, code, 'A JSON object payload is required.');
  }
  return value as UnknownRecord;
}

function allowlist(payload: UnknownRecord, allowed: readonly string[], code: string) {
  const rejected = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (rejected.length) throw new LiveOperationsError(400, code, `Unsupported or server-controlled fields: ${rejected.join(', ')}.`);
}

function textValue(value: unknown, field: string, max = 1000, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new LiveOperationsError(400, 'INVALID_OPERATIONAL_INPUT', `${field} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new LiveOperationsError(400, 'INVALID_OPERATIONAL_INPUT', `${field} is invalid.`);
  }
  return value as T;
}

function parseLink(value: unknown): OperationalServiceLink | undefined {
  if (value === undefined) return undefined;
  const payload = record(value, 'INVALID_SERVICE_LINK');
  allowlist(payload, ['type', 'serviceId'], 'INVALID_SERVICE_LINK');
  return {
    type: enumValue(payload.type, ['ACCOMMODATION', 'TRANSPORT', 'ACTIVITY'] as const, 'linkedService.type'),
    serviceId: textValue(payload.serviceId, 'linkedService.serviceId', 128)!,
  };
}

function audit(actor: LiveOperationsActor, action: string, entityType: string, entityId: string, before: unknown, after: unknown, reason: string, now: string): AuditLog {
  return {
    id: `audit-live-operations-${randomUUID()}`,
    timestamp: now,
    actorType: 'HUMAN',
    actorId: actor.employeeId,
    actorName: `${actor.name} (${actor.role})`,
    action,
    entityType,
    entityId,
    before,
    after,
    reason,
  };
}

function requireLiveBooking(booking: Booking) {
  if (!['IN_OPERATIONS', 'TRAVELLING'].includes(booking.status)) {
    throw new LiveOperationsError(422, 'BOOKING_NOT_LIVE', 'Live operational actions require an IN_OPERATIONS or TRAVELLING Booking.');
  }
}

function authorize(actor: LiveOperationsActor, action: 'MANAGE_OPERATIONAL_ISSUE' | 'REQUEST_OPERATIONAL_SPEND' | 'APPROVE_OPERATIONAL_SPEND', booking: Booking) {
  const decision = authorizeResource(actor, 'BOOKING', action, bookingResourceContext(booking));
  if (!decision.allowed) throw new LiveOperationsError(403, decision.code, decision.reason);
}

export class LiveOperationsService {
  constructor(
    private readonly storage: LiveOperationsStorage = new FirestoreLiveOperationsStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createIssue(bookingId: string, input: unknown, actor: LiveOperationsActor): Promise<OperationalIssue> {
    const booking = await this.requiredBooking(bookingId);
    authorize(actor, 'MANAGE_OPERATIONAL_ISSUE', booking);
    requireLiveBooking(booking);
    const payload = record(input, 'INVALID_ISSUE_PAYLOAD');
    allowlist(payload, ['category', 'title', 'description', 'priority', 'hasFinancialImpact', 'linkedService'], 'PROTECTED_ISSUE_FIELD');
    if (typeof payload.hasFinancialImpact !== 'boolean') {
      throw new LiveOperationsError(400, 'INVALID_OPERATIONAL_INPUT', 'hasFinancialImpact must be boolean.');
    }
    const linkedService = parseLink(payload.linkedService);
    if (linkedService && !(await this.storage.linkedServiceExists(bookingId, linkedService))) {
      throw new LiveOperationsError(422, 'LINKED_SERVICE_NOT_FOUND', 'The linked service does not belong to this Booking.');
    }
    const now = this.now().toISOString();
    const issue: OperationalIssue = {
      id: `operations-issue-${randomUUID()}`,
      bookingId,
      category: enumValue(payload.category, OPERATIONAL_ISSUE_CATEGORIES, 'category'),
      title: textValue(payload.title, 'title', 160)!,
      description: textValue(payload.description, 'description', 3000)!,
      priority: enumValue(payload.priority, OPERATIONAL_ISSUE_PRIORITIES, 'priority'),
      status: 'OPEN',
      reportedAt: now,
      reportedByEmployeeId: actor.employeeId,
      ...(booking.assignedOperationsEmployeeId ? { assignedEmployeeId: booking.assignedOperationsEmployeeId } : {}),
      hasFinancialImpact: payload.hasFinancialImpact,
      ...(linkedService ? { linkedService } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.createIssue({
      entity: issue,
      expectedBookingUpdatedAt: booking.updatedAt,
      audit: audit(actor, 'OPERATIONS_ISSUE_CREATED', 'OPERATIONAL_ISSUE', issue.id, null, issue, `Issue created for Booking ${booking.bookingReference}.`, now),
    });
    return issue;
  }

  async updateIssue(bookingId: string, issueId: string, input: unknown, actor: LiveOperationsActor): Promise<OperationalIssue> {
    const [booking, existing] = await Promise.all([this.requiredBooking(bookingId), this.storage.getIssue(issueId)]);
    authorize(actor, 'MANAGE_OPERATIONAL_ISSUE', booking);
    requireLiveBooking(booking);
    if (!existing || existing.bookingId !== bookingId) throw new LiveOperationsError(404, 'ISSUE_NOT_FOUND', 'Operational issue not found for this Booking.');
    if (existing.status === 'RESOLVED') throw new LiveOperationsError(422, 'ISSUE_ALREADY_RESOLVED', 'Resolved issues are immutable.');
    const payload = record(input, 'INVALID_ISSUE_PAYLOAD');
    allowlist(payload, ['title', 'description', 'priority', 'status', 'resolutionNotes', 'hasFinancialImpact', 'expectedUpdatedAt'], 'PROTECTED_ISSUE_FIELD');
    if (payload.expectedUpdatedAt !== existing.updatedAt) throw new LiveOperationsError(409, 'ISSUE_CONFLICT', 'Issue changed; reload and retry.');
    const nextStatus = payload.status === undefined
      ? existing.status
      : enumValue(payload.status, ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const, 'status');
    const resolutionNotes = payload.resolutionNotes === undefined
      ? existing.resolutionNotes
      : textValue(payload.resolutionNotes, 'resolutionNotes', 3000);
    if (nextStatus === 'RESOLVED' && !resolutionNotes) {
      throw new LiveOperationsError(400, 'RESOLUTION_NOTES_REQUIRED', 'Resolution notes are required to resolve an issue.');
    }
    if (payload.hasFinancialImpact !== undefined && typeof payload.hasFinancialImpact !== 'boolean') {
      throw new LiveOperationsError(400, 'INVALID_OPERATIONAL_INPUT', 'hasFinancialImpact must be boolean.');
    }
    const now = this.now().toISOString();
    const updated: OperationalIssue = {
      ...existing,
      ...(payload.title !== undefined ? { title: textValue(payload.title, 'title', 160)! } : {}),
      ...(payload.description !== undefined ? { description: textValue(payload.description, 'description', 3000)! } : {}),
      ...(payload.priority !== undefined ? { priority: enumValue(payload.priority, OPERATIONAL_ISSUE_PRIORITIES, 'priority') } : {}),
      ...(payload.hasFinancialImpact !== undefined ? { hasFinancialImpact: payload.hasFinancialImpact as boolean } : {}),
      status: nextStatus,
      ...(resolutionNotes ? { resolutionNotes } : {}),
      ...(nextStatus === 'RESOLVED' ? { resolvedAt: now, resolvedByEmployeeId: actor.employeeId } : {}),
      updatedAt: now,
    };
    const action = nextStatus === 'RESOLVED' ? 'OPERATIONS_ISSUE_RESOLVED' : 'OPERATIONS_ISSUE_UPDATED';
    await this.storage.updateIssue({
      entity: updated,
      expectedBookingUpdatedAt: booking.updatedAt,
      expectedIssueUpdatedAt: existing.updatedAt,
      audit: audit(actor, action, 'OPERATIONAL_ISSUE', issueId, existing, updated, `Issue ${nextStatus.toLowerCase()} for Booking ${booking.bookingReference}.`, now),
    });
    return updated;
  }

  async createChangeRequest(bookingId: string, input: unknown, actor: LiveOperationsActor): Promise<OperationalChangeRequest> {
    const booking = await this.requiredBooking(bookingId);
    authorize(actor, 'MANAGE_OPERATIONAL_ISSUE', booking);
    requireLiveBooking(booking);
    const payload = record(input, 'INVALID_CHANGE_REQUEST');
    allowlist(payload, ['changeType', 'description', 'linkedService'], 'PROTECTED_CHANGE_REQUEST_FIELD');
    const linkedService = parseLink(payload.linkedService);
    if (linkedService && !(await this.storage.linkedServiceExists(bookingId, linkedService))) {
      throw new LiveOperationsError(422, 'LINKED_SERVICE_NOT_FOUND', 'The linked service does not belong to this Booking.');
    }
    const now = this.now().toISOString();
    const entity: OperationalChangeRequest = {
      id: `operational-change-${randomUUID()}`,
      bookingId,
      changeType: enumValue(payload.changeType, ['SUPPLIER', 'HOTEL_OR_PROPERTY', 'ROOM_OR_CATEGORY', 'SERVICE_QUANTITY', 'SERVICE_SCOPE', 'COMMERCIAL_COST'] as const, 'changeType'),
      description: textValue(payload.description, 'description', 3000)!,
      ...(linkedService ? { linkedService } : {}),
      status: 'REQUIRES_COMMERCIAL_APPROVAL',
      requestedByEmployeeId: actor.employeeId,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.createChangeRequest({
      entity,
      expectedBookingUpdatedAt: booking.updatedAt,
      audit: audit(actor, 'OPERATIONAL_CHANGE_ESCALATED', 'OPERATIONAL_CHANGE_REQUEST', entity.id, null, entity, 'Commercially significant operational change escalated for later approval.', now),
    });
    return entity;
  }

  async requestSpend(bookingId: string, input: unknown, actor: LiveOperationsActor): Promise<EmergencySpendRequest> {
    const booking = await this.requiredBooking(bookingId);
    authorize(actor, 'REQUEST_OPERATIONAL_SPEND', booking);
    requireLiveBooking(booking);
    const payload = record(input, 'INVALID_SPEND_PAYLOAD');
    allowlist(payload, ['amountMinor', 'currency', 'purpose', 'category', 'reason', 'receiptReference'], 'PROTECTED_SPEND_FIELD');
    if (!Number.isSafeInteger(payload.amountMinor) || (payload.amountMinor as number) <= 0) {
      throw new LiveOperationsError(400, 'INVALID_SPEND_AMOUNT', 'amountMinor must be a positive safe integer.');
    }
    const currency = textValue(payload.currency, 'currency', 3)!.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new LiveOperationsError(400, 'INVALID_CURRENCY', 'currency must be a three-letter code.');
    const now = this.now().toISOString();
    const entity: EmergencySpendRequest = {
      id: `emergency-spend-${randomUUID()}`,
      bookingId,
      amountMinor: payload.amountMinor as number,
      currency,
      purpose: textValue(payload.purpose, 'purpose', 240)!,
      category: enumValue(payload.category, EMERGENCY_SPEND_CATEGORIES, 'category'),
      reason: textValue(payload.reason, 'reason', 2000)!,
      requestedByEmployeeId: actor.employeeId,
      requestedAt: now,
      status: 'REQUESTED',
      ...(payload.receiptReference !== undefined ? { receiptReference: textValue(payload.receiptReference, 'receiptReference', 240)! } : {}),
      createdAt: now,
      updatedAt: now,
    };
    await this.storage.createSpendRequest({
      entity,
      expectedBookingUpdatedAt: booking.updatedAt,
      audit: audit(actor, 'EMERGENCY_SPEND_REQUESTED', 'EMERGENCY_SPEND_REQUEST', entity.id, null, entity, entity.reason, now),
    });
    return entity;
  }

  async decideSpend(requestId: string, input: unknown, actor: LiveOperationsActor): Promise<EmergencySpendRequest> {
    const existing = await this.storage.getSpendRequest(requestId);
    if (!existing) throw new LiveOperationsError(404, 'SPEND_REQUEST_NOT_FOUND', 'Emergency spend request not found.');
    const booking = await this.requiredBooking(existing.bookingId);
    authorize(actor, 'APPROVE_OPERATIONAL_SPEND', booking);
    if (existing.requestedByEmployeeId === actor.employeeId) {
      throw new LiveOperationsError(403, 'SELF_APPROVAL_DENIED', 'The requester cannot approve or reject their own spend request.');
    }
    if (existing.status !== 'REQUESTED') throw new LiveOperationsError(409, 'SPEND_ALREADY_DECIDED', 'Emergency spend request has already been decided.');
    const payload = record(input, 'INVALID_SPEND_DECISION');
    allowlist(payload, ['decision', 'rejectionReason', 'expectedUpdatedAt'], 'PROTECTED_SPEND_FIELD');
    if (payload.expectedUpdatedAt !== existing.updatedAt) throw new LiveOperationsError(409, 'SPEND_CONFLICT', 'Spend request changed; reload and retry.');
    const decision = enumValue(payload.decision, ['APPROVED', 'REJECTED'] as const, 'decision');
    const rejectionReason = decision === 'REJECTED'
      ? textValue(payload.rejectionReason, 'rejectionReason', 1000)
      : undefined;
    if (decision === 'APPROVED' && payload.rejectionReason !== undefined) {
      throw new LiveOperationsError(400, 'INVALID_SPEND_DECISION', 'rejectionReason is valid only for rejection.');
    }
    const now = this.now().toISOString();
    const entity: EmergencySpendRequest = decision === 'APPROVED'
      ? { ...existing, status: 'APPROVED', approvedByEmployeeId: actor.employeeId, approvedAt: now, updatedAt: now }
      : { ...existing, status: 'REJECTED', rejectedByEmployeeId: actor.employeeId, rejectedAt: now, rejectionReason, updatedAt: now };
    const action = decision === 'APPROVED' ? 'EMERGENCY_SPEND_APPROVED' : 'EMERGENCY_SPEND_REJECTED';
    await this.storage.decideSpendRequest({
      entity,
      expectedBookingUpdatedAt: booking.updatedAt,
      expectedSpendUpdatedAt: existing.updatedAt,
      audit: audit(actor, action, 'EMERGENCY_SPEND_REQUEST', requestId, existing, entity, rejectionReason || 'Emergency operational spend approved.', now),
    });
    return entity;
  }

  async listSpendRequests(actor: LiveOperationsActor): Promise<EmergencySpendRequest[]> {
    if (!['Founder', 'Admin', 'Accounts', 'Operations'].includes(actor.role)) {
      throw new LiveOperationsError(403, 'ROLE_DENIED', 'Emergency spend access denied.');
    }
    const requests = await this.storage.listSpendRequests({
      status: 'REQUESTED',
      ...(actor.role === 'Operations' ? { requestedByEmployeeId: actor.employeeId } : {}),
    });
    const authorized: EmergencySpendRequest[] = [];
    for (const request of requests) {
      const booking = await this.storage.getBooking(request.bookingId);
      if (!booking) continue;
      const action = actor.role === 'Operations' ? 'REQUEST_OPERATIONAL_SPEND' : 'APPROVE_OPERATIONAL_SPEND';
      const decision = authorizeResource(actor, 'BOOKING', action, bookingResourceContext(booking));
      if (decision.allowed) authorized.push(request);
    }
    return authorized;
  }

  async signalsForBookings(bookingIds: string[]) {
    const uniqueIds = [...new Set(bookingIds)].filter(Boolean);
    const [issues, spendRequests, changeRequests] = await Promise.all([
      this.storage.listIssues(uniqueIds),
      this.storage.listSpendRequestsForBookings(uniqueIds),
      this.storage.listChangeRequests(uniqueIds),
    ]);
    const allowed = new Set(uniqueIds);
    return {
      issues: issues.filter((issue) => issue.status !== 'RESOLVED'),
      spendRequests: spendRequests.filter((request) => allowed.has(request.bookingId)),
      changeRequests: changeRequests.filter((request) => allowed.has(request.bookingId)),
    };
  }

  private async requiredBooking(bookingId: string) {
    const booking = await this.storage.getBooking(bookingId);
    if (!booking) throw new LiveOperationsError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    return booking;
  }
}

export class InMemoryLiveOperationsStorage implements LiveOperationsStorage {
  private readonly bookings = new Map<string, Booking>();
  private readonly serviceLinks = new Set<string>();
  private readonly issues = new Map<string, OperationalIssue>();
  private readonly changes = new Map<string, OperationalChangeRequest>();
  private readonly spends = new Map<string, EmergencySpendRequest>();
  private readonly audits: AuditLog[] = [];
  private mutationCount = 0;

  constructor(initial: {
    bookings?: Booking[];
    serviceLinks?: Array<OperationalServiceLink & { bookingId: string }>;
    issues?: OperationalIssue[];
    changeRequests?: OperationalChangeRequest[];
    spendRequests?: EmergencySpendRequest[];
  } = {}) {
    for (const booking of initial.bookings || []) this.bookings.set(booking.id, clone(booking));
    for (const link of initial.serviceLinks || []) this.serviceLinks.add(`${link.bookingId}:${link.type}:${link.serviceId}`);
    for (const issue of initial.issues || []) this.issues.set(issue.id, clone(issue));
    for (const change of initial.changeRequests || []) this.changes.set(change.id, clone(change));
    for (const spend of initial.spendRequests || []) this.spends.set(spend.id, clone(spend));
  }

  async getBooking(id: string) { const value = this.bookings.get(id); return value ? clone(value) : null; }
  async linkedServiceExists(bookingId: string, link: OperationalServiceLink) { return this.serviceLinks.has(`${bookingId}:${link.type}:${link.serviceId}`); }
  async getIssue(id: string) { const value = this.issues.get(id); return value ? clone(value) : null; }
  async getSpendRequest(id: string) { const value = this.spends.get(id); return value ? clone(value) : null; }
  async listIssues(ids: string[]) { const allowed = new Set(ids); return [...this.issues.values()].filter((item) => allowed.has(item.bookingId)).map(clone); }
  async listChangeRequests(ids: string[]) { const allowed = new Set(ids); return [...this.changes.values()].filter((item) => allowed.has(item.bookingId)).map(clone); }
  async listSpendRequests(filter: { status?: EmergencySpendStatus; requestedByEmployeeId?: string }) {
    return [...this.spends.values()].filter((item) =>
      (!filter.status || item.status === filter.status) &&
      (!filter.requestedByEmployeeId || item.requestedByEmployeeId === filter.requestedByEmployeeId)).map(clone);
  }
  async listSpendRequestsForBookings(ids: string[]) {
    const allowed = new Set(ids);
    return [...this.spends.values()].filter((item) => allowed.has(item.bookingId) && item.status === 'REQUESTED').map(clone);
  }

  async createIssue(commit: EntityCommit<OperationalIssue>) { this.checkBooking(commit.entity.bookingId, commit.expectedBookingUpdatedAt); this.issues.set(commit.entity.id, clone(commit.entity)); this.recordAudit(commit.audit); }
  async createChangeRequest(commit: EntityCommit<OperationalChangeRequest>) { this.checkBooking(commit.entity.bookingId, commit.expectedBookingUpdatedAt); this.changes.set(commit.entity.id, clone(commit.entity)); this.recordAudit(commit.audit); }
  async createSpendRequest(commit: EntityCommit<EmergencySpendRequest>) { this.checkBooking(commit.entity.bookingId, commit.expectedBookingUpdatedAt); this.spends.set(commit.entity.id, clone(commit.entity)); this.recordAudit(commit.audit); }
  async updateIssue(commit: IssueUpdateCommit) {
    this.checkBooking(commit.entity.bookingId, commit.expectedBookingUpdatedAt);
    if (this.issues.get(commit.entity.id)?.updatedAt !== commit.expectedIssueUpdatedAt) throw new LiveOperationsError(409, 'ISSUE_CONFLICT', 'Issue changed; reload and retry.');
    this.issues.set(commit.entity.id, clone(commit.entity)); this.recordAudit(commit.audit);
  }
  async decideSpendRequest(commit: SpendDecisionCommit) {
    this.checkBooking(commit.entity.bookingId, commit.expectedBookingUpdatedAt);
    if (this.spends.get(commit.entity.id)?.updatedAt !== commit.expectedSpendUpdatedAt) throw new LiveOperationsError(409, 'SPEND_CONFLICT', 'Spend request changed; reload and retry.');
    this.spends.set(commit.entity.id, clone(commit.entity)); this.recordAudit(commit.audit);
  }
  private checkBooking(id: string, updatedAt: string) { if (this.bookings.get(id)?.updatedAt !== updatedAt) throw new LiveOperationsError(409, 'BOOKING_OPERATION_CONFLICT', 'Booking changed; reload and retry.'); }
  private recordAudit(value: AuditLog) { this.audits.push(clone(value)); this.mutationCount += 2; }
  getMutationCount() { return this.mutationCount; }
  getAudits() { return clone(this.audits); }
  getIssueSync(id: string) { return this.issues.get(id); }
  getSpendSync(id: string) { return this.spends.get(id); }
  getChanges() { return [...this.changes.values()].map(clone); }
}

export class FirestoreLiveOperationsStorage implements LiveOperationsStorage {
  private db() { return getAdminDb(); }
  async getBooking(id: string) { const document = await this.db().collection('bookings').doc(id).get(); return document.exists ? { ...document.data(), id: document.id } as Booking : null; }
  async getIssue(id: string) { const document = await this.db().collection('booking_operational_issues').doc(id).get(); return document.exists ? { ...document.data(), id: document.id } as OperationalIssue : null; }
  async getSpendRequest(id: string) { const document = await this.db().collection('emergency_spend_requests').doc(id).get(); return document.exists ? { ...document.data(), id: document.id } as EmergencySpendRequest : null; }
  async linkedServiceExists(bookingId: string, link: OperationalServiceLink) {
    const collection = link.type === 'ACCOMMODATION' ? 'booking_accommodations' : link.type === 'TRANSPORT' ? 'booking_transports' : 'booking_activities';
    const document = await this.db().collection(collection).doc(link.serviceId).get();
    return document.exists && document.data()?.bookingId === bookingId;
  }
  async listIssues(ids: string[]) { return this.byBookingIds<OperationalIssue>('booking_operational_issues', ids); }
  async listChangeRequests(ids: string[]) { return this.byBookingIds<OperationalChangeRequest>('operational_change_requests', ids); }
  async listSpendRequests(filter: { status?: EmergencySpendStatus; requestedByEmployeeId?: string }) {
    let query: FirebaseFirestore.Query = this.db().collection('emergency_spend_requests');
    if (filter.requestedByEmployeeId) query = query.where('requestedByEmployeeId', '==', filter.requestedByEmployeeId);
    if (filter.status) query = query.where('status', '==', filter.status);
    const snapshot = await query.orderBy('requestedAt', 'desc').limit(100).get();
    return snapshot.docs.map((document) => ({ ...document.data(), id: document.id } as EmergencySpendRequest));
  }
  async listSpendRequestsForBookings(ids: string[]) {
    const requests = await this.byBookingIds<EmergencySpendRequest>('emergency_spend_requests', ids);
    return requests.filter((request) => request.status === 'REQUESTED');
  }
  async createIssue(commit: EntityCommit<OperationalIssue>) { return this.createWithAudit('booking_operational_issues', commit); }
  async createChangeRequest(commit: EntityCommit<OperationalChangeRequest>) { return this.createWithAudit('operational_change_requests', commit); }
  async createSpendRequest(commit: EntityCommit<EmergencySpendRequest>) { return this.createWithAudit('emergency_spend_requests', commit); }
  async updateIssue(commit: IssueUpdateCommit) { return this.updateWithAudit('booking_operational_issues', commit, commit.expectedIssueUpdatedAt, 'ISSUE_CONFLICT'); }
  async decideSpendRequest(commit: SpendDecisionCommit) { return this.updateWithAudit('emergency_spend_requests', commit, commit.expectedSpendUpdatedAt, 'SPEND_CONFLICT'); }

  private async byBookingIds<T>(collection: string, ids: string[]): Promise<T[]> {
    const chunks: string[][] = [];
    for (let index = 0; index < ids.length; index += 30) chunks.push(ids.slice(index, index + 30));
    const snapshots = await Promise.all(chunks.map((chunk) => this.db().collection(collection).where('bookingId', 'in', chunk).get()));
    return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({ ...document.data(), id: document.id } as T)));
  }
  private async createWithAudit<T extends { id: string; bookingId: string }>(collection: string, commit: EntityCommit<T>) {
    const db = this.db();
    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(commit.entity.bookingId);
      const booking = await transaction.get(bookingRef);
      if (!booking.exists || booking.data()?.updatedAt !== commit.expectedBookingUpdatedAt) throw new LiveOperationsError(409, 'BOOKING_OPERATION_CONFLICT', 'Booking changed; reload and retry.');
      transaction.create(db.collection(collection).doc(commit.entity.id), commit.entity);
      transaction.create(db.collection('audit_logs').doc(commit.audit.id), commit.audit);
    });
  }
  private async updateWithAudit<T extends { id: string; bookingId: string; updatedAt: string }>(collection: string, commit: EntityCommit<T>, expectedUpdatedAt: string, code: string) {
    const db = this.db();
    await db.runTransaction(async (transaction) => {
      const bookingRef = db.collection('bookings').doc(commit.entity.bookingId);
      const entityRef = db.collection(collection).doc(commit.entity.id);
      const [booking, entity] = await Promise.all([transaction.get(bookingRef), transaction.get(entityRef)]);
      if (!booking.exists || booking.data()?.updatedAt !== commit.expectedBookingUpdatedAt) throw new LiveOperationsError(409, 'BOOKING_OPERATION_CONFLICT', 'Booking changed; reload and retry.');
      if (!entity.exists || entity.data()?.updatedAt !== expectedUpdatedAt) throw new LiveOperationsError(409, code, 'Operational record changed; reload and retry.');
      transaction.set(entityRef, commit.entity);
      transaction.create(db.collection('audit_logs').doc(commit.audit.id), commit.audit);
    });
  }
}

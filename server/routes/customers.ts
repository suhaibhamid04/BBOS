import { randomUUID } from 'node:crypto';
import { FieldPath, type Query } from 'firebase-admin/firestore';
import { Router, type Request, type Response } from 'express';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_CUSTOMERS, DEMO_LEADS } from '../../src/services/demoData.js';
import type { Customer, Lead, UserRole } from '../../src/types/index.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { requireRole } from '../middleware/auth.js';

type UnknownRecord = Record<string, unknown>;
type DirectoryActor = {
  employeeId: string;
  role: UserRole | string;
  active: boolean;
  salesTeamId?: string;
  name?: string;
};

export type CustomerDirectoryDto = Pick<Customer,
  'id' | 'name' | 'phone' | 'whatsApp' | 'email' | 'city' | 'customerType' |
  'preferences' | 'notes' | 'totalBookings' | 'lifetimeValue' | 'companyId' |
  'createdAt' | 'updatedAt' | 'isDemo'
>;

const CUSTOMER_ROLES: UserRole[] = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'];
const CUSTOMER_WRITE_FIELDS = [
  'name', 'phone', 'whatsApp', 'email', 'city', 'customerType', 'preferences', 'notes', 'companyId',
] as const;
const DEMO_CUSTOMER_MAP = new Map(DEMO_CUSTOMERS.map(customer => [customer.id, structuredClone(customer)]));

class CustomerDirectoryError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'CustomerDirectoryError';
  }
}

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_PAYLOAD', 'A JSON object is required.');
  }
  return value as UnknownRecord;
}

function cleanText(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_INPUT', `${field} is required.`);
    return '';
  }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_INPUT', `${field} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function parseLimit(value: unknown): number {
  if (value === undefined) return 50;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_LIMIT', 'limit must be an integer from 1 to 100.');
  }
  return parsed;
}

function encodeCursor(value: { customer: string }): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value: unknown): { customer?: string } {
  if (value === undefined) return {};
  if (typeof value !== 'string' || !value) throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_CURSOR', 'Malformed cursor.');
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as UnknownRecord;
    if (parsed.customer !== undefined && typeof parsed.customer !== 'string') {
      throw new Error('invalid');
    }
    const customer = typeof parsed.customer === 'string' && parsed.customer ? parsed.customer : undefined;
    return { ...(customer ? { customer } : {}) };
  } catch {
    throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_CURSOR', 'Malformed cursor.');
  }
}

function customerScope(actor: DirectoryActor): 'ALL' | 'OWN' | 'TEAM' {
  if (!actor.active || !actor.employeeId?.trim()) {
    throw new CustomerDirectoryError(403, 'INVALID_CUSTOMER_PRINCIPAL', 'An active canonical employee identity is required.');
  }
  if (actor.role === 'Founder' || actor.role === 'Admin') return 'ALL';
  if (actor.role === 'Sales Executive') return 'OWN';
  if (actor.role === 'Sales Manager') {
    if (!actor.salesTeamId?.trim()) throw new CustomerDirectoryError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    return 'TEAM';
  }
  throw new CustomerDirectoryError(403, 'CUSTOMER_ROLE_DENIED', 'This role cannot access the customer directory.');
}

export function canAccessCustomerRecord(actor: DirectoryActor, customer: UnknownRecord, linkedLeads: Array<Partial<Lead>> = []): boolean {
  const scope = customerScope(actor);
  if (scope === 'ALL') return true;
  if (scope === 'OWN') {
    if (customer.ownerEmployeeId === actor.employeeId) return true;
    return linkedLeads.some(lead => lead.assignedEmployeeId === actor.employeeId);
  }
  if (customer.salesTeamId === actor.salesTeamId) return true;
  return linkedLeads.some(lead => Boolean(actor.salesTeamId) && lead.salesTeamId === actor.salesTeamId);
}

export function projectCustomerDirectoryDto(value: UnknownRecord): CustomerDirectoryDto {
  return {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Unnamed Customer',
    phone: typeof value.phone === 'string' ? value.phone : '',
    ...(typeof value.whatsApp === 'string' && value.whatsApp ? { whatsApp: value.whatsApp } : {}),
    email: typeof value.email === 'string' ? value.email : '',
    city: typeof value.city === 'string' ? value.city : '',
    customerType: value.customerType === 'B2B' ? 'B2B' : 'B2C',
    preferences: Array.isArray(value.preferences) ? value.preferences.filter(item => typeof item === 'string').slice(0, 50) as string[] : [],
    notes: typeof value.notes === 'string' ? value.notes : '',
    totalBookings: typeof value.totalBookings === 'number' && Number.isFinite(value.totalBookings) ? value.totalBookings : 0,
    lifetimeValue: typeof value.lifetimeValue === 'number' && Number.isFinite(value.lifetimeValue) ? value.lifetimeValue : 0,
    ...(typeof value.companyId === 'string' && value.companyId ? { companyId: value.companyId } : {}),
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    ...(value.isDemo === true ? { isDemo: true } : {}),
  };
}

function synthesizeCustomer(lead: Lead): UnknownRecord {
  return {
    id: lead.customerId,
    name: lead.customerName,
    phone: lead.customerPhone || '',
    whatsApp: lead.whatsAppNumber,
    email: lead.customerEmail || '',
    city: lead.customerCity || '',
    customerType: lead.companyId ? 'B2B' : 'B2C',
    preferences: Array.isArray(lead.tags) ? lead.tags : [],
    notes: lead.notes || '',
    totalBookings: 0,
    lifetimeValue: 0,
    companyId: lead.companyId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    isDemo: lead.isDemo,
  };
}

function scopedDemoLeads(actor: DirectoryActor): Lead[] {
  const scope = customerScope(actor);
  return DEMO_LEADS.filter(lead => scope === 'ALL' ||
    (scope === 'OWN' && lead.assignedEmployeeId === actor.employeeId) ||
    (scope === 'TEAM' && Boolean(actor.salesTeamId) && lead.salesTeamId === actor.salesTeamId));
}

function isDemoRequest(req: Request): boolean {
  return APP_CONFIG.DEMO_MODE && req.user?.isDemo === true && process.env.NODE_ENV !== 'production';
}

async function linkedLeadsForCustomer(actor: DirectoryActor, customerId: string): Promise<Array<Partial<Lead>>> {
  customerScope(actor);
  const snapshot = await getAdminDb().collection('leads').where('customerId', '==', customerId).limit(100).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }) as Partial<Lead>);
}

export function parseCustomerInput(value: unknown, partial = false): UnknownRecord {
  const body = asRecord(value);
  const unsupported = Object.keys(body).filter(key => !(CUSTOMER_WRITE_FIELDS as readonly string[]).includes(key));
  if (unsupported.length) {
    throw new CustomerDirectoryError(400, 'PROTECTED_CUSTOMER_FIELD', `Unsupported or server-controlled fields: ${unsupported.join(', ')}.`);
  }
  const result: UnknownRecord = {};
  if (!partial || body.name !== undefined) result.name = cleanText(body.name, 'name', 160, !partial);
  if (!partial || body.phone !== undefined) {
    const phone = cleanText(body.phone, 'phone', 40, !partial);
    if (phone && normalizePhone(phone).length < 7) throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_PHONE', 'phone must contain at least seven digits.');
    result.phone = phone;
    result.normalizedPhone = normalizePhone(phone);
  }
  if (body.whatsApp !== undefined) result.whatsApp = cleanText(body.whatsApp, 'whatsApp', 40);
  if (!partial || body.email !== undefined) {
    const email = cleanText(body.email, 'email', 254);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_EMAIL', 'email is invalid.');
    result.email = email;
    result.normalizedEmail = normalizeEmail(email);
  }
  if (!partial || body.city !== undefined) result.city = cleanText(body.city, 'city', 120);
  if (!partial || body.customerType !== undefined) {
    if (body.customerType !== 'B2C' && body.customerType !== 'B2B') throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_TYPE', 'customerType must be B2C or B2B.');
    result.customerType = body.customerType;
  }
  if (!partial || body.preferences !== undefined) {
    if (body.preferences !== undefined && (!Array.isArray(body.preferences) || body.preferences.some(item => typeof item !== 'string' || !item.trim()))) {
      throw new CustomerDirectoryError(400, 'INVALID_CUSTOMER_PREFERENCES', 'preferences must contain non-empty strings.');
    }
    result.preferences = (body.preferences as string[] | undefined)?.map(item => item.trim()).slice(0, 50) || [];
  }
  if (!partial || body.notes !== undefined) result.notes = cleanText(body.notes, 'notes', 4000);
  if (body.companyId !== undefined) result.companyId = cleanText(body.companyId, 'companyId', 128);
  if (partial && !Object.keys(result).length) throw new CustomerDirectoryError(400, 'EMPTY_CUSTOMER_UPDATE', 'No supported customer fields were supplied.');
  return result;
}

function sendError(error: unknown, res: Response, context: string) {
  if (error instanceof CustomerDirectoryError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  console.error(`[CUSTOMERS] ${context}:`, error);
  return res.status(500).json({ error: 'Customer request failed.', code: 'CUSTOMER_REQUEST_FAILED' });
}

export const customersRouter = Router();

customersRouter.get('/', requireRole(CUSTOMER_ROLES), async (req, res) => {
  try {
    const actor = req.user!;
    const limit = parseLimit(req.query.limit);
    const cursor = decodeCursor(req.query.cursor);
    if (isDemoRequest(req)) {
      const leads = scopedDemoLeads(actor);
      const values = new Map<string, CustomerDirectoryDto>();
      for (const lead of leads) {
        const value = DEMO_CUSTOMER_MAP.get(lead.customerId) || synthesizeCustomer(lead);
        values.set(lead.customerId, projectCustomerDirectoryDto(value as unknown as UnknownRecord));
      }
      for (const customer of DEMO_CUSTOMER_MAP.values()) {
        const linked = leads.filter(lead => lead.customerId === customer.id);
        if (canAccessCustomerRecord(actor, customer as unknown as UnknownRecord, linked)) {
          values.set(customer.id, projectCustomerDirectoryDto(customer as unknown as UnknownRecord));
        }
      }
      const sorted = [...values.values()].sort((left, right) => left.id.localeCompare(right.id));
      const start = cursor.customer ? Math.max(0, sorted.findIndex(customer => customer.id === cursor.customer) + 1) : 0;
      const page = sorted.slice(start, start + limit);
      const hasMore = start + page.length < sorted.length;
      return res.json({
        success: true, data: page, hasMore,
        nextCursor: hasMore && page.at(-1) ? encodeCursor({ customer: page.at(-1)!.id }) : null,
        mode: 'DEMO',
      });
    }

    customerScope(actor);
    let query: Query = getAdminDb().collection('customers').orderBy(FieldPath.documentId());
    if (cursor.customer) query = query.startAfter(cursor.customer);
    const snapshot = await query.limit(limit + 1).get();
    const candidates = snapshot.docs.slice(0, limit);
    const linkedLeadGroups = await Promise.all(candidates.map(document => linkedLeadsForCustomer(actor, document.id)));
    const values: CustomerDirectoryDto[] = [];
    for (const [index, document] of candidates.entries()) {
      const customer = { id: document.id, ...document.data() };
      if (canAccessCustomerRecord(actor, customer, linkedLeadGroups[index])) {
        values.push(projectCustomerDirectoryDto(customer));
      }
    }
    const hasMore = snapshot.docs.length > limit;
    const nextCursor = hasMore && candidates.at(-1) ? encodeCursor({ customer: candidates.at(-1)!.id }) : null;
    return res.json({ success: true, data: values, hasMore, nextCursor });
  } catch (error) { return sendError(error, res, 'list'); }
});

customersRouter.get('/:id', requireRole(CUSTOMER_ROLES), async (req, res) => {
  try {
    const actor = req.user!;
    if (isDemoRequest(req)) {
      const customer = DEMO_CUSTOMER_MAP.get(req.params.id);
      const leads = scopedDemoLeads(actor).filter(lead => lead.customerId === req.params.id);
      if (!customer || !canAccessCustomerRecord(actor, customer as unknown as UnknownRecord, leads)) {
        throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
      }
      return res.json({ success: true, data: projectCustomerDirectoryDto(customer as unknown as UnknownRecord), mode: 'DEMO' });
    }
    const snapshot = await getAdminDb().collection('customers').doc(req.params.id).get();
    if (!snapshot.exists) throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    const customer = { id: snapshot.id, ...snapshot.data() };
    const leads = await linkedLeadsForCustomer(actor, snapshot.id);
    if (!canAccessCustomerRecord(actor, customer, leads)) throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    return res.json({ success: true, data: projectCustomerDirectoryDto(customer) });
  } catch (error) { return sendError(error, res, 'detail'); }
});

customersRouter.post('/', requireRole(CUSTOMER_ROLES), async (req, res) => {
  try {
    const actor = req.user!;
    const scope = customerScope(actor);
    const input = parseCustomerInput(req.body);
    const now = new Date().toISOString();
    const id = `customer-${randomUUID()}`;
    const customer = {
      id, ...input, totalBookings: 0, lifetimeValue: 0,
      ownerEmployeeId: actor.employeeId,
      ...(actor.salesTeamId ? { salesTeamId: actor.salesTeamId } : {}),
      createdByEmployeeId: actor.employeeId, updatedByEmployeeId: actor.employeeId,
      createdAt: now, updatedAt: now,
      ...(isDemoRequest(req) ? { isDemo: true } : {}),
    };
    if (scope === 'TEAM' && !actor.salesTeamId) throw new CustomerDirectoryError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    if (isDemoRequest(req)) DEMO_CUSTOMER_MAP.set(id, customer as unknown as Customer);
    else {
      const db = getAdminDb();
      await db.runTransaction(async transaction => {
        transaction.create(db.collection('customers').doc(id), customer);
        const auditId = `audit-customer-${randomUUID()}`;
        transaction.create(db.collection('audit_logs').doc(auditId), {
          id: auditId, timestamp: now, actorType: 'HUMAN', actorId: actor.employeeId,
          actorName: `${actor.name} (${actor.role})`, action: 'CUSTOMER_CREATED', entityType: 'CUSTOMER', entityId: id,
          before: null, after: projectCustomerDirectoryDto(customer), reason: `Customer created by ${actor.employeeId}.`,
        });
      });
    }
    return res.status(201).json({ success: true, data: projectCustomerDirectoryDto(customer) });
  } catch (error) { return sendError(error, res, 'create'); }
});

customersRouter.patch('/:id', requireRole(CUSTOMER_ROLES), async (req, res) => {
  try {
    const actor = req.user!;
    const input = parseCustomerInput(req.body, true);
    const now = new Date().toISOString();
    if (isDemoRequest(req)) {
      const existing = DEMO_CUSTOMER_MAP.get(req.params.id);
      const leads = scopedDemoLeads(actor).filter(lead => lead.customerId === req.params.id);
      if (!existing || !canAccessCustomerRecord(actor, existing as unknown as UnknownRecord, leads)) throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
      const updated = { ...existing, ...input, id: existing.id, createdAt: existing.createdAt, updatedAt: now, isDemo: true } as Customer;
      DEMO_CUSTOMER_MAP.set(existing.id, updated);
      return res.json({ success: true, data: projectCustomerDirectoryDto(updated as unknown as UnknownRecord), mode: 'DEMO' });
    }
    const db = getAdminDb();
    const reference = db.collection('customers').doc(req.params.id);
    const existingSnapshot = await reference.get();
    if (!existingSnapshot.exists) throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    const authorizedCustomer: UnknownRecord = { id: existingSnapshot.id, ...existingSnapshot.data() };
    const authorizedLeads = await linkedLeadsForCustomer(actor, existingSnapshot.id);
    if (!canAccessCustomerRecord(actor, authorizedCustomer, authorizedLeads)) {
      throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    }
    let result: UnknownRecord = {};
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new CustomerDirectoryError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
      const existing: UnknownRecord = { id: snapshot.id, ...snapshot.data() };
      // Re-check immutable scope metadata in the transaction. Lead-linked legacy
      // authorization was established immediately before the transaction.
      if (existing.ownerEmployeeId !== authorizedCustomer.ownerEmployeeId || existing.salesTeamId !== authorizedCustomer.salesTeamId) {
        throw new CustomerDirectoryError(409, 'CUSTOMER_SCOPE_CHANGED', 'Customer scope changed. Reload before saving.');
      }
      result = { ...existing, ...input, id: existing.id, ownerEmployeeId: existing.ownerEmployeeId,
        salesTeamId: existing.salesTeamId, createdAt: existing.createdAt, updatedAt: now, updatedByEmployeeId: actor.employeeId };
      transaction.set(reference, result);
      const auditId = `audit-customer-${randomUUID()}`;
      transaction.create(db.collection('audit_logs').doc(auditId), {
        id: auditId, timestamp: now, actorType: 'HUMAN', actorId: actor.employeeId, actorName: `${actor.name} (${actor.role})`,
        action: 'CUSTOMER_UPDATED', entityType: 'CUSTOMER', entityId: snapshot.id,
        before: projectCustomerDirectoryDto(existing), after: projectCustomerDirectoryDto(result), reason: `Customer updated by ${actor.employeeId}.`,
      });
    });
    return res.json({ success: true, data: projectCustomerDirectoryDto(result) });
  } catch (error) { return sendError(error, res, 'update'); }
});

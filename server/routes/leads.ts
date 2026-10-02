import { Router, type Request, type Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import {
  LEAD_DROP_REASONS,
  LEAD_PRIORITIES,
  LEAD_STAGES,
  leadSourceById,
  normalizeLeadEmail,
  normalizeLeadPhone,
  type Lead,
  type LeadDropReason,
  type LeadPriority,
  type LeadStatus,
  type UserRole,
} from '../../src/types/index.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_CUSTOMERS, DEMO_LEADS } from '../../src/services/demoData.js';
import { PRESET_USERS } from '../../src/services/permissions.js';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';
import {
  LeadDistributionError,
  LeadDistributionService,
} from '../services/leadDistributionService.js';

export const leadsRouter = Router();

const crmRoles: UserRole[] = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'];
const destinationValues = new Set(['Kashmir', 'Jammu', 'Ladakh', 'Himachal', 'Kerala', 'Goa', 'Golden Triangle', 'General', 'Other Domestic']);
const legacyStages: Record<string, LeadStatus> = {
  QUALIFIED: 'IN_PROGRESS', QUOTE_SENT: 'QUOTE_SHARED', BOOKED: 'CONVERTED', LOST: 'DROPPED', NURTURE: 'ON_HOLD',
};
const legacyPriorities: Record<string, LeadPriority> = { URGENT: 'HOT', HIGH: 'HOT', MEDIUM: 'WARM', LOW: 'COLD' };

type UnknownRecord = Record<string, any>;

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function suppliedOrExisting(body: UnknownRecord, field: string, existingValue: unknown): unknown {
  return Object.prototype.hasOwnProperty.call(body, field) ? body[field] : existingValue;
}

const clearableLeadFields = new Set([
  'salutation', 'alternatePhone', 'whatsAppNumber', 'customerEmail', 'customerCity',
  'travelStartDate', 'travelEndDate', 'nights', 'adults', 'travelerCount', 'focCount',
  'budget', 'tripType', 'hotelPreference', 'mealPlanPreference', 'vehiclePreference',
  'transportPreference', 'specialRequirements', 'sourceReference', 'campaignId', 'formId',
  'adId', 'contentId', 'dropReason', 'dropNote',
]);
const commercialImpactFields = [
  'destination', 'travelStartDate', 'travelEndDate', 'nights', 'adults', 'children',
  'childAges', 'focCount', 'hotelPreference', 'mealPlanPreference', 'vehiclePreference',
] as const;
const reviewableTripStatuses = new Set(['DRAFT', 'ITINERARY_READY', 'QUOTE_READY', 'QUOTE_SENT', 'ACCEPTED']);

function comparable(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function commercialChanges(before: Lead, after: Lead) {
  return commercialImpactFields
    .filter(field => comparable(before[field]) !== comparable(after[field]))
    .map(field => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

function legacySourceId(value: UnknownRecord): Lead['sourceId'] {
  const label = String(value.sourceId || value.sourcePlatform || value.source || '').toLowerCase();
  if (label.includes('meta') || label.includes('facebook')) return 'META_FACEBOOK_ADS';
  if (label.includes('instagram')) return 'INSTAGRAM';
  if (label.includes('google')) return 'GOOGLE_ADS';
  if (label.includes('website')) return 'WEBSITE';
  if (label.includes('referral')) return 'REFERRAL';
  if (label.includes('repeat')) return 'REPEAT_CUSTOMER';
  if (label.includes('whatsapp')) return 'WHATSAPP';
  if (label.includes('b2b')) return 'B2B';
  if (label.includes('walk') || label.includes('offline')) return 'OFFLINE_WALK_IN';
  return 'DIRECT_CALL';
}

function normalizeStoredLead(value: UnknownRecord): Lead {
  const sourceId = leadSourceById(value.sourceId)?.id || legacySourceId(value);
  const source = leadSourceById(sourceId)!;
  return {
    ...value,
    sourceId,
    source: cleanString(value.source) || source.label,
    sourcePlatform: cleanString(value.sourcePlatform) || source.label,
    createdSourceType: value.createdSourceType || 'MANUAL',
    status: legacyStages[value.status] || value.status || 'NEW',
    priority: legacyPriorities[value.priority] || value.priority || 'NORMAL',
    childAges: Array.isArray(value.childAges) ? value.childAges : [],
    tags: Array.isArray(value.tags) ? value.tags : [],
  } as Lead;
}

const demoLeads = new Map<string, Lead>(DEMO_LEADS.map(lead => [lead.id, normalizeStoredLead({ ...structuredClone(lead), isDemo: true })]));
const demoCustomers = new Map(DEMO_CUSTOMERS.map(customer => [customer.id, structuredClone(customer)]));
const demoAuditLogs = new Map<string, UnknownRecord>();
const demoDistributionStorage = new InMemoryConversionStorageProvider({ leads: [...demoLeads.values()] });
for (const customer of demoCustomers.values()) demoDistributionStorage.rawSet('customers', customer.id, customer);
for (const employee of PRESET_USERS) demoDistributionStorage.rawSet('employees', employee.employeeId, employee);
demoDistributionStorage.rawSet('sales_teams', 'sales-team-01', { id: 'sales-team-01', name: 'Kashmir Sales Team', active: true });
const demoLeadDistribution = new LeadDistributionService(demoDistributionStorage);
const productionLeadDistribution = new LeadDistributionService();

class LeadRequestError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) { super(message); }
}

function requiredString(value: unknown, field: string): string {
  const normalized = cleanString(value);
  if (!normalized) throw new LeadRequestError(400, 'INVALID_LEAD_INPUT', `${field} is required.`);
  return normalized;
}

function optionalNumber(value: unknown, field: string, integer = false): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new LeadRequestError(400, 'INVALID_LEAD_INPUT', `${field} must be a non-negative${integer ? ' whole' : ''} number.`);
  }
  return parsed;
}

function dateOnly(value: unknown, field: string): string | undefined {
  const normalized = cleanString(value);
  if (!normalized) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
    throw new LeadRequestError(400, 'INVALID_LEAD_INPUT', `${field} must be a valid calendar date.`);
  }
  return normalized;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000);
}

function normalizedStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new LeadRequestError(400, 'INVALID_LEAD_INPUT', `${field} must be an array.`);
  return [...new Set(value.map(cleanString).filter((item): item is string => Boolean(item)))].slice(0, 25);
}

function parseChildAges(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new LeadRequestError(400, 'INVALID_CHILD_AGES', 'childAges must be an array.');
  return value.map((age, index) => {
    const parsed = Number(age);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 17) {
      throw new LeadRequestError(400, 'INVALID_CHILD_AGES', `Child ${index + 1} age must be between 0 and 17.`);
    }
    return parsed;
  });
}

function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof LeadRequestError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  if (error instanceof LeadDistributionError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  console.error(`[LEADS] ${fallback}:`, error);
  return res.status(500).json({ error: fallback, code: 'LEAD_OPERATION_FAILED' });
}

function distributionService(req: Request) {
  return isDemoRequest(req) ? demoLeadDistribution : productionLeadDistribution;
}

function distributionActor(req: Request) {
  const actor = req.user!;
  return {
    employeeId: actor.employeeId,
    role: actor.role,
    name: cleanString(actor.name) || actor.employeeId,
    active: true,
    ...(actor.salesTeamId ? { salesTeamId: actor.salesTeamId } : {}),
  };
}

function isDemoRequest(req: Request) {
  return APP_CONFIG.DEMO_MODE && req.user?.isDemo === true && process.env.NODE_ENV !== 'production';
}

function canReadLead(req: Request, lead: Lead): boolean {
  const actor = req.user!;
  if (actor.role === 'Founder' || actor.role === 'Admin') return true;
  if (actor.role === 'Sales Executive') return lead.assignedEmployeeId === actor.employeeId;
  return actor.role === 'Sales Manager' && !!actor.salesTeamId && lead.salesTeamId === actor.salesTeamId;
}

function audit(action: string, actor: Request['user'], leadId: string, before: unknown, after: unknown, summary: string) {
  const id = `audit-${randomUUID()}`;
  const actorName = cleanString(actor!.name) || actor!.employeeId;
  return {
    id, action, entityType: 'LEAD', entityId: leadId,
    actorId: actor!.employeeId, actorName: `${actorName} (${actor!.role})`,
    actor: { id: actor!.employeeId, name: actorName, role: actor!.role },
    before: before || null, after: after || null, summary, reason: summary, timestamp: new Date().toISOString(),
  };
}

function creationId(actorEmployeeId: string, requestId: string | undefined) {
  return requestId
    ? `lead-${createHash('sha256').update(`${actorEmployeeId}:${requestId}`).digest('hex').slice(0, 28)}`
    : `lead-${randomUUID()}`;
}

function buildEnquiryFields(body: UnknownRecord, existing?: Lead): UnknownRecord {
  const customerName = requiredString(body.customerName ?? existing?.customerName, 'customerName');
  const customerPhone = cleanString(suppliedOrExisting(body, 'customerPhone', existing?.customerPhone)) || '';
  const customerEmail = cleanString(suppliedOrExisting(body, 'customerEmail', existing?.customerEmail));
  if (!normalizeLeadPhone(customerPhone) && !normalizeLeadEmail(customerEmail)) throw new LeadRequestError(400, 'CONTACT_METHOD_REQUIRED', 'A phone number or email address is required.');
  if (customerPhone && normalizeLeadPhone(customerPhone).length < 7) throw new LeadRequestError(400, 'INVALID_PHONE', 'The phone number is too short.');
  if (customerEmail && !/^\S+@\S+\.\S+$/.test(customerEmail)) throw new LeadRequestError(400, 'INVALID_EMAIL', 'customerEmail is invalid.');
  const destination = requiredString(body.destination ?? existing?.destination, 'destination');
  if (!destinationValues.has(destination)) throw new LeadRequestError(400, 'INVALID_DESTINATION', 'destination is not supported.');

  const ages = body.childAges === undefined && existing ? existing.childAges : parseChildAges(body.childAges);
  const children = body.children === undefined && existing ? existing.children : optionalNumber(body.children, 'children', true);
  if (children !== undefined && children !== ages.length) throw new LeadRequestError(400, 'CHILD_AGES_REQUIRED', 'Provide one child age for every child.');
  const adults = body.adults === undefined && existing ? existing.adults : optionalNumber(body.adults, 'adults', true);
  if (adults !== undefined && adults < 1) throw new LeadRequestError(400, 'INVALID_ADULTS', 'At least one adult is required when pax is supplied.');
  const derivedTravelerCount = adults === undefined ? undefined : adults + ages.length;
  const suppliedTravelerCount = body.travelerCount === undefined && existing ? existing.travelerCount : optionalNumber(body.travelerCount, 'travelerCount', true);
  if (derivedTravelerCount !== undefined && suppliedTravelerCount !== undefined && suppliedTravelerCount !== derivedTravelerCount) {
    throw new LeadRequestError(400, 'INVALID_TRAVELER_COUNT', 'travelerCount must equal adults plus children.');
  }

  const startWasSupplied = Object.prototype.hasOwnProperty.call(body, 'travelStartDate');
  const nightsWereSupplied = Object.prototype.hasOwnProperty.call(body, 'nights');
  const endWasSupplied = Object.prototype.hasOwnProperty.call(body, 'travelEndDate');
  const start = dateOnly(startWasSupplied ? body.travelStartDate : existing?.travelStartDate, 'travelStartDate');
  let end = dateOnly(
    endWasSupplied ? body.travelEndDate : (startWasSupplied || nightsWereSupplied) ? undefined : existing?.travelEndDate,
    'travelEndDate',
  );
  let nights = body.nights === undefined && existing ? existing.nights : optionalNumber(body.nights, 'nights', true);
  if (nights !== undefined && nights < 1) throw new LeadRequestError(400, 'INVALID_NIGHTS', 'nights must be at least 1.');
  if (end && !start) throw new LeadRequestError(400, 'INVALID_TRAVEL_DATES', 'travelStartDate is required when travelEndDate is supplied.');
  if (start && nights !== undefined) {
    const derivedEnd = addDays(start, nights);
    if (end && end !== derivedEnd) throw new LeadRequestError(400, 'INVALID_TRAVEL_DATES', 'travelEndDate does not match travelStartDate and nights.');
    end = derivedEnd;
  } else if (start && end) {
    nights = daysBetween(start, end);
    if (nights < 1) throw new LeadRequestError(400, 'INVALID_TRAVEL_DATES', 'Travel must be at least one night.');
  }

  const focCount = optionalNumber(body.focCount === undefined && existing ? existing.focCount : body.focCount, 'focCount', true);
  const budget = optionalNumber(body.budget === undefined && existing ? existing.budget : body.budget, 'budget');
  const vehiclePreference = cleanString(
    Object.prototype.hasOwnProperty.call(body, 'vehiclePreference')
      ? body.vehiclePreference
      : Object.prototype.hasOwnProperty.call(body, 'transportPreference')
        ? body.transportPreference
        : existing?.vehiclePreference ?? existing?.transportPreference,
  );
  return {
    customerName, customerPhone, ...(customerEmail ? { customerEmail } : {}), destination,
    ...(cleanString(suppliedOrExisting(body, 'salutation', existing?.salutation)) ? { salutation: cleanString(suppliedOrExisting(body, 'salutation', existing?.salutation)) } : {}),
    ...(cleanString(suppliedOrExisting(body, 'alternatePhone', existing?.alternatePhone)) ? { alternatePhone: cleanString(suppliedOrExisting(body, 'alternatePhone', existing?.alternatePhone)) } : {}),
    ...(cleanString(suppliedOrExisting(body, 'whatsAppNumber', existing?.whatsAppNumber)) ? { whatsAppNumber: cleanString(suppliedOrExisting(body, 'whatsAppNumber', existing?.whatsAppNumber)) } : {}),
    ...(cleanString(suppliedOrExisting(body, 'customerCity', existing?.customerCity)) ? { customerCity: cleanString(suppliedOrExisting(body, 'customerCity', existing?.customerCity)) } : {}),
    ...(start ? { travelStartDate: start } : {}), ...(end ? { travelEndDate: end } : {}), ...(nights !== undefined ? { nights } : {}),
    ...(adults !== undefined ? { adults } : {}), children: ages.length, childAges: ages,
    ...((derivedTravelerCount ?? suppliedTravelerCount) !== undefined ? { travelerCount: derivedTravelerCount ?? suppliedTravelerCount } : {}),
    ...(focCount !== undefined ? { focCount } : {}), ...(budget !== undefined ? { budget } : {}),
    ...(cleanString(suppliedOrExisting(body, 'tripType', existing?.tripType)) ? { tripType: cleanString(suppliedOrExisting(body, 'tripType', existing?.tripType)) } : {}),
    ...(cleanString(suppliedOrExisting(body, 'hotelPreference', existing?.hotelPreference)) ? { hotelPreference: cleanString(suppliedOrExisting(body, 'hotelPreference', existing?.hotelPreference)) } : {}),
    ...(cleanString(suppliedOrExisting(body, 'mealPlanPreference', existing?.mealPlanPreference)) ? { mealPlanPreference: cleanString(suppliedOrExisting(body, 'mealPlanPreference', existing?.mealPlanPreference)) } : {}),
    ...(vehiclePreference ? { vehiclePreference, transportPreference: vehiclePreference } : {}),
    ...(cleanString(suppliedOrExisting(body, 'specialRequirements', existing?.specialRequirements)) ? { specialRequirements: cleanString(suppliedOrExisting(body, 'specialRequirements', existing?.specialRequirements)) } : {}),
    notes: cleanString(suppliedOrExisting(body, 'notes', existing?.notes)) || '',
    tags: body.tags === undefined && existing ? existing.tags : normalizedStringArray(body.tags, 'tags'),
  };
}

leadsRouter.get('/', requireRole(crmRoles), async (req, res) => {
  try {
    const actor = req.user!;
    if (actor.role === 'Sales Manager' && !actor.salesTeamId) throw new LeadRequestError(403, 'MISSING_TEAM_METADATA', 'Sales team metadata is required.');
    if (isDemoRequest(req)) {
      const data = [...demoLeads.values()].filter(lead => canReadLead(req, lead)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
      return res.json({ success: true, data, mode: 'DEMO' });
    }
    let query: any = getAdminDb().collection('leads');
    if (actor.role === 'Sales Executive') query = query.where('assignedEmployeeId', '==', actor.employeeId);
    if (actor.role === 'Sales Manager') query = query.where('salesTeamId', '==', actor.salesTeamId);
    const snapshot = await query.orderBy('createdAt', 'desc').limit(100).get();
    return res.json({ success: true, data: snapshot.docs.map((document: any) => normalizeStoredLead({ id: document.id, ...document.data() })) });
  } catch (error) { return sendError(res, error, 'Lead records could not be loaded.'); }
});

leadsRouter.get('/customer-matches', requireRole(crmRoles), async (req, res) => {
  try {
    const normalizedPhone = normalizeLeadPhone(req.query.phone);
    const normalizedEmail = normalizeLeadEmail(req.query.email);
    if (!normalizedPhone && !normalizedEmail) return res.json({ success: true, data: [] });
    if (normalizedPhone && normalizedPhone.length < 7) throw new LeadRequestError(400, 'INVALID_PHONE', 'Enter at least seven phone digits before matching.');

    const projectCustomer = (value: UnknownRecord) => ({
      id: value.id,
      name: cleanString(value.name) || 'Unnamed Customer',
      phone: cleanString(value.phone) || '',
      email: cleanString(value.email) || '',
      city: cleanString(value.city) || '',
      customerType: value.customerType === 'B2B' ? 'B2B' : 'B2C',
    });
    if (isDemoRequest(req)) {
      const matches = [...demoCustomers.values()].filter(customer =>
        (normalizedPhone && normalizeLeadPhone(customer.phone) === normalizedPhone) ||
        (normalizedEmail && normalizeLeadEmail(customer.email) === normalizedEmail)
      ).slice(0, 5).map(projectCustomer);
      return res.json({ success: true, data: matches, mode: 'DEMO' });
    }

    const customers = getAdminDb().collection('customers');
    const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];
    if (normalizedPhone) queries.push(customers.where('normalizedPhone', '==', normalizedPhone).limit(5).get());
    if (normalizedEmail) queries.push(customers.where('normalizedEmail', '==', normalizedEmail).limit(5).get());
    const snapshots = await Promise.all(queries);
    const matches = new Map<string, UnknownRecord>();
    for (const snapshot of snapshots) for (const document of snapshot.docs) {
      matches.set(document.id, { id: document.id, ...document.data() });
    }
    return res.json({ success: true, data: [...matches.values()].slice(0, 5).map(projectCustomer) });
  } catch (error) { return sendError(res, error, 'Customer matches could not be loaded.'); }
});

leadsRouter.post('/', requireRole(crmRoles), async (req, res) => {
  let attemptedLeadId: string | undefined;
  try {
    const actor = req.user!;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as UnknownRecord : {};
    const requestId = cleanString(body.creationRequestId);
    if (requestId && !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new LeadRequestError(400, 'INVALID_REQUEST_ID', 'creationRequestId is invalid.');
    attemptedLeadId = creationId(actor.employeeId, requestId);
    if (isDemoRequest(req) && demoLeads.has(attemptedLeadId)) return res.status(200).json({ success: true, data: demoLeads.get(attemptedLeadId), idempotent: true });
    const db = isDemoRequest(req) ? null : getAdminDb();
    if (db && requestId) {
      const existing = await db.collection('leads').doc(attemptedLeadId).get();
      if (existing.exists) return res.status(200).json({ success: true, data: normalizeStoredLead({ id: existing.id, ...existing.data() }), idempotent: true });
    }

    const source = leadSourceById(body.sourceId);
    if (!source) throw new LeadRequestError(400, 'INVALID_LEAD_SOURCE', 'Choose a configured Lead source.');
    const priority = (cleanString(body.priority) || 'NORMAL') as LeadPriority;
    if (!(LEAD_PRIORITIES as readonly string[]).includes(priority)) throw new LeadRequestError(400, 'INVALID_LEAD_PRIORITY', 'priority is invalid.');
    let enquiry = buildEnquiryFields(body);

    const requestedAssigneeId = cleanString(body.assignedEmployeeId);
    const useAutomaticDistribution = ['Founder', 'Admin'].includes(actor.role) && !requestedAssigneeId;

    const requestedCustomerId = cleanString(body.customerId);
    let existingCustomer: UnknownRecord | undefined;
    if (requestedCustomerId) {
      if (isDemoRequest(req)) existingCustomer = demoCustomers.get(requestedCustomerId);
      else {
        const snapshot = await db!.collection('customers').doc(requestedCustomerId).get();
        if (snapshot.exists) existingCustomer = { id: snapshot.id, ...snapshot.data() };
      }
      if (!existingCustomer) throw new LeadRequestError(422, 'CUSTOMER_NOT_FOUND', 'The selected Customer no longer exists.');
      const authoritativeName = requiredString(existingCustomer.name, 'Customer name');
      const authoritativePhone = cleanString(existingCustomer.phone) || cleanString(existingCustomer.whatsApp) || cleanString(enquiry.customerPhone) || '';
      const authoritativeEmail = cleanString(existingCustomer.email) || cleanString(enquiry.customerEmail);
      enquiry = {
        ...enquiry,
        customerName: authoritativeName,
        customerPhone: authoritativePhone,
        ...(authoritativeEmail ? { customerEmail: authoritativeEmail } : {}),
        ...(!cleanString(enquiry.customerCity) && cleanString(existingCustomer.city) ? { customerCity: cleanString(existingCustomer.city) } : {}),
      };
    }
    const customerId = requestedCustomerId || `cust-${randomUUID()}`;
    const now = new Date().toISOString();
    const lead = Object.fromEntries(Object.entries({
      ...enquiry, id: attemptedLeadId, customerId,
      ...(cleanString(body.companyId) ? { companyId: cleanString(body.companyId) } : {}),
      sourceId: source.id, source: source.label, sourcePlatform: source.label,
      createdSourceType: useAutomaticDistribution ? source.sourceType : 'MANUAL',
      ...(cleanString(body.sourceReference) ? { sourceReference: cleanString(body.sourceReference) } : {}),
      ...(cleanString(body.campaignId) ? { campaignId: cleanString(body.campaignId) } : {}),
      ...(cleanString(body.formId) ? { formId: cleanString(body.formId) } : {}),
      ...(cleanString(body.adId) ? { adId: cleanString(body.adId) } : {}),
      ...(cleanString(body.contentId) ? { contentId: cleanString(body.contentId) } : {}),
      status: 'NEW', priority,
      ...(requestId ? { creationRequestId: requestId } : {}),
      createdByEmployeeId: actor.employeeId, updatedByEmployeeId: actor.employeeId,
      createdAt: now, updatedAt: now, ...(isDemoRequest(req) ? { isDemo: true } : {}),
    }).filter(([, value]) => value !== undefined)) as unknown as Lead;

    const newCustomer = existingCustomer ? undefined : {
      id: customerId, name: lead.customerName, phone: lead.customerPhone,
      normalizedPhone: normalizeLeadPhone(lead.customerPhone),
      ...(lead.whatsAppNumber ? { whatsApp: lead.whatsAppNumber } : {}),
      email: lead.customerEmail || '', normalizedEmail: normalizeLeadEmail(lead.customerEmail),
      city: lead.customerCity || '', customerType: lead.companyId ? 'B2B' : 'B2C',
      preferences: lead.tags, notes: lead.notes, totalBookings: 0, lifetimeValue: 0,
      createdAt: now, updatedAt: now, ...(isDemoRequest(req) ? { isDemo: true } : {}),
    };
    const result = await distributionService(req).createLead({
      lead,
      actor: distributionActor(req),
      ...(requestedAssigneeId ? { requestedAssigneeId } : {}),
      isExternalDelivery: useAutomaticDistribution,
      ...(newCustomer ? { newCustomer } : {}),
      linkedExistingCustomer: Boolean(existingCustomer),
    });
    if (isDemoRequest(req)) {
      demoLeads.set(result.lead.id, result.lead);
      if (newCustomer) demoCustomers.set(customerId, newCustomer as any);
    }
    return res.status(result.idempotent ? 200 : 201).json({ success: true, data: result.lead, idempotent: result.idempotent });
  } catch (error: any) {
    if (attemptedLeadId && (error?.code === 6 || error?.code === 'already-exists' || error?.code === 'ALREADY_EXISTS')) {
      const snapshot = await getAdminDb().collection('leads').doc(attemptedLeadId).get();
      if (snapshot.exists) return res.status(200).json({ success: true, data: normalizeStoredLead({ id: snapshot.id, ...snapshot.data() }), idempotent: true });
    }
    return sendError(res, error, 'Failed to create Lead.');
  }
});

leadsRouter.get('/distribution/overview', requireRole(['Founder', 'Admin']), async (req, res) => {
  try {
    const data = await distributionService(req).getOverview(distributionActor(req));
    return res.json({ success: true, data, ...(isDemoRequest(req) ? { mode: 'DEMO' } : {}) });
  } catch (error) { return sendError(res, error, 'Lead distribution settings could not be loaded.'); }
});

leadsRouter.patch('/distribution/config', requireRole(['Founder', 'Admin']), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as UnknownRecord : {};
    const data = await distributionService(req).updateConfiguration(body, distributionActor(req));
    return res.json({ success: true, data });
  } catch (error) { return sendError(res, error, 'Lead distribution settings could not be updated.'); }
});

leadsRouter.get('/assignment-options', requireRole(['Founder', 'Admin', 'Sales Manager']), async (req, res) => {
  try {
    const data = await distributionService(req).assignmentOptions(distributionActor(req));
    return res.json({ success: true, data });
  } catch (error) { return sendError(res, error, 'Lead assignment options could not be loaded.'); }
});

leadsRouter.get('/:id/assignment-history', requireRole(crmRoles), async (req, res) => {
  try {
    const data = await distributionService(req).getHistory(req.params.id, distributionActor(req));
    return res.json({ success: true, data });
  } catch (error) { return sendError(res, error, 'Lead assignment history could not be loaded.'); }
});

leadsRouter.patch('/:id/assignment', requireRole(['Founder', 'Admin', 'Sales Manager']), async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as UnknownRecord : {};
    const result = await distributionService(req).reassignLead({
      leadId: req.params.id,
      targetEmployeeId: requiredString(body.targetEmployeeId, 'targetEmployeeId'),
      expectedUpdatedAt: requiredString(body.expectedUpdatedAt, 'expectedUpdatedAt'),
      ...(cleanString(body.note) ? { note: cleanString(body.note) } : {}),
      actor: distributionActor(req),
    });
    if (isDemoRequest(req)) demoLeads.set(result.lead.id, result.lead);
    return res.json({ success: true, data: result.lead, history: result.history });
  } catch (error) { return sendError(res, error, 'Lead could not be reassigned.'); }
});

leadsRouter.patch('/:id', requireRole(crmRoles), async (req, res) => {
  try {
    const actor = req.user!;
    const leadId = req.params.id;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as UnknownRecord : {};
    const expectedUpdatedAt = requiredString(body.expectedUpdatedAt, 'expectedUpdatedAt');
    const db = isDemoRequest(req) ? null : getAdminDb();
    const snapshot = db ? await db.collection('leads').doc(leadId).get() : null;
    const existing = isDemoRequest(req) ? demoLeads.get(leadId) : snapshot?.exists ? normalizeStoredLead({ id: snapshot.id, ...snapshot.data() }) : undefined;
    if (!existing) throw new LeadRequestError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
    if (!canReadLead(req, existing)) throw new LeadRequestError(403, 'LEAD_SCOPE_DENIED', 'This Lead is outside your Sales scope.');
    if (existing.updatedAt !== expectedUpdatedAt) throw new LeadRequestError(409, 'LEAD_VERSION_CONFLICT', 'This Lead changed after you opened it. Reload before saving.');

    if ('assignedEmployeeId' in body || 'assignmentStatus' in body || 'assignmentReason' in body || 'assignedAt' in body) {
      throw new LeadRequestError(400, 'USE_ASSIGNMENT_ENDPOINT', 'Lead assignment is server-controlled and must use the assignment endpoint.');
    }
    const protectedFields = [
      'id', 'customerId', 'companyId', 'salesTeamId', 'assignedEmployeeName', 'createdByEmployeeId',
      'updatedByEmployeeId', 'createdAt', 'bookingId', 'quoteId', 'convertedBookingId', 'createdSourceType',
    ];
    if (protectedFields.some(field => field in body)) throw new LeadRequestError(400, 'PROTECTED_LEAD_FIELD', 'Ownership, team, audit, and timestamp fields are server-controlled.');

    const editableEnquiryFields = ['customerName', 'customerPhone', 'customerEmail', 'salutation', 'alternatePhone', 'whatsAppNumber', 'customerCity', 'destination', 'travelStartDate', 'travelEndDate', 'nights', 'adults', 'children', 'childAges', 'travelerCount', 'focCount', 'budget', 'tripType', 'hotelPreference', 'mealPlanPreference', 'vehiclePreference', 'transportPreference', 'specialRequirements', 'notes', 'tags'];
    const changesEnquiry = editableEnquiryFields.some(field => field in body);
    const enquiryFields = changesEnquiry ? buildEnquiryFields(body, existing) : {};
    let sourceFields: UnknownRecord = {};
    if (body.sourceId !== undefined) {
      const source = leadSourceById(body.sourceId);
      if (!source) throw new LeadRequestError(400, 'INVALID_LEAD_SOURCE', 'Choose a configured Lead source.');
      sourceFields = { sourceId: source.id, source: source.label, sourcePlatform: source.label };
    }
    for (const field of ['sourceReference', 'campaignId', 'formId', 'adId', 'contentId']) if (field in body) sourceFields[field] = cleanString(body[field]) || '';

    const stage = body.status === undefined ? existing.status : body.status as LeadStatus;
    if (!(LEAD_STAGES as readonly string[]).includes(stage)) throw new LeadRequestError(400, 'INVALID_LEAD_STAGE', 'status is not a canonical Lead stage.');
    const priority = body.priority === undefined ? existing.priority : body.priority as LeadPriority;
    if (!(LEAD_PRIORITIES as readonly string[]).includes(priority)) throw new LeadRequestError(400, 'INVALID_LEAD_PRIORITY', 'priority is invalid.');
    let dropFields: UnknownRecord = {};
    if (stage === 'DROPPED') {
      const reason = (body.dropReason ?? existing.dropReason) as LeadDropReason;
      if (!(LEAD_DROP_REASONS as readonly string[]).includes(reason)) throw new LeadRequestError(400, 'DROP_REASON_REQUIRED', 'A valid dropReason is required when a Lead is dropped.');
      dropFields = { dropReason: reason, ...(cleanString(body.dropNote ?? existing.dropNote) ? { dropNote: cleanString(body.dropNote ?? existing.dropNote) } : {}) };
    }

    const now = new Date().toISOString();
    const updates = Object.fromEntries(Object.entries({
      ...enquiryFields, ...sourceFields,
      ...(body.status !== undefined ? { status: stage } : {}), ...(body.priority !== undefined ? { priority } : {}), ...dropFields,
      updatedAt: now, updatedByEmployeeId: actor.employeeId,
    }).filter(([, value]) => value !== undefined));
    if (Object.keys(updates).length <= 2) throw new LeadRequestError(400, 'EMPTY_LEAD_UPDATE', 'No supported Lead fields were supplied.');
    const updated = { ...existing, ...updates } as Lead;
    for (const field of clearableLeadFields) {
      if (Object.prototype.hasOwnProperty.call(body, field) && (body[field] === null || body[field] === '')) {
        delete (updated as UnknownRecord)[field];
      }
    }
    if (stage !== 'DROPPED') {
      delete (updated as UnknownRecord).dropReason;
      delete (updated as UnknownRecord).dropNote;
    }
    const packageChanges = commercialChanges(existing, updated);
    const audits: UnknownRecord[] = [];
    if (stage !== existing.status) audits.push(audit(stage === 'DROPPED' ? 'LEAD_DROPPED' : 'LEAD_STAGE_CHANGED', actor, leadId, existing, updated, `Lead stage changed from ${existing.status} to ${stage}.`));
    if (priority !== existing.priority) audits.push(audit('LEAD_PRIORITY_CHANGED', actor, leadId, existing, updated, `Lead priority changed from ${existing.priority} to ${priority}.`));
    if (changesEnquiry || Object.keys(sourceFields).length) audits.push(audit('LEAD_UPDATED', actor, leadId, existing, updated, 'Structured Lead details updated.'));

    const affectedTrips: UnknownRecord[] = [];
    if (isDemoRequest(req)) {
      demoLeads.set(leadId, updated);
      demoDistributionStorage.rawSet('leads', leadId, updated);
      for (const event of audits) demoAuditLogs.set(event.id, event);
    } else {
      await db!.runTransaction(async transaction => {
        const leadRef = db!.collection('leads').doc(leadId);
        const currentSnapshot = await transaction.get(leadRef);
        if (!currentSnapshot.exists) throw new LeadRequestError(404, 'LEAD_NOT_FOUND', 'Lead not found.');
        const current = normalizeStoredLead({ id: currentSnapshot.id, ...currentSnapshot.data() });
        if (current.updatedAt !== expectedUpdatedAt) throw new LeadRequestError(409, 'LEAD_VERSION_CONFLICT', 'This Lead changed after you opened it. Reload before saving.');

        const linkedTrips = packageChanges.length > 0
          ? await transaction.get(db!.collection('trips').where('leadId', '==', leadId))
          : null;
        transaction.set(leadRef, updated);
        if (linkedTrips) for (const document of linkedTrips.docs) {
          const trip = { id: document.id, ...document.data() } as UnknownRecord;
          if (!reviewableTripStatuses.has(String(trip.status))) continue;
          const tripUpdates = {
            costingStatus: 'PENDING',
            packageReview: {
              required: true,
              reason: 'LEAD_COMMERCIAL_DETAILS_CHANGED',
              changes: packageChanges,
              markedAt: now,
              markedByEmployeeId: actor.employeeId,
            },
            updatedAt: now,
            updatedByEmployeeId: actor.employeeId,
          };
          transaction.update(document.ref, tripUpdates);
          affectedTrips.push({ ...trip, ...tripUpdates });
          const reviewAudit = {
            ...audit('PACKAGE_REVIEW_REQUIRED', actor, document.id, { costingStatus: trip.costingStatus }, tripUpdates, 'Lead travel details changed; package review and recalculation are required.'),
            entityType: 'TRIP',
          };
          transaction.create(db!.collection('audit_logs').doc(reviewAudit.id), reviewAudit);
        }
        for (const event of audits) transaction.create(db!.collection('audit_logs').doc(event.id), event);
      });
    }
    return res.json({ success: true, data: updated, affectedTrips, commercialChanges: packageChanges });
  } catch (error) { return sendError(res, error, 'Failed to update Lead.'); }
});

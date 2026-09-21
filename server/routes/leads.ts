import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { Lead } from '../../src/types/index.js';

export const leadsRouter = Router();

// Allowed roles for basic lead management
const crmRoles: import('../../src/types/index.js').UserRole[] = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'];

leadsRouter.post('/', requireRole(crmRoles), async (req: Request, res: Response) => {
  try {
    const actor = req.user!;
    const body = req.body;
    const db = getAdminDb();

    // Field Allowlist for creation
    const {
      customerName, customerPhone, customerEmail,
      source, sourcePlatform, destination,
      travelStartDate, travelEndDate, travelerCount, tripType,
      budget, priority, notes, keyInterests,
      companyId, campaignId, adId, contentId,
      hotelPreference, transportPreference
    } = body;

    // Validate required fields
    if (!customerName || !customerPhone || !destination || !travelStartDate || !travelEndDate || !travelerCount || !tripType || !budget || !source) {
      return res.status(400).json({ error: 'Missing required lead fields.' });
    }

    const newLead: Partial<Lead> = {
      customerName, customerPhone, customerEmail,
      source, sourcePlatform, destination,
      travelStartDate, travelEndDate, travelerCount, tripType,
      budget, priority, notes, keyInterests,
      companyId, campaignId, adId, contentId,
      hotelPreference, transportPreference,
      
      // Server-controlled fields
      id: `lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'NEW', // Default status for new leads
      leadScore: 50, // Default server-assigned score
      lastContactAt: new Date().toISOString(),
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    // Customer ID linkage
    newLead.customerId = body.customerId || `cust-${Date.now()}`;

    // Assignment Logic
    if (actor.role === 'Sales Executive') {
      // Sales Executives can only assign to themselves
      newLead.assignedEmployeeId = actor.id;
      newLead.assignedEmployeeName = actor.name;
    } else {
      // Founder/Admin/Manager can assign to provided employee, defaulting to themselves
      newLead.assignedEmployeeId = body.assignedEmployeeId || actor.id;
      newLead.assignedEmployeeName = body.assignedEmployeeName || actor.name;
    }

    await db.collection('leads').doc(newLead.id!).set(newLead);

    // Audit Log
    const auditLog = {
      id: `audit-${Date.now()}`,
      action: 'LEAD_CREATED',
      entityType: 'LEAD',
      entityId: newLead.id!,
      actor: { id: actor.id, name: actor.name, role: actor.role },
      before: null,
      after: newLead,
      summary: 'New inbound lead registered',
      timestamp: new Date().toISOString()
    };
    await db.collection('audit_logs').doc(auditLog.id).set(auditLog);

    res.json({ success: true, data: newLead });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create lead' });
  }
});

leadsRouter.patch('/:id', requireRole(crmRoles), async (req: Request, res: Response) => {
  try {
    const leadId = req.params.id;
    const actor = req.user!;
    const updates = req.body;

    const db = getAdminDb();
    const leadRef = db.collection('leads').doc(leadId);
    const docSnap = await leadRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const existingLead = docSnap.data() as Lead;

    // IDOR Protection: Sales Executive can only edit assigned leads
    if (actor.role === 'Sales Executive' && existingLead.assignedEmployeeId !== actor.id) {
      return res.status(403).json({ error: 'Access Denied: You are not assigned to this lead.' });
    }

    // Role limitation: Only Admin/Founder/Sales Manager can reassign a lead
    if ('assignedEmployeeId' in updates && updates.assignedEmployeeId !== existingLead.assignedEmployeeId) {
      if (actor.role === 'Sales Executive') {
        return res.status(403).json({ error: 'Access Denied: You cannot reassign leads.' });
      }
    }

    // Field Allowlist
    const allowedFields = [
      'status', 'notes', 'assignedEmployeeId', 'assignedEmployeeName',
      'priority', 'lastContactAt', 'nextFollowUpAt', 'destination',
      'travelStartDate', 'travelEndDate', 'travelerCount', 'tripType',
      'budget', 'customerName', 'customerPhone', 'customerEmail'
    ];

    const safeUpdates: Partial<Lead> = {};
    for (const key of allowedFields) {
      if (key in updates && updates[key] !== undefined) {
        (safeUpdates as any)[key] = updates[key];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided for update.' });
    }

    safeUpdates.updatedAt = new Date().toISOString();

    await leadRef.update(safeUpdates);

    // Audit logging
    let action = 'LEAD_UPDATED';
    let summary = 'Lead details updated';

    if (safeUpdates.status && safeUpdates.status !== existingLead.status) {
      action = 'LEAD_STATUS_CHANGED';
      summary = `Status changed to ${safeUpdates.status}`;
    } else if (safeUpdates.assignedEmployeeId && safeUpdates.assignedEmployeeId !== existingLead.assignedEmployeeId) {
      action = 'LEAD_REASSIGNED';
      summary = `Reassigned to ${safeUpdates.assignedEmployeeName}`;
    }

    const auditLog = {
      id: `audit-${Date.now()}`,
      action,
      entityType: 'LEAD',
      entityId: leadId,
      actor: { id: actor.id, name: actor.name, role: actor.role },
      before: existingLead,
      after: { ...existingLead, ...safeUpdates },
      summary,
      timestamp: new Date().toISOString()
    };
    await db.collection('audit_logs').doc(auditLog.id).set(auditLog);

    res.json({ success: true, data: { ...existingLead, ...safeUpdates } });

  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update lead' });
  }
});

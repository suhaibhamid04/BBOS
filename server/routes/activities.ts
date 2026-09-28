import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateActivityCost, buildRoleGatedActivityResult } from '../../src/services/activityEngine.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';
import { inventoryManagementService, InventoryManagementError, type InventoryActor } from '../services/inventoryManagementService.js';

export const activitiesRouter = Router();
const readRoles = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations'] as const;
const rateRoles = ['Founder', 'Admin', 'Accounts', 'Reservations'] as const;
const manageRoles = ['Founder', 'Admin'] as const;
function actor(req: Request): InventoryActor { const user = req.user!; return { firebaseUid: user.firebaseUid, employeeId: user.employeeId, role: user.role, active: user.active, name: user.name }; }
function fail(error: unknown, res: Response, context: string) { if (error instanceof InventoryManagementError) return res.status(error.statusCode).json({ error: error.message, code: error.code }); console.error(`API Error in ${context}:`, error); return res.status(500).json({ error: 'Internal Server Error', code: 'INVENTORY_OPERATION_FAILED' }); }

activitiesRouter.get('/masters', requireRole([...readRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listActivities(actor(req)) }); } catch (error) { return fail(error, res, 'GET /activities/masters'); } });
activitiesRouter.post('/masters', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createActivity(req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /activities/masters'); } });
activitiesRouter.patch('/masters/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateActivity(req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /activities/masters/:id'); } });

activitiesRouter.get('/rates', requireRole([...rateRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listActivityRates(actor(req)) }); } catch (error) { return fail(error, res, 'GET /activities/rates'); } });
activitiesRouter.post('/rates', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createActivityRate(req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /activities/rates'); } });
activitiesRouter.patch('/rates/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateActivityRate(req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /activities/rates/:id'); } });

activitiesRouter.get('/providers', requireRole([...rateRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listSuppliers('ACTIVITY', actor(req)) }); } catch (error) { return fail(error, res, 'GET /activities/providers'); } });
activitiesRouter.post('/providers', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createSupplier('ACTIVITY', req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /activities/providers'); } });
activitiesRouter.patch('/providers/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateSupplier('ACTIVITY', req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /activities/providers/:id'); } });

activitiesRouter.post('/calculate-rate', requireRole([...readRoles]), async (req: Request, res: Response) => {
  try {
    const { activityId, date, adults, children, infants, vehicles, groups, tickets, hours, days, sessions } = req.body;
    if (!activityId || !date) return res.status(400).json({ error: 'activityId and date are required' });
    const activity = await inventoryManagementService.activitySnapshot(activityId);
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });
    if (!activity.active) return res.status(409).json({ error: 'The selected activity is inactive.' });
    const rates = await inventoryManagementService.activityCalculationData(activityId);
    const target = date.slice(0, 10);
    const activeRate = rates.find((rate) => rate.status === 'ACTIVE' && rate.activityId === activityId && rate.validFrom.slice(0, 10) <= target && (!rate.validTo || rate.validTo.slice(0, 10) >= target));
    if (!activeRate) return res.json({ success: true, data: { available: false, error: 'No active rate found for the specified activity and date.' } });
    const result = calculateActivityCost({ ratePeriod: activeRate, params: { adults, children, infants, vehicles, groups, tickets, hours, days, sessions } });
    const safe = buildRoleGatedActivityResult(result, req.user!.role);
    const supplier = await inventoryManagementService.supplierSnapshot(activeRate.supplierId);
    return res.json({ success: true, data: sanitizeFinancialData({ ...safe, rateId: activeRate.id, supplierId: activeRate.supplierId, supplierName: supplier?.name, supplierCost: safe.totalAmount, pricingModel: activeRate.pricingModel, needsConfirmation: ['NEEDS_CONFIRMATION', 'ON_REQUEST'].includes(activeRate.availabilityStatus), taxDescription: 'GST INCLUDED' }, req.user!.role) });
  } catch (error) { return fail(error, res, 'POST /activities/calculate-rate'); }
});

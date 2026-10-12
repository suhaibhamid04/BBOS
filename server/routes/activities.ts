import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateActivityCost } from '../../src/services/activityEngine.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';
import { inventoryManagementService, InventoryManagementError, type InventoryActor } from '../services/inventoryManagementService.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_TRIPS } from '../../src/services/demoData.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationDecision } from '../authorization/policyTypes.js';

export const activitiesRouter = Router();
const readRoles = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations'] as const;
const rateRoles = ['Founder', 'Admin', 'Accounts', 'Reservations'] as const;
const manageRoles = ['Founder', 'Admin'] as const;
function actor(req: Request): InventoryActor { const user = req.user!; return { firebaseUid: user.firebaseUid, employeeId: user.employeeId, role: user.role, active: user.active, name: user.name }; }
function fail(error: unknown, res: Response, context: string) { if (error instanceof InventoryManagementError || error instanceof ResourceAuthorizationError) return res.status(error.statusCode).json({ error: error.message, code: error.code }); console.error(`API Error in ${context}:`, error); return res.status(500).json({ error: 'Internal Server Error', code: 'INVENTORY_OPERATION_FAILED' }); }

async function scopedFinancialDecision(req: Request): Promise<AuthorizationDecision | undefined> {
  if (!['Sales Executive', 'Sales Manager', 'Reservations', 'Operations'].includes(req.user!.role)) return undefined;
  const tripId = typeof req.body.tripId === 'string' ? req.body.tripId.trim() : '';
  if (!tripId) throw new InventoryManagementError(400, 'TRIP_REQUIRED', 'Trip ID is required to authorize Sales supplier-cost visibility.');
  let trip: Record<string, any> | undefined;
  if (APP_CONFIG.DEMO_MODE) {
    trip = DEMO_TRIPS.find(candidate => candidate.id === tripId) as unknown as Record<string, any> | undefined;
    trip ||= {
      id: tripId, status: 'DRAFT', assignedSalesEmployeeId: req.user!.employeeId, salesTeamId: req.user!.salesTeamId,
      assignedReservationsEmployeeId: req.user!.role === 'Reservations' ? req.user!.employeeId : undefined,
      assignedOperationsEmployeeId: req.user!.role === 'Operations' ? req.user!.employeeId : undefined,
    };
  } else {
    const snapshot = await getAdminDb().collection('trips').doc(tripId).get();
    if (snapshot.exists) trip = { id: snapshot.id, ...snapshot.data() };
  }
  if (!trip) throw new InventoryManagementError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
  const action = req.user!.role === 'Reservations' || req.user!.role === 'Operations' ? 'READ_DETAIL' : 'READ_FINANCIALS';
  return assertAuthorizedResource(req.user!, 'TRIP', action, tripResourceContext(trip));
}

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
    const { activityId, date, adults, children, infants, vehicles, groups, tickets, hours, days, sessions, units } = req.body;
    if (!activityId || !date) return res.status(400).json({ error: 'activityId and date are required' });
    const financialAuthorization = await scopedFinancialDecision(req);
    const activity = await inventoryManagementService.activitySnapshot(activityId);
    if (!activity) return res.status(404).json({ error: 'Activity not found.' });
    if (!activity.active) return res.status(409).json({ error: 'The selected activity is inactive.' });
    const rates = await inventoryManagementService.activityCalculationData(activityId);
    const target = date.slice(0, 10);
    const activeRate = rates.find((rate) => rate.status === 'ACTIVE' && rate.activityId === activityId && rate.validFrom.slice(0, 10) <= target && (!rate.validTo || rate.validTo.slice(0, 10) >= target));
    if (!activeRate) return res.json({ success: true, data: { available: false, error: 'No active rate found for the specified activity and date.' } });
    const result = calculateActivityCost({ ratePeriod: activeRate, params: { adults, children, infants, vehicles, groups, tickets, hours, days, sessions, units } });
    const supplier = await inventoryManagementService.supplierSnapshot(activeRate.supplierId);
    return res.json({ success: true, data: sanitizeFinancialData({ ...result, rateId: activeRate.id, supplierId: activeRate.supplierId, supplierName: supplier?.name, supplierCost: result.totalAmount, pricingModel: activeRate.pricingModel, needsConfirmation: ['NEEDS_CONFIRMATION', 'ON_REQUEST'].includes(activeRate.availabilityStatus), taxDescription: 'GST INCLUDED' }, req.user!.role, financialAuthorization) });
  } catch (error) { return fail(error, res, 'POST /activities/calculate-rate'); }
});

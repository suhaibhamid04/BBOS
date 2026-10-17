import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateTransportCost } from '../../src/services/transportEngine.js';
import { DEMO_TRANSPORT_SUPPLEMENTS } from '../../src/services/transportDemoData.js';
import { APP_CONFIG } from '../../src/config.js';
import { projectSupplierCalculation } from '../middleware/financialGuard.js';
import { inventoryManagementService, InventoryManagementError, type InventoryActor } from '../services/inventoryManagementService.js';
import { DEMO_TRIPS } from '../../src/services/demoData.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationDecision } from '../authorization/policyTypes.js';

export const transportRouter = Router();
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

transportRouter.get('/vehicle-categories', requireRole([...readRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listVehicleCategories(actor(req)) }); } catch (error) { return fail(error, res, 'GET /transport/vehicle-categories'); } });
transportRouter.post('/vehicle-categories', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createVehicle(req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /transport/vehicle-categories'); } });
transportRouter.patch('/vehicle-categories/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateVehicle(req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /transport/vehicle-categories/:id'); } });

transportRouter.get('/rates', requireRole([...rateRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listTransportRates(actor(req)) }); } catch (error) { return fail(error, res, 'GET /transport/rates'); } });
transportRouter.post('/rates', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createTransportRate(req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /transport/rates'); } });
transportRouter.patch('/rates/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateTransportRate(req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /transport/rates/:id'); } });

transportRouter.get('/suppliers', requireRole([...rateRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.listSuppliers('TRANSPORT', actor(req)) }); } catch (error) { return fail(error, res, 'GET /transport/suppliers'); } });
transportRouter.post('/suppliers', requireRole([...manageRoles]), async (req, res) => { try { return res.status(201).json({ success: true, data: await inventoryManagementService.createSupplier('TRANSPORT', req.body, actor(req)) }); } catch (error) { return fail(error, res, 'POST /transport/suppliers'); } });
transportRouter.patch('/suppliers/:id', requireRole([...manageRoles]), async (req, res) => { try { return res.json({ success: true, data: await inventoryManagementService.updateSupplier('TRANSPORT', req.params.id, req.body, actor(req)) }); } catch (error) { return fail(error, res, 'PATCH /transport/suppliers/:id'); } });

transportRouter.post('/calculate-rate', requireRole([...readRoles]), async (req: Request, res: Response) => {
  try {
    const { vehicleCategoryId, startDate, serviceType, vehicleDays, vehicleCount, chargeableDays, nightHalts, occurrences, distanceKm, hours } = req.body;
    if (!vehicleCategoryId || !startDate || !serviceType) return res.status(400).json({ error: 'vehicleCategoryId, startDate, and serviceType are required' });
    const financialAuthorization = await scopedFinancialDecision(req);
    const vehicle = await inventoryManagementService.vehicleSnapshot(vehicleCategoryId);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle category not found.' });
    if (!vehicle.active) return res.status(409).json({ error: 'The selected vehicle category is inactive.' });
    const ratePeriods = await inventoryManagementService.transportCalculationData(vehicleCategoryId, serviceType);
    const target = startDate.slice(0, 10);
    const activeRate = ratePeriods.find((rate) => rate.status === 'ACTIVE' && rate.vehicleCategoryId === vehicleCategoryId && rate.serviceType === serviceType && rate.validFrom.slice(0, 10) <= target && (!rate.validTo || rate.validTo.slice(0, 10) >= target));
    if (!activeRate) return res.json({ success: true, data: { available: false, error: 'No active rate found for the specified category, service type, and date.' } });
    const result = calculateTransportCost({ ratePeriod: activeRate, supplements: APP_CONFIG.DEMO_MODE ? DEMO_TRANSPORT_SUPPLEMENTS : [], serviceParams: { vehicleDays: vehicleDays || 1, vehicleCount: vehicleCount || 1, chargeableDays: chargeableDays || vehicleDays || 1, nightHalts: nightHalts || 0, occurrences: occurrences || 1, distanceKm: distanceKm || 0, hours: hours || 0 } });
    const supplier = await inventoryManagementService.supplierSnapshot(activeRate.supplierId);
    return res.json({ success: true, data: projectSupplierCalculation({ ...result, rateId: activeRate.id, supplierId: activeRate.supplierId, supplierName: supplier?.name, pricingUnit: activeRate.pricingUnit, baseSupplierCost: result.breakdown?.baseVehicleCost, supplementCost: result.breakdown?.additionalChargesTotal, supplierCost: result.totalAmount, availabilityStatus: activeRate.availabilityStatus, needsConfirmation: ['NEEDS_CONFIRMATION', 'ON_REQUEST'].includes(activeRate.availabilityStatus), taxDescription: 'GST INCLUDED' }, req.user!.role, financialAuthorization) });
  } catch (error) { return fail(error, res, 'POST /transport/calculate-rate'); }
});

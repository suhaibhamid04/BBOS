import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateMixedAllocatedStayTotal, calculateStayTotal, buildRoleGatedResult } from '../../src/services/accommodationEngine.js';
import { projectSupplierCalculation } from '../middleware/financialGuard.js';
import type { PackageSupplierRateInput, RoomAllocation, TaxTreatment } from '../../src/types/accommodation.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_TRIPS } from '../../src/services/demoData.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { tripResourceContext } from '../authorization/resourceContext.js';
import type { AuthorizationDecision } from '../authorization/policyTypes.js';
import {
  inventoryManagementService,
  InventoryManagementError,
  type InventoryActor,
} from '../services/inventoryManagementService.js';

export const accommodationRouter = Router();
const readRoles = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations'] as const;
const rateRoles = ['Founder', 'Admin', 'Accounts', 'Reservations'] as const;
const manageRoles = ['Founder', 'Admin'] as const;
const PACKAGE_RATE_MAX = 100_000_000;
const PACKAGE_RATE_FIELDS = new Set(['entryMode', 'amount', 'taxTreatment', 'supplierQuoteReference', 'overrideReason']);
const PACKAGE_TAX_TREATMENTS = new Set<TaxTreatment>(['NET', 'INCLUSIVE', 'GST_5', 'GST_18', 'CUSTOM_TAX', 'NEEDS_CONFIRMATION']);

function packageRateInput(value: unknown): PackageSupplierRateInput | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new InventoryManagementError(400, 'INVALID_PACKAGE_RATE', 'Package supplier rate must be an object.');
  const raw = value as Record<string, unknown>;
  const forged = Object.keys(raw).find(key => !PACKAGE_RATE_FIELDS.has(key));
  if (forged) throw new InventoryManagementError(400, 'SERVER_CONTROLLED_PACKAGE_RATE_FIELD', `${forged} is not accepted from the client.`);
  if (raw.entryMode !== 'PER_ROOM_NIGHT' && raw.entryMode !== 'TOTAL_STAY') throw new InventoryManagementError(400, 'INVALID_PACKAGE_RATE_MODE', 'Choose a per-room/night rate or a total-stay supplier quote.');
  if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount > PACKAGE_RATE_MAX) throw new InventoryManagementError(400, 'INVALID_PACKAGE_RATE_AMOUNT', `Package supplier rate must be greater than zero and no more than ${PACKAGE_RATE_MAX}.`);
  if (!PACKAGE_TAX_TREATMENTS.has(raw.taxTreatment as TaxTreatment)) throw new InventoryManagementError(400, 'INVALID_PACKAGE_RATE_TAX', 'Package supplier rate tax treatment is invalid.');
  const text = (field: 'supplierQuoteReference' | 'overrideReason') => raw[field] === undefined ? undefined : typeof raw[field] === 'string' ? raw[field].trim().slice(0, 500) || undefined : (() => { throw new InventoryManagementError(400, 'INVALID_PACKAGE_RATE_REFERENCE', `${field} must be text.`); })();
  return { entryMode: raw.entryMode, amount: raw.amount, taxTreatment: raw.taxTreatment as TaxTreatment, ...(text('supplierQuoteReference') ? { supplierQuoteReference: text('supplierQuoteReference') } : {}), ...(text('overrideReason') ? { overrideReason: text('overrideReason') } : {}) };
}

function actor(req: Request): InventoryActor {
  const user = req.user!;
  return { firebaseUid: user.firebaseUid, employeeId: user.employeeId, role: user.role, active: user.active, name: user.name };
}
function errorResponse(error: unknown, res: Response, context: string) {
  if (error instanceof InventoryManagementError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'INVENTORY_OPERATION_FAILED' });
}

accommodationRouter.get('/properties', requireRole([...readRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listProperties(actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/properties'); }
});

accommodationRouter.get('/properties/:id', requireRole([...readRoles]), async (req, res) => {
  try {
    const property = (await inventoryManagementService.listProperties(actor(req))).find((item) => item.id === req.params.id);
    return property ? res.json({ success: true, data: property }) : res.status(404).json({ error: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
  } catch (error) { return errorResponse(error, res, 'GET /accommodation/properties/:id'); }
});

accommodationRouter.post('/properties', requireRole([...manageRoles]), async (req, res) => {
  try { return res.status(201).json({ success: true, data: await inventoryManagementService.createProperty(req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'POST /accommodation/properties'); }
});
accommodationRouter.patch('/properties/:id', requireRole([...manageRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.updateProperty(req.params.id, req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'PATCH /accommodation/properties/:id'); }
});

accommodationRouter.get('/properties/:id/rooms', requireRole([...readRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listRooms(req.params.id, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/properties/:id/rooms'); }
});
accommodationRouter.get('/rooms', requireRole([...readRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listAllRooms(actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/rooms'); }
});
accommodationRouter.post('/rooms', requireRole([...manageRoles]), async (req, res) => {
  try { return res.status(201).json({ success: true, data: await inventoryManagementService.createRoom(req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'POST /accommodation/rooms'); }
});
accommodationRouter.patch('/rooms/:id', requireRole([...manageRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.updateRoom(req.params.id, req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'PATCH /accommodation/rooms/:id'); }
});

accommodationRouter.get('/properties/:id/rates', requireRole([...rateRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listAccommodationRates(req.params.id, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/properties/:id/rates'); }
});
accommodationRouter.get('/rates', requireRole([...rateRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listAllAccommodationRates(actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/rates'); }
});
accommodationRouter.post('/rates', requireRole([...manageRoles]), async (req, res) => {
  try { return res.status(201).json({ success: true, data: await inventoryManagementService.createAccommodationRate(req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'POST /accommodation/rates'); }
});
accommodationRouter.patch('/rates/:id', requireRole([...manageRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.updateAccommodationRate(req.params.id, req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'PATCH /accommodation/rates/:id'); }
});

accommodationRouter.get('/suppliers', requireRole([...rateRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.listSuppliers('HOTEL', actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'GET /accommodation/suppliers'); }
});
accommodationRouter.post('/suppliers', requireRole([...manageRoles]), async (req, res) => {
  try { return res.status(201).json({ success: true, data: await inventoryManagementService.createSupplier('HOTEL', req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'POST /accommodation/suppliers'); }
});
accommodationRouter.patch('/suppliers/:id', requireRole([...manageRoles]), async (req, res) => {
  try { return res.json({ success: true, data: await inventoryManagementService.updateSupplier('HOTEL', req.params.id, req.body, actor(req)) }); }
  catch (error) { return errorResponse(error, res, 'PATCH /accommodation/suppliers/:id'); }
});

accommodationRouter.post('/calculate-rate', requireRole([...readRoles]), async (req: Request, res: Response) => {
  try {
    const { propertyId, roomCategoryId, checkInDate, nights, mealPlan, adults, children, childrenWithBed, childrenWithoutBed, rateId, tripId, roomAllocations } = req.body;
    const packageRate = packageRateInput(req.body.packageRate);
    if (!propertyId || !roomCategoryId || !checkInDate || !mealPlan) return res.status(400).json({ error: 'Required accommodation calculation fields are missing.' });
    const data = await inventoryManagementService.accommodationCalculationData(propertyId, roomCategoryId);
    if (!data.property || !data.room || data.room.propertyId !== propertyId) return res.status(404).json({ error: 'Property or room category not found.' });
    if (data.property.status !== 'ACTIVE' || !data.room.active) return res.status(409).json({ error: 'The selected property or room category is inactive.' });
    const activeRates = data.rates.filter((rate) => rate.status === 'ACTIVE');
    const validRates = activeRates.filter((rate) =>
      rate.propertyId === propertyId && rate.roomCategoryId === roomCategoryId && rate.mealPlan === mealPlan &&
      checkInDate >= rate.validFrom.slice(0, 10) && (!rate.validTo || checkInDate <= rate.validTo.slice(0, 10))
    );
    const selectedRate = rateId ? validRates.find((rate) => rate.id === rateId) : undefined;
    if (rateId && !selectedRate) {
      return res.status(422).json({
        error: 'The selected contracted rate does not match the property, room, meal plan, or service date.',
        code: 'INVENTORY_RATE_MISMATCH',
      });
    }
    let trip: Record<string, any> | undefined;
    let resourceAuthorization: AuthorizationDecision | undefined;
    if (typeof tripId === 'string' && tripId) {
      if (APP_CONFIG.DEMO_MODE) {
        trip = DEMO_TRIPS.find(candidate => candidate.id === tripId) as unknown as Record<string, any> | undefined;
        // Client-created demo Trips live in isolated browser storage. Explicit demo
        // mode still exercises the same policy scope using the authenticated persona.
        trip ||= {
          id: tripId, status: 'DRAFT', assignedSalesEmployeeId: req.user!.employeeId,
          salesTeamId: req.user!.salesTeamId,
          assignedReservationsEmployeeId: req.user!.role === 'Reservations' ? req.user!.employeeId : undefined,
          assignedOperationsEmployeeId: req.user!.role === 'Operations' ? req.user!.employeeId : undefined,
          adults, children, childAges: req.body.childAges,
        };
      } else {
        const snapshot = await getAdminDb().collection('trips').doc(tripId).get();
        if (snapshot.exists) trip = { id: snapshot.id, ...snapshot.data() };
      }
      if (!trip) return res.status(404).json({ error: 'Trip not found.', code: 'TRIP_NOT_FOUND' });
      const action = req.user!.role === 'Reservations' || req.user!.role === 'Operations' ? 'READ_DETAIL' : 'READ_FINANCIALS';
      resourceAuthorization = assertAuthorizedResource(req.user!, 'TRIP', action, tripResourceContext(trip));
    }
    if (Array.isArray(roomAllocations) && !trip) {
      return res.status(400).json({ error: 'A Trip is required for room-by-room occupancy validation.', code: 'TRIP_REQUIRED' });
    }
    const authoritativeParty = trip ? {
      adults: Number(trip.adults || 0),
      children: Number(trip.children || 0),
      childAges: Array.isArray(trip.childAges) ? trip.childAges.map(Number) : [],
    } : { adults: Number(adults || 0), children: Number(children || 0), childAges: [] };
    const requestedAllocations = Array.isArray(roomAllocations)
      ? (roomAllocations as RoomAllocation[]).map((allocation, index) => index === 0 && selectedRate ? { ...allocation, rateId: selectedRate.id } : allocation)
      : [];
    if (requestedAllocations.length > 0 && requestedAllocations[0].roomCategoryId !== roomCategoryId) {
      return res.status(422).json({ error: 'The primary room category must match Room 1.', code: 'ROOM_CATEGORY_MISMATCH' });
    }
    const mixedData = requestedAllocations.length > 0
      ? await inventoryManagementService.accommodationCalculationDataForRooms(propertyId, requestedAllocations.map(allocation => allocation.roomCategoryId))
      : null;
    if (mixedData && (mixedData.rooms.length !== new Set(requestedAllocations.map(allocation => allocation.roomCategoryId)).size || mixedData.rooms.some(room => room.propertyId !== propertyId || !room.active))) {
      return res.status(422).json({ error: 'One or more selected room categories are unavailable for this property.', code: 'ROOM_CATEGORY_MISMATCH' });
    }
    const calculationRates = mixedData ? mixedData.rates.filter(rate => rate.status === 'ACTIVE') : activeRates;
    const stay = Array.isArray(roomAllocations)
      ? calculateMixedAllocatedStayTotal(mixedData!.rooms, calculationRates, propertyId, checkInDate, Number(nights), requestedAllocations, authoritativeParty, mealPlan, packageRate)
      : calculateStayTotal(data.room, selectedRate ? [selectedRate] : activeRates, propertyId, checkInDate, nights, adults, children, childrenWithBed, childrenWithoutBed, mealPlan);
    const applied = stay.ratePeriodId ? calculationRates.find((rate) => rate.id === stay.ratePeriodId) || null : null;
    const supplier = await inventoryManagementService.supplierSnapshot(data.property.supplierId);
    const full = buildRoleGatedResult(stay, applied, null, data.property.name, data.room.name, 'Admin');
    const rateOptions = validRates.map((rate) => {
      const optionStay = Array.isArray(roomAllocations)
        ? calculateMixedAllocatedStayTotal(mixedData!.rooms, calculationRates, propertyId, checkInDate, Number(nights), requestedAllocations.map((allocation, index) => index === 0 ? { ...allocation, rateId: rate.id } : allocation), authoritativeParty, mealPlan)
        : calculateStayTotal(data.room!, [rate], propertyId, checkInDate, nights, adults, children, childrenWithBed, childrenWithoutBed, mealPlan);
      return {
        id: rate.id,
        label: `${rate.contractType} · ${rate.validFrom.slice(0, 10)} to ${rate.validTo ? rate.validTo.slice(0, 10) : 'open ended'}`,
        validFrom: rate.validFrom.slice(0, 10),
        validTo: rate.validTo ? rate.validTo.slice(0, 10) : null,
        mealPlan: rate.mealPlan,
        totalSupplierCost: optionStay.totalAmount,
      };
    });
    return res.json({ success: true, data: projectSupplierCalculation({
      ...full,
      rateId: applied?.id,
      rateOptions,
      supplierId: data.property.supplierId,
      supplierName: supplier?.name,
    }, req.user!.role, resourceAuthorization) });
  } catch (error) {
    if (error instanceof ResourceAuthorizationError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
    return errorResponse(error, res, 'POST /accommodation/calculate-rate');
  }
});

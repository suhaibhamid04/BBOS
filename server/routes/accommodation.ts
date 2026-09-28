import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import { calculateStayTotal, buildRoleGatedResult } from '../../src/services/accommodationEngine.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';
import {
  inventoryManagementService,
  InventoryManagementError,
  type InventoryActor,
} from '../services/inventoryManagementService.js';

export const accommodationRouter = Router();
const readRoles = ['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations', 'Operations'] as const;
const rateRoles = ['Founder', 'Admin', 'Accounts', 'Reservations'] as const;
const manageRoles = ['Founder', 'Admin'] as const;

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
    const { propertyId, roomCategoryId, checkInDate, nights, mealPlan, adults, children, childrenWithBed, childrenWithoutBed } = req.body;
    if (!propertyId || !roomCategoryId || !checkInDate || !mealPlan) return res.status(400).json({ error: 'Required accommodation calculation fields are missing.' });
    const data = await inventoryManagementService.accommodationCalculationData(propertyId, roomCategoryId);
    if (!data.property || !data.room || data.room.propertyId !== propertyId) return res.status(404).json({ error: 'Property or room category not found.' });
    if (data.property.status !== 'ACTIVE' || !data.room.active) return res.status(409).json({ error: 'The selected property or room category is inactive.' });
    const activeRates = data.rates.filter((rate) => rate.status === 'ACTIVE');
    const stay = calculateStayTotal(data.room, activeRates, propertyId, checkInDate, nights, adults, children, childrenWithBed, childrenWithoutBed, mealPlan);
    const applied = stay.ratePeriodId ? activeRates.find((rate) => rate.id === stay.ratePeriodId) || null : null;
    const supplier = await inventoryManagementService.supplierSnapshot(data.property.supplierId);
    const full = buildRoleGatedResult(stay, applied, null, data.property.name, data.room.name, 'Admin');
    return res.json({ success: true, data: sanitizeFinancialData({
      ...full,
      rateId: applied?.id,
      supplierId: data.property.supplierId,
      supplierName: supplier?.name,
    }, req.user!.role) });
  } catch (error) { return errorResponse(error, res, 'POST /accommodation/calculate-rate'); }
});

import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  SupplierPayableError,
  SupplierPayableService,
  type SupplierPaymentActor,
} from '../services/supplierPayableService.js';
import { APP_CONFIG } from '../../src/config.js';
import { demoSupplierPayableStorage } from '../services/demoBookingWorkflow.js';

export const supplierPayablesRouter = Router();
const service = new SupplierPayableService(APP_CONFIG.DEMO_MODE ? demoSupplierPayableStorage : undefined);
const readRoles = ['Founder', 'Admin', 'Accounts', 'Reservations', 'Operations'] as const;
const paymentRoles = ['Founder', 'Admin', 'Accounts'] as const;

function actorFromRequest(req: Request): SupplierPaymentActor {
  const actor = req.user!;
  return {
    firebaseUid: actor.firebaseUid,
    employeeId: actor.employeeId,
    role: actor.role,
    active: actor.active,
    name: actor.name,
    ...(actor.salesTeamId ? { salesTeamId: actor.salesTeamId } : {}),
    ...(actor.managerEmployeeId ? { managerEmployeeId: actor.managerEmployeeId } : {}),
    ...(actor.department ? { department: actor.department } : {}),
  };
}

function handleError(error: unknown, res: Response, context: string) {
  if (error instanceof SupplierPayableError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details ? { details: error.details } : {}),
    });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Internal Server Error', code: 'SUPPLIER_PAYABLE_FAILED' });
}

supplierPayablesRouter.get('/', requireRole([...readRoles]), async (req, res) => {
  try {
    const result = await service.listPayables(actorFromRequest(req));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(error, res, 'GET /supplier-payables');
  }
});

supplierPayablesRouter.get('/bookings/:bookingId', requireRole([...readRoles]), async (req, res) => {
  try {
    const result = await service.getBookingSettlement(req.params.bookingId, actorFromRequest(req));
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return handleError(error, res, 'GET /supplier-payables/bookings/:bookingId');
  }
});

supplierPayablesRouter.get('/bookings/:bookingId/:obligationId', requireRole([...readRoles]), async (req, res) => {
  try {
    const result = await service.getPayable(
      req.params.bookingId,
      req.params.obligationId,
      actorFromRequest(req),
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return handleError(error, res, 'GET /supplier-payables/bookings/:bookingId/:obligationId');
  }
});

supplierPayablesRouter.post(
  '/bookings/:bookingId/:obligationId/payments',
  requireRole([...paymentRoles]),
  async (req: Request, res: Response) => {
    try {
      const result = await service.recordPayment(
        req.params.bookingId,
        req.params.obligationId,
        req.body,
        actorFromRequest(req),
      );
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      return handleError(error, res, 'POST /supplier-payables/.../payments');
    }
  },
);

supplierPayablesRouter.post(
  '/bookings/:bookingId/:obligationId/payments/:paymentId/verify',
  requireRole([...paymentRoles]),
  async (req: Request, res: Response) => {
    try {
      const result = await service.verifyPayment(
        req.params.bookingId,
        req.params.obligationId,
        req.params.paymentId,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return handleError(error, res, 'POST /supplier-payables/.../verify');
    }
  },
);

supplierPayablesRouter.post(
  '/bookings/:bookingId/:obligationId/payments/:paymentId/reject',
  requireRole([...paymentRoles]),
  async (req: Request, res: Response) => {
    try {
      const result = await service.rejectPayment(
        req.params.bookingId,
        req.params.obligationId,
        req.params.paymentId,
        req.body?.rejectionReason,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return handleError(error, res, 'POST /supplier-payables/.../reject');
    }
  },
);

supplierPayablesRouter.post(
  '/bookings/:bookingId/:obligationId/payments/:paymentId/void',
  requireRole(['Founder', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const result = await service.voidPayment(
        req.params.bookingId,
        req.params.obligationId,
        req.params.paymentId,
        req.body?.voidReason,
        actorFromRequest(req),
      );
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      return handleError(error, res, 'POST /supplier-payables/.../void');
    }
  },
);

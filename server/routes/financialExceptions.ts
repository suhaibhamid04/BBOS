import { Router, type Request, type Response } from 'express';
import { APP_CONFIG } from '../../src/config.js';
import { requireRole } from '../middleware/auth.js';
import { demoFinancialExceptionStorage } from '../services/demoBookingWorkflow.js';
import {
  FinancialExceptionError,
  FinancialExceptionService,
  type FinancialExceptionActor,
} from '../services/financialExceptionService.js';

export const financialExceptionsRouter = Router();
const service = new FinancialExceptionService(APP_CONFIG.DEMO_MODE ? demoFinancialExceptionStorage : undefined);

function actor(req: Request): FinancialExceptionActor {
  const user = req.user!;
  return {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    active: user.active,
    ...(user.salesTeamId ? { salesTeamId: user.salesTeamId } : {}),
  };
}

function failed(error: unknown, res: Response, context: string) {
  if (error instanceof FinancialExceptionError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Financial exception workflow failed.' });
}

financialExceptionsRouter.get(
  '/bookings/:bookingId',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Reservations']),
  async (req, res) => {
    try { return res.json({ success: true, data: await service.getBookingOverview(req.params.bookingId, actor(req)) }); }
    catch (error) { return failed(error, res, 'GET /financial-exceptions/bookings/:bookingId'); }
  },
);

financialExceptionsRouter.post(
  '/bookings/:bookingId/amendments',
  requireRole(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']),
  async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.proposeAmendment(req.params.bookingId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/bookings/:bookingId/amendments'); }
  },
);

financialExceptionsRouter.post(
  '/amendments/:amendmentId/decision',
  requireRole(['Founder', 'Admin', 'Sales Manager']),
  async (req, res) => {
    try {
      const decision = req.body?.decision;
      if (!['APPROVED', 'REJECTED'].includes(decision)) throw new FinancialExceptionError(400, 'INVALID_AMENDMENT_DECISION', 'decision must be APPROVED or REJECTED.');
      return res.json({ success: true, data: await service.decideAmendment(req.params.amendmentId, decision, req.body?.decisionNote ?? req.body?.rejectionReason, actor(req)) });
    } catch (error) { return failed(error, res, 'POST /financial-exceptions/amendments/:amendmentId/decision'); }
  },
);

financialExceptionsRouter.post(
  '/amendments/:amendmentId/apply',
  requireRole(['Founder', 'Admin', 'Sales Manager']),
  async (req, res) => {
    try { return res.json({ success: true, data: await service.applyAmendment(req.params.amendmentId, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/amendments/:amendmentId/apply'); }
  },
);

financialExceptionsRouter.post(
  '/bookings/:bookingId/substitutions',
  requireRole(['Founder', 'Admin', 'Reservations']),
  async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.proposeSubstitution(req.params.bookingId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/bookings/:bookingId/substitutions'); }
  },
);

financialExceptionsRouter.post(
  '/substitutions/:substitutionId/decision',
  requireRole(['Founder', 'Admin']),
  async (req, res) => {
    try {
      const decision = req.body?.decision;
      if (!['APPROVED', 'REJECTED'].includes(decision)) throw new FinancialExceptionError(400, 'INVALID_SUBSTITUTION_DECISION', 'decision must be APPROVED or REJECTED.');
      return res.json({ success: true, data: await service.decideSubstitution(req.params.substitutionId, decision, req.body?.decisionNote ?? req.body?.rejectionReason, actor(req)) });
    } catch (error) { return failed(error, res, 'POST /financial-exceptions/substitutions/:substitutionId/decision'); }
  },
);

financialExceptionsRouter.post(
  '/substitutions/:substitutionId/apply',
  requireRole(['Founder', 'Admin', 'Reservations']),
  async (req, res) => {
    try { return res.json({ success: true, data: await service.applySubstitution(req.params.substitutionId, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/substitutions/:substitutionId/apply'); }
  },
);

financialExceptionsRouter.post(
  '/bookings/:bookingId/refunds/calculate',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.calculateRefund(req.params.bookingId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/bookings/:bookingId/refunds/calculate'); }
  },
);

financialExceptionsRouter.post(
  '/refunds/:refundId/submit',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req, res) => {
    try { return res.json({ success: true, data: await service.submitRefund(req.params.refundId, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/refunds/:refundId/submit'); }
  },
);

financialExceptionsRouter.post(
  '/refunds/:refundId/decision',
  requireRole(['Founder', 'Admin']),
  async (req, res) => {
    try {
      const decision = req.body?.decision;
      if (!['APPROVED', 'REJECTED'].includes(decision)) throw new FinancialExceptionError(400, 'INVALID_REFUND_DECISION', 'decision must be APPROVED or REJECTED.');
      return res.json({ success: true, data: await service.decideRefund(req.params.refundId, decision, req.body, actor(req)) });
    } catch (error) { return failed(error, res, 'POST /financial-exceptions/refunds/:refundId/decision'); }
  },
);

financialExceptionsRouter.post(
  '/refunds/:refundId/pay',
  requireRole(['Accounts']),
  async (req, res) => {
    try { return res.json({ success: true, data: await service.markRefundPaid(req.params.refundId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/refunds/:refundId/pay'); }
  },
);

financialExceptionsRouter.post(
  '/bookings/:bookingId/commissions/adjust',
  requireRole(['Founder', 'Admin']),
  async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.adjustCommission(req.params.bookingId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/bookings/:bookingId/commissions/adjust'); }
  },
);

financialExceptionsRouter.post(
  '/commissions/:employeeId/settlements',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.settleCommission(req.params.employeeId, req.body, actor(req)) }); }
    catch (error) { return failed(error, res, 'POST /financial-exceptions/commissions/:employeeId/settlements'); }
  },
);

import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  QuoteConversionService,
  ConversionError,
} from '../services/quoteConversionService.js';
import {
  PaymentService,
  PaymentError,
  PaymentActor,
} from '../services/paymentService.js';

export const bookingsRouter = Router();
const quoteConversionService = new QuoteConversionService();
const paymentService = new PaymentService();

/**
 * Helper to extract current authenticated actor
 */
function getActorFromRequest(req: Request): PaymentActor {
  const currentUser = req.user!;
  return {
    id: currentUser.id,
    uid: currentUser.uid,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    isDemo: currentUser.isDemo,
  };
}

/**
 * Helper to handle errors cleanly
 */
function handlePaymentError(error: any, res: Response, context: string) {
  if (error instanceof PaymentError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      details: error.details,
    });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({
    error: error.message || `Internal Server Error in ${context}`,
  });
}

/**
 * GET /api/bookings/:bookingId/financial-snapshot
 * Retrieves the restricted financial snapshot for a booking.
 * 
 * Authorized roles: Founder, Admin, Accounts ONLY.
 * Sales Executive, Marketing, and Operations are rejected with 403 Forbidden.
 */
bookingsRouter.get(
  '/:bookingId/financial-snapshot',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.bookingId;
      const actor = getActorFromRequest(req);
      const snapshot = await quoteConversionService.getBookingFinancialSnapshot(bookingId, actor);

      return res.status(200).json({
        success: true,
        data: snapshot,
      });
    } catch (error: any) {
      if (error instanceof ConversionError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
      }

      console.error('API Error in /bookings/:bookingId/financial-snapshot:', error);
      return res.status(500).json({
        error: error.message || 'Internal Server Error in financial snapshot retrieval',
      });
    }
  }
);

// =========================================================================
// PHASE 2B-5D: STAGE 5 PAYMENT PROCESSING ROUTES
// =========================================================================

/**
 * POST /api/bookings/:bookingId/payments
 * Record a new customer payment claim (status: 'RECORDED').
 * Does not alter booking payment aggregates.
 * Authorized roles: Founder, Admin, Accounts, Sales Manager, Sales Executive (assigned).
 */
bookingsRouter.post(
  '/:bookingId/payments',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.bookingId;
      const actor = getActorFromRequest(req);
      const payment = await paymentService.recordPayment(bookingId, req.body, actor);

      return res.status(201).json({
        success: true,
        data: payment,
        message: 'Payment recorded successfully.',
      });
    } catch (error: any) {
      return handlePaymentError(error, res, 'POST /bookings/:bookingId/payments');
    }
  }
);

/**
 * GET /api/bookings/:bookingId/payments
 * List all payments for an authorized booking.
 * Exposes zero supplier costs or profitability margins.
 * Authorized roles: Founder, Admin, Accounts, Sales Manager, Sales Executive (assigned), Operations (assigned).
 */
bookingsRouter.get(
  '/:bookingId/payments',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const bookingId = req.params.bookingId;
      const actor = getActorFromRequest(req);
      const payments = await paymentService.getPaymentsForBooking(bookingId, actor);

      return res.status(200).json({
        success: true,
        count: payments.length,
        data: payments,
      });
    } catch (error: any) {
      return handlePaymentError(error, res, 'GET /bookings/:bookingId/payments');
    }
  }
);

/**
 * POST /api/bookings/:bookingId/payments/:paymentId/verify
 * Authoritatively verifies a recorded payment (status: 'VERIFIED').
 * Recalculates booking aggregates (amountReceived, amountPending, paymentStatus).
 * Transitions booking commercial status from PENDING_PAYMENT to CONFIRMED.
 * Authorized roles: Founder, Admin, Accounts ONLY. Anti-self-verification enforced.
 */
bookingsRouter.post(
  '/:bookingId/payments/:paymentId/verify',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, paymentId } = req.params;
      const actor = getActorFromRequest(req);
      const result = await paymentService.verifyPayment(bookingId, paymentId, actor);

      return res.status(200).json(result);
    } catch (error: any) {
      return handlePaymentError(error, res, 'POST /bookings/:bookingId/payments/:paymentId/verify');
    }
  }
);

/**
 * POST /api/bookings/:bookingId/payments/:paymentId/reject
 * Rejects an unverified payment claim (status: 'REJECTED').
 * Requires a valid rejection reason. Excluded from aggregates.
 * Authorized roles: Founder, Admin, Accounts ONLY.
 */
bookingsRouter.post(
  '/:bookingId/payments/:paymentId/reject',
  requireRole(['Founder', 'Admin', 'Accounts']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, paymentId } = req.params;
      const actor = getActorFromRequest(req);
      const { rejectionReason } = req.body;
      const result = await paymentService.rejectPayment(bookingId, paymentId, rejectionReason, actor);

      return res.status(200).json(result);
    } catch (error: any) {
      return handlePaymentError(error, res, 'POST /bookings/:bookingId/payments/:paymentId/reject');
    }
  }
);

/**
 * POST /api/bookings/:bookingId/payments/:paymentId/void
 * Voids a verified payment (status: 'VOIDED').
 * Atomically recomputes and reduces booking payment aggregates.
 * Requires a valid void reason.
 * Authorized roles: Founder, Admin ONLY.
 */
bookingsRouter.post(
  '/:bookingId/payments/:paymentId/void',
  requireRole(['Founder', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, paymentId } = req.params;
      const actor = getActorFromRequest(req);
      const { voidReason } = req.body;
      const result = await paymentService.voidPayment(bookingId, paymentId, voidReason, actor);

      return res.status(200).json(result);
    } catch (error: any) {
      return handlePaymentError(error, res, 'POST /bookings/:bookingId/payments/:paymentId/void');
    }
  }
);

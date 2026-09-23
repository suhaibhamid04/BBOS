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
import {
  BookingQueryService,
  BookingQueryError,
} from '../../src/services/booking/bookingQueryService.js';
import {
  BookingLifecycleService,
  LifecycleError,
} from '../services/bookingLifecycleService.js';
import {
  ServiceConfirmationService,
  ConfirmationError,
} from '../services/serviceConfirmationService.js';
import {
  VoucherService,
  VoucherError,
} from '../services/voucherService.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';

export const bookingsRouter = Router();
const quoteConversionService = new QuoteConversionService();
const paymentService = new PaymentService();
const bookingQueryService = new BookingQueryService();
const bookingLifecycleService = new BookingLifecycleService();
const serviceConfirmationService = new ServiceConfirmationService();
const voucherService = new VoucherService();

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

function handleLifecycleError(error: any, res: Response, context: string) {
  if (error instanceof LifecycleError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  if (error instanceof ConfirmationError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  if (error instanceof VoucherError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: error.message || `Internal Server Error in ${context}` });
}

function handleBookingQueryError(error: any, res: Response, context: string) {
  if (error instanceof BookingQueryError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
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
        data: sanitizeFinancialData(snapshot, actor.role),
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
// PHASE 2B-6: STAGE 1 BOOKING MANAGEMENT ROUTES
// =========================================================================

/**
 * GET /api/bookings
 * Retrieves a paginated list of bookings authorized for the actor.
 * 
 * Authorized roles: Founder, Admin, Accounts, Sales Manager, Sales Executive, Operations
 */
bookingsRouter.get(
  '/',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const filter = {
        status: req.query.status as any,
        paymentStatus: req.query.paymentStatus as any,
        query: req.query.query as string,
        cursor: req.query.cursor as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      };

      const result = await bookingQueryService.listBookings(filter, actor);

      return res.status(200).json({
        success: true,
        ...sanitizeFinancialData(result, actor.role),
      });
    } catch (error: any) {
      return handleBookingQueryError(error, res, 'GET /bookings');
    }
  }
);

/**
 * GET /api/bookings/:bookingId
 * Retrieves detailed booking information including services and a sanitized payment summary.
 * 
 * Authorized roles: Founder, Admin, Accounts, Sales Manager, Sales Executive, Operations
 */
bookingsRouter.get(
  '/:bookingId',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive', 'Operations']),
  async (req: Request, res: Response) => {
    // Avoid conflicting with other specific routes by checking if bookingId is a known sub-route
    if (['financial-snapshot', 'payments'].includes(req.params.bookingId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    try {
      const bookingId = req.params.bookingId;
      const actor = getActorFromRequest(req);
      const result = await bookingQueryService.getBookingDetail(bookingId, actor);

      return res.status(200).json({
        success: true,
        data: sanitizeFinancialData(result, actor.role),
      });
    } catch (error: any) {
      return handleBookingQueryError(error, res, 'GET /bookings/:bookingId');
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

// =========================================================================
// PHASE 2B-6: STAGE 2 — BOOKING LIFECYCLE & SERVICE CONFIRMATION ROUTES
// =========================================================================

/**
 * POST /api/bookings/:bookingId/dispatch
 * Transitions booking.status from CONFIRMED → IN_OPERATIONS.
 * Manual operations dispatch action.
 *
 * Authorized roles: Operations, Admin, Founder
 */
bookingsRouter.post(
  '/:bookingId/dispatch',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const result = await bookingLifecycleService.dispatchToOperations(req.params.bookingId, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'POST /bookings/:bookingId/dispatch');
    }
  }
);

/**
 * POST /api/bookings/:bookingId/cancel
 * Cancels a booking. Requires a cancellationReason in the request body.
 *
 * Authorized roles: Admin, Founder
 */
bookingsRouter.post(
  '/:bookingId/cancel',
  requireRole(['Founder', 'Admin']),
  async (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const { cancellationReason } = req.body;
      const result = await bookingLifecycleService.cancelBooking(req.params.bookingId, { cancellationReason }, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'POST /bookings/:bookingId/cancel');
    }
  }
);

/**
 * PATCH /api/bookings/:bookingId/services/accommodations/:serviceId
 * Updates operational fields on a BookingAccommodation (confirmation code, room numbers, etc.)
 * Recalculates booking.confirmationProgress atomically.
 *
 * Authorized roles: Operations, Admin, Founder
 */
bookingsRouter.patch(
  '/:bookingId/services/accommodations/:serviceId',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, serviceId } = req.params;
      const actor = getActorFromRequest(req);
      const result = await serviceConfirmationService.confirmAccommodation(bookingId, serviceId, req.body, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'PATCH /bookings/:bookingId/services/accommodations/:serviceId');
    }
  }
);

/**
 * PATCH /api/bookings/:bookingId/services/transports/:serviceId
 * Updates operational fields on a BookingTransport (driver details, vehicle reg, etc.)
 * Recalculates booking.confirmationProgress atomically.
 *
 * Authorized roles: Operations, Admin, Founder
 */
bookingsRouter.patch(
  '/:bookingId/services/transports/:serviceId',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, serviceId } = req.params;
      const actor = getActorFromRequest(req);
      const result = await serviceConfirmationService.confirmTransport(bookingId, serviceId, req.body, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'PATCH /bookings/:bookingId/services/transports/:serviceId');
    }
  }
);

/**
 * PATCH /api/bookings/:bookingId/services/activities/:serviceId
 * Updates operational fields on a BookingActivity (confirmation code, guide assignment, etc.)
 * Recalculates booking.confirmationProgress atomically.
 *
 * Authorized roles: Operations, Admin, Founder
 */
bookingsRouter.patch(
  '/:bookingId/services/activities/:serviceId',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const { bookingId, serviceId } = req.params;
      const actor = getActorFromRequest(req);
      const result = await serviceConfirmationService.confirmActivity(bookingId, serviceId, req.body, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'PATCH /bookings/:bookingId/services/activities/:serviceId');
    }
  }
);

/**
 * POST /api/bookings/:bookingId/vouchers/generate
 * Generates one Voucher record per service for a fully-confirmed booking.
 * Preconditions: booking.status === 'IN_OPERATIONS' AND confirmationProgress.allConfirmed === true
 * Idempotent: returns existing vouchers if already generated.
 *
 * Authorized roles: Operations, Admin, Founder
 */
bookingsRouter.post(
  '/:bookingId/vouchers/generate',
  requireRole(['Founder', 'Admin', 'Operations']),
  async (req: Request, res: Response) => {
    try {
      const actor = getActorFromRequest(req);
      const result = await voucherService.generateVouchers(req.params.bookingId, actor);
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      return handleLifecycleError(error, res, 'POST /bookings/:bookingId/vouchers/generate');
    }
  }
);


import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  QuoteConversionService,
  ConversionError,
} from '../services/quoteConversionService.js';

export const quotesRouter = Router();
const quoteConversionService = new QuoteConversionService();

/**
 * POST /api/quotes/:id/convert-to-booking
 * Converts an accepted/valid quote into an authoritative booking, modern service records,
 * and restricted financial snapshot atomically.
 * 
 * Authorized roles: Sales Executive, Sales Manager, Admin, Founder.
 * SECURITY: Client-supplied financial costs, margins, and rates are completely ignored.
 * The conversion response contains strictly commercial and operational fields (ZERO financial snapshot data).
 */
quotesRouter.post(
  '/:id/convert-to-booking',
  requireRole(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      const currentUser = req.user!;

      const actor = {
        id: currentUser.id,
        uid: currentUser.uid,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role,
        isDemo: currentUser.isDemo,
      };

      // Optional currentDate for testing or deterministic execution
      const { currentDate } = req.body || {};

      const result = await quoteConversionService.convertQuoteToBooking(quoteId, actor, {
        currentDate,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof ConversionError) {
        return res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
          details: error.details,
        });
      }

      console.error('API Error in /quotes/:id/convert-to-booking:', error);
      return res.status(500).json({
        error: error.message || 'Internal Server Error in quote conversion',
      });
    }
  }
);

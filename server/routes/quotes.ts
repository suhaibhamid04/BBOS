import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  QuoteConversionService,
  ConversionError,
} from '../services/quoteConversionService.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_QUOTES } from '../../src/services/demoData.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { quoteResourceContext } from '../authorization/resourceContext.js';
import { buildResourceDto } from '../authorization/resourceDto.js';

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

      return res.status(200).json(sanitizeFinancialData(result, actor.role));
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

quotesRouter.get('/', requireRole(['Founder', 'Admin', 'Accounts', 'Operations', 'Sales Manager', 'Sales Executive']), async (req: Request, res: Response) => {
  try {
    const { getAdminDb } = await import('../firebaseAdmin.js');
    const db = getAdminDb();
    const snapshot = await db.collection('quotes').get();
    const quotes = snapshot.docs.map(doc => {
      const data = doc.data();
      if ('totalCost' in data) {
        data.totalSupplierCost = data.totalCost;
        delete data.totalCost;
      }
      return { id: doc.id, ...data };
    });

    res.json({
      success: true,
      data: sanitizeFinancialData(quotes, req.user!.role)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch quotes' });
  }
});

/** Stage C proof path: resource authorization precedes financial projection. */
quotesRouter.get(
  '/:id',
  requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const quoteId = req.params.id;
      let quote: Record<string, any> | undefined;

      if (APP_CONFIG.DEMO_MODE) {
        quote = DEMO_QUOTES.find(candidate => candidate.id === quoteId) as unknown as Record<string, any> | undefined;
      } else {
        const snapshot = await getAdminDb().collection('quotes').doc(quoteId).get();
        if (snapshot.exists) quote = { ...snapshot.data(), id: snapshot.id };
      }

      if (!quote) return res.status(404).json({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });

      const normalizedQuote = { ...quote };
      if ('totalCost' in normalizedQuote && normalizedQuote.totalSupplierCost === undefined) {
        normalizedQuote.totalSupplierCost = normalizedQuote.totalCost;
        delete normalizedQuote.totalCost;
      }

      const principal = req.user!;
      const authorization = assertAuthorizedResource(
        principal,
        'QUOTE',
        'READ_DETAIL',
        quoteResourceContext(normalizedQuote),
      );

      return res.status(200).json({
        success: true,
        data: buildResourceDto(principal, 'QUOTE', normalizedQuote, authorization),
      });
    } catch (error) {
      if (error instanceof ResourceAuthorizationError) {
        return res.status(error.statusCode).json({ error: error.message, code: error.code });
      }
      console.error('API Error in GET /quotes/:id:', error);
      return res.status(500).json({ error: 'Failed to fetch quote' });
    }
  },
);

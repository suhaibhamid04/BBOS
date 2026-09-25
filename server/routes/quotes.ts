import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  QuoteConversionService,
  ConversionError,
} from '../services/quoteConversionService.js';
import { APP_CONFIG } from '../../src/config.js';
import { DEMO_QUOTES } from '../../src/services/demoData.js';
import { getAdminDb } from '../firebaseAdmin.js';
import { assertAuthorizedResource, ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { quoteResourceContext } from '../authorization/resourceContext.js';
import { authorizeResource, resolveQueryScope } from '../authorization/policyEngine.js';
import { buildQuoteConversionDto, buildQuoteDto } from '../authorization/quoteDto.js';
import {
  applyFirestoreQueryScope,
  assertRawListScope,
  assertReturnedRecordsAuthorized,
  parseScopedListOptions,
  scopeInMemoryRecords,
  ScopedListError,
} from '../authorization/scopedList.js';
import { FirestoreInventoryDataProvider } from '../services/firestoreInventoryProvider.js';
import { QuoteDomainError, QuoteService } from '../services/quoteService.js';

export const quotesRouter = Router();
const quoteConversionService = new QuoteConversionService(undefined, new FirestoreInventoryDataProvider());
const quoteService = new QuoteService();

function actorFromRequest(req: Request) {
  const currentUser = req.user!;
  return {
    id: currentUser.id,
    uid: currentUser.uid,
    firebaseUid: currentUser.firebaseUid,
    employeeId: currentUser.employeeId,
    name: currentUser.name,
    email: currentUser.email,
    role: currentUser.role,
    active: currentUser.active,
    salesTeamId: currentUser.salesTeamId,
    isDemo: currentUser.isDemo,
  };
}

function sendQuoteError(res: Response, error: unknown, operation: string) {
  if (error instanceof QuoteDomainError || error instanceof ConversionError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  if (error instanceof ResourceAuthorizationError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  console.error(`API Error in ${operation}:`, error);
  return res.status(500).json({ error: `Failed to ${operation}` });
}

quotesRouter.post(
  '/',
  requireRole(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const quote = await quoteService.createQuote(req.body, actor);
      const authorization = assertAuthorizedResource(
        actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(quote),
      );
      return res.status(201).json({ success: true, data: buildQuoteDto(quote, authorization) });
    } catch (error) {
      return sendQuoteError(res, error, 'create Quote');
    }
  },
);

quotesRouter.patch(
  '/:id',
  requireRole(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const actor = actorFromRequest(req);
      const quote = await quoteService.updateQuote(req.params.id, req.body, actor);
      const authorization = assertAuthorizedResource(
        actor, 'QUOTE', 'READ_DETAIL', quoteResourceContext(quote),
      );
      return res.status(200).json({ success: true, data: buildQuoteDto(quote, authorization) });
    } catch (error) {
      return sendQuoteError(res, error, 'update Quote');
    }
  },
);

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
      const actor = actorFromRequest(req);

      // Production time is server-owned. Tests call the service directly when
      // they need a deterministic date; an API caller cannot bypass expiry.
      const result = await quoteConversionService.convertQuoteToBooking(quoteId, actor);

      return res.status(200).json(buildQuoteConversionDto(result));
    } catch (error) {
      return sendQuoteError(res, error, '/quotes/:id/convert-to-booking');
    }
  }
);

quotesRouter.get('/', requireRole(['Founder', 'Admin', 'Accounts', 'Sales Manager', 'Sales Executive']), async (req: Request, res: Response) => {
  try {
    const principal = req.user!;
    const descriptor = assertRawListScope(resolveQueryScope(principal, 'QUOTE', 'READ_DETAIL'));
    const options = parseScopedListOptions(req.query as Record<string, unknown>);
    let quotes: Record<string, any>[];

    if (APP_CONFIG.DEMO_MODE) {
      const scoped = scopeInMemoryRecords<(typeof DEMO_QUOTES)[number]>(
        principal, 'QUOTE', 'READ_DETAIL', DEMO_QUOTES, quoteResourceContext,
      );
      const cursorIndex = options.cursor ? scoped.findIndex(quote => quote.id === options.cursor) : -1;
      if (options.cursor && cursorIndex < 0) {
        throw new ScopedListError(400, 'INVALID_CURSOR', 'The quote cursor is invalid for this scope.');
      }
      const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      quotes = scoped.slice(start, start + options.limit + 1) as unknown as Record<string, any>[];
    } else {
      const db = getAdminDb();
      let query: any = applyFirestoreQueryScope(db.collection('quotes') as any, descriptor)
        .orderBy('createdAt', 'desc');

      if (options.cursor) {
        const cursorSnapshot = await db.collection('quotes').doc(options.cursor).get();
        if (!cursorSnapshot.exists) {
          throw new ScopedListError(400, 'INVALID_CURSOR', 'The quote cursor is invalid.');
        }
        const cursorRecord = { ...cursorSnapshot.data(), id: cursorSnapshot.id };
        assertAuthorizedResource(principal, 'QUOTE', 'READ_DETAIL', quoteResourceContext(cursorRecord));
        query = query.startAfter(cursorSnapshot);
      }

      const snapshot = await query.limit(options.limit + 1).get();
      quotes = snapshot.docs.map((doc: any) => ({ ...doc.data(), id: doc.id }));
      assertReturnedRecordsAuthorized(principal, 'QUOTE', 'READ_DETAIL', quotes, quoteResourceContext);
    }

    const hasMore = quotes.length > options.limit;
    const page = hasMore ? quotes.slice(0, options.limit) : quotes;
    const data = page.map(quote => {
      const normalized = { ...quote };
      if ('totalCost' in normalized && normalized.totalSupplierCost === undefined) {
        normalized.totalSupplierCost = normalized.totalCost;
        delete normalized.totalCost;
      }
      const authorization = authorizeResource(principal, 'QUOTE', 'READ_DETAIL', quoteResourceContext(normalized));
      return buildQuoteDto(normalized, authorization);
    });

    return res.json({
      success: true,
      data,
      nextCursor: hasMore && page.length ? page[page.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    if (error instanceof ResourceAuthorizationError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    if (error instanceof ScopedListError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('API Error in GET /quotes:', error);
    return res.status(500).json({ error: 'Failed to fetch quotes' });
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
        data: buildQuoteDto(normalizedQuote, authorization),
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

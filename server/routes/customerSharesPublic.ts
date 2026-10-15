import { Router, type Request, type Response } from 'express';
import { QuoteDomainError, QuoteService } from '../services/quoteService.js';

export const customerSharesPublicRouter = Router();
const quoteService = new QuoteService();

function securePublicResponse(res: Response): void {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
}

customerSharesPublicRouter.get('/:token', async (req: Request, res: Response) => {
  securePublicResponse(res);
  try {
    const data = await quoteService.openCustomerShare(req.params.token);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof QuoteDomainError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('Public customer share request failed without token context:', error);
    return res.status(500).json({ error: 'This package link is temporarily unavailable.', code: 'CUSTOMER_SHARE_UNAVAILABLE' });
  }
});

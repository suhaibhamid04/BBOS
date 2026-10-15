import { Router, type Request, type Response } from 'express';
import {
  WhatsAppMessagingError,
  verifyMetaWebhookSignature,
} from '../services/whatsappMessagingService.js';
import {
  metaWhatsAppConfig,
  metaWhatsAppProvider,
  productionWhatsAppMessaging,
} from '../services/whatsappRuntime.js';

export const metaWhatsAppWebhookRouter = Router();

metaWhatsAppWebhookRouter.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!metaWhatsAppConfig.webhookVerifyToken) {
    return res.status(503).json({ error: 'Meta WhatsApp webhook verification is not configured.', code: 'META_WHATSAPP_NOT_CONFIGURED' });
  }
  if (mode !== 'subscribe' || token !== metaWhatsAppConfig.webhookVerifyToken || typeof challenge !== 'string') {
    return res.status(403).json({ error: 'Meta webhook verification failed.', code: 'META_WEBHOOK_VERIFICATION_FAILED' });
  }
  return res.status(200).type('text/plain').send(challenge);
});
metaWhatsAppWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyMetaWebhookSignature(rawBody, req.headers['x-hub-signature-256'], metaWhatsAppConfig.appSecret)) {
      return res.status(401).json({ error: 'Meta webhook signature is invalid.', code: 'META_WEBHOOK_SIGNATURE_INVALID' });
    }
    const events = metaWhatsAppProvider.normalizeWebhook(req.body);
    const result = await productionWhatsAppMessaging.ingest(events);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof WhatsAppMessagingError) {
      return res.status(error.statusCode).json({ error: error.message, code: error.code });
    }
    console.error('[META_WHATSAPP_WEBHOOK] ingestion failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(500).json({ error: 'WhatsApp webhook could not be processed.', code: 'META_WEBHOOK_FAILED' });
  }
});

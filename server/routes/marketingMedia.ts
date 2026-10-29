import { Router, raw, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { APP_CONFIG } from '../../src/config.js';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';
import { ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { requireRole } from '../middleware/auth.js';
import { MediaDomainError, type MediaActor } from '../marketing/mediaDomain.js';
import { LocalMediaObjectStorageAdapter } from '../marketing/mediaStorageAdapter.js';
import { MarketingMediaService } from '../services/marketingMediaService.js';

function actor(req: Request): MediaActor {
  const user = req.user!;
  return {
    employeeId: user.employeeId,
    name: user.name,
    role: user.role,
    active: user.active,
    department: user.role === 'Marketing' ? 'MARKETING' : undefined,
  };
}

function failure(error: unknown, res: Response, context: string) {
  if (error instanceof MediaDomainError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  if (error instanceof ResourceAuthorizationError) return res.status(error.statusCode).json({ error: error.message, code: error.code });
  console.error(`API Error in ${context}:`, error);
  return res.status(500).json({ error: 'Marketing media operation failed.', code: 'MEDIA_OPERATION_FAILED' });
}

function boundedRaw(types: string | string[], limit: string): RequestHandler {
  const parser = raw({ type: types, limit });
  return (req: Request, res: Response, next: NextFunction) => parser(req, res, error => {
    if (!error) return next();
    const status = (error as { type?: string }).type === 'entity.too.large' ? 413 : 400;
    return res.status(status).json({
      error: status === 413 ? 'Media payload exceeds the authorized limit.' : 'Media payload could not be read.',
      code: status === 413 ? 'MEDIA_PAYLOAD_TOO_LARGE' : 'MEDIA_PAYLOAD_INVALID',
    });
  });
}

const requestedStorageMode = process.env.BBOS_MEDIA_STORAGE_MODE?.trim().toLowerCase();
if (requestedStorageMode === 'local' && APP_CONFIG.ENVIRONMENT === 'production') {
  throw new Error('BBOS_MEDIA_STORAGE_MODE=local is forbidden in production. Configure an approved private object-storage adapter instead.');
}
const localStorageEnabled = APP_CONFIG.DEMO_MODE || requestedStorageMode === 'local';
const defaultService = localStorageEnabled
  ? new MarketingMediaService(new InMemoryConversionStorageProvider(), new LocalMediaObjectStorageAdapter(process.env.BBOS_MEDIA_LOCAL_ROOT || undefined))
  : new MarketingMediaService();

export function createMarketingMediaRouter(service: MarketingMediaService = defaultService): Router {
  const router = Router();
  router.use(requireRole(['Founder', 'Admin', 'Marketing']));

  router.get('/assets', async (req, res) => {
    try { return res.json({ success: true, data: await service.listAssets(actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/assets'); }
  });

  router.get('/library', async (req, res) => {
    try { return res.json({ success: true, data: await service.listAssetDetails(actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/library'); }
  });

  router.post('/assets', async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.createAsset(req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/assets'); }
  });

  router.get('/assets/:assetId', async (req, res) => {
    try { return res.json({ success: true, data: await service.getAsset(req.params.assetId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/assets/:assetId'); }
  });

  router.get('/assets/:assetId/detail', async (req, res) => {
    try { return res.json({ success: true, data: await service.getAssetDetail(req.params.assetId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/assets/:assetId/detail'); }
  });

  router.get('/assets/:assetId/preview', async (req, res) => {
    try {
      const preview = await service.readPreview(req.params.assetId, actor(req));
      res.setHeader('Content-Type', preview.contentType);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(preview.bytes);
    } catch (error) { return failure(error, res, 'GET /marketing/media/assets/:assetId/preview'); }
  });

  router.post('/assets/:assetId/preview', boundedRaw(['image/jpeg', 'image/png', 'image/webp'], '8mb'), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new MediaDomainError(400, 'MEDIA_PREVIEW_INVALID', 'Preview bytes are required.');
      return res.status(201).json({ success: true, data: await service.createPreview(req.params.assetId, req.get('content-type') || '', req.body, actor(req)) });
    } catch (error) { return failure(error, res, 'POST /marketing/media/assets/:assetId/preview'); }
  });

  router.patch('/assets/:assetId/metadata', async (req, res) => {
    try { return res.json({ success: true, data: await service.updateMetadata(req.params.assetId, req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'PATCH /marketing/media/assets/:assetId/metadata'); }
  });

  router.post('/assets/:assetId/upload-sessions', async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.createUploadSession(req.params.assetId, req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/assets/:assetId/upload-sessions'); }
  });

  router.get('/upload-sessions/:sessionId', async (req, res) => {
    try { return res.json({ success: true, data: await service.getUploadSession(req.params.sessionId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/upload-sessions/:sessionId'); }
  });

  router.put('/upload-sessions/:sessionId/chunks', boundedRaw('application/octet-stream', '1mb'), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) throw new MediaDomainError(400, 'MEDIA_UPLOAD_CHUNK_INVALID', 'Upload chunk bytes are required.');
      const offset = Number(req.get('x-upload-offset'));
      const session = await service.appendUploadChunk(req.params.sessionId, offset, req.body, actor(req));
      res.setHeader('X-Upload-Offset', String(session.uploadedBytes));
      return res.json({ success: true, data: session });
    } catch (error) { return failure(error, res, 'PUT /marketing/media/upload-sessions/:sessionId/chunks'); }
  });

  router.post('/upload-sessions/:sessionId/complete', async (req, res) => {
    try { return res.json({ success: true, data: await service.reconcileUpload(req.params.sessionId, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/upload-sessions/:sessionId/complete'); }
  });

  router.post('/upload-sessions/:sessionId/cancel', async (req, res) => {
    try { return res.json({ success: true, data: await service.cancelUploadSession(req.params.sessionId, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/upload-sessions/:sessionId/cancel'); }
  });

  router.post('/assets/:assetId/rights', async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.submitRights(req.params.assetId, req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/assets/:assetId/rights'); }
  });

  router.post('/rights/:rightsId/decision', requireRole(['Founder', 'Admin']), async (req, res) => {
    try { return res.json({ success: true, data: await service.decideRights(req.params.rightsId, req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/rights/:rightsId/decision'); }
  });

  router.post('/jobs', async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.submitJob(req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/jobs'); }
  });

  router.get('/jobs/:jobId', async (req, res) => {
    try { return res.json({ success: true, data: await service.getJob(req.params.jobId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/jobs/:jobId'); }
  });

  router.post('/jobs/:jobId/cancel', async (req, res) => {
    try { return res.json({ success: true, data: await service.cancelJob(req.params.jobId, req.body?.reason, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/jobs/:jobId/cancel'); }
  });

  router.get('/audit/:entityId', async (req, res) => {
    try { return res.json({ success: true, data: await service.listAuditEvents(req.params.entityId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/audit/:entityId'); }
  });

  return router;
}

export const marketingMediaRouter = createMarketingMediaRouter();

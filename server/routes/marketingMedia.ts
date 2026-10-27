import { Router, type Request, type Response } from 'express';
import { APP_CONFIG } from '../../src/config.js';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';
import { ResourceAuthorizationError } from '../authorization/assertAuthorizedResource.js';
import { requireRole } from '../middleware/auth.js';
import { MediaDomainError, type MediaActor } from '../marketing/mediaDomain.js';
import { FakeMediaObjectStorageAdapter } from '../marketing/mediaStorageAdapter.js';
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

const defaultService = APP_CONFIG.DEMO_MODE
  ? new MarketingMediaService(new InMemoryConversionStorageProvider(), new FakeMediaObjectStorageAdapter())
  : new MarketingMediaService();

export function createMarketingMediaRouter(service: MarketingMediaService = defaultService): Router {
  const router = Router();
  router.use(requireRole(['Founder', 'Admin', 'Marketing']));

  router.get('/assets', async (req, res) => {
    try { return res.json({ success: true, data: await service.listAssets(actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/assets'); }
  });

  router.post('/assets', async (req, res) => {
    try { return res.status(201).json({ success: true, data: await service.createAsset(req.body, actor(req)) }); }
    catch (error) { return failure(error, res, 'POST /marketing/media/assets'); }
  });

  router.get('/assets/:assetId', async (req, res) => {
    try { return res.json({ success: true, data: await service.getAsset(req.params.assetId, actor(req)) }); }
    catch (error) { return failure(error, res, 'GET /marketing/media/assets/:assetId'); }
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

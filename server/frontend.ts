import { Router, static as serveStatic } from 'express';
import path from 'node:path';

/** Only browser assets belong to the public web root. The build also puts
 * server.js and its source map in dist; neither is a public asset.
 */
export function productionFrontend(distPath: string): Router {
  const router = Router();
  router.use('/assets', serveStatic(path.join(distPath, 'assets'), { fallthrough: false }));
  router.get('*', (req, res) => {
    if (req.path !== '/index.html' && path.extname(req.path)) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
  return router;
}

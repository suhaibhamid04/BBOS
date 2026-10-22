import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/routes/api.js';
import { productionFrontend } from './server/frontend.js';
import { assertFirebaseAdminStartup, getFirebaseAdminTopology } from './server/firebaseAdmin.js';

async function startServer() {
  assertFirebaseAdminStartup();
  const firestoreTopology = getFirebaseAdminTopology();
  console.log('[Startup] Firestore target', {
    projectId: firestoreTopology.projectId,
    databaseId: firestoreTopology.databaseId,
    runtimeMode: firestoreTopology.runtimeMode,
    emulator: firestoreTopology.emulator,
  });
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  // Body parser for JSON
  app.use(express.json({
    limit: '10mb',
    verify: (req, _res, buffer) => {
      // Meta signs the exact request bytes. Keeping the raw buffer here avoids
      // re-serializing JSON and is never exposed to application clients.
      (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }));

  if (firestoreTopology.readOnlyDiagnostic) {
    app.use('/api', (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
      return res.status(403).json({
        error: 'This approved local production diagnostic session is read-only.',
        code: 'LOCAL_PRODUCTION_DIAGNOSTIC_READ_ONLY',
      });
    });
  }

  // Mount API routes FIRST
  app.use('/api', apiRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(productionFrontend(distPath));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Booking Bridge OS server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dir, '../..');

async function text(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

describe('staging deployment configuration', () => {
  test('routes API traffic to the staging Cloud Run service before the SPA fallback', async () => {
    const raw = await text('firebase.staging.json');
    const config = JSON.parse(raw) as {
      firestore: { database: string };
      hosting: {
        site: string;
        public: string;
        ignore: string[];
        rewrites: Array<Record<string, unknown>>;
      };
    };

    expect(config.firestore.database).toBe('(default)');
    expect(config.hosting.site).toBe('booking-bridge-bbos-stage');
    expect(config.hosting.public).toBe('dist');
    expect(config.hosting.rewrites[0]).toEqual({
      source: '/api/**',
      run: { serviceId: 'bbos-staging-backend', region: 'asia-south2' },
    });
    expect(config.hosting.rewrites.at(-1)).toEqual({ source: '**', destination: '/index.html' });
    expect(raw).not.toContain('booking-bridge-bbos-prod');
  });

  test('never publishes the backend bundle from the shared dist directory', async () => {
    const config = JSON.parse(await text('firebase.staging.json')) as {
      hosting: { ignore: string[] };
    };
    expect(config.hosting.ignore).toContain('server.js');
    expect(config.hosting.ignore).toContain('server.js.map');
  });

  test('builds an explicitly staging-only, non-root Bun runtime', async () => {
    const dockerfile = await text('Dockerfile');
    expect(dockerfile).toContain('FROM oven/bun:1.4.0-slim AS base');
    expect(dockerfile).toContain('bun install --frozen-lockfile --production');
    expect(dockerfile).toContain('test "$VITE_BBOS_ENVIRONMENT" = "staging"');
    expect(dockerfile).toContain('test "$VITE_FIREBASE_PROJECT_ID" = "booking-bridge-bbos-stage"');
    expect(dockerfile).toContain('test "$VITE_BBOS_FIRESTORE_DATABASE_ID" = "(default)"');
    expect(dockerfile).toContain('BBOS_DISABLE_VITE_ENV_FILES=true');
    expect(dockerfile).toContain('USER bun');
    expect(dockerfile).toContain('PORT=8080');
    expect(dockerfile).not.toContain('booking-bridge-bbos-prod');
    expect(dockerfile).not.toMatch(/COPY[^\n]*\.env/i);
    expect(dockerfile).not.toMatch(/COPY[^\n]*(credential|service-account|serviceaccount)/i);
  });

  test('uses an allowlisted Docker context and rejects local media storage in Cloud Run', async () => {
    const dockerignore = await text('.dockerignore');
    const mediaRoute = await text('server/routes/marketingMedia.ts');
    const activePatterns = dockerignore
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    expect(activePatterns[0]).toBe('*');
    expect(activePatterns).toContain('!.dockerignore');
    expect(activePatterns).toContain('!src/**');
    expect(activePatterns).toContain('.env.*');
    expect(activePatterns).toContain('*credentials*.json');
    expect(activePatterns).toContain('.git/**');
    expect(mediaRoute).toContain("process.env.NODE_ENV === 'production'");
    expect(mediaRoute).toContain("['staging', 'production'].includes(APP_CONFIG.ENVIRONMENT)");
  });

  test('keeps Cloud Build scoped to the staging Artifact Registry repository', async () => {
    const cloudbuild = await text('cloudbuild.staging.yaml');
    const expectedImage = 'asia-south2-docker.pkg.dev/booking-bridge-bbos-stage/bbos-staging-backend/bbos-api:${_IMAGE_TAG}';
    expect(cloudbuild.match(new RegExp(expectedImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(2);
    expect(cloudbuild).toContain('--build-arg=VITE_BBOS_ENVIRONMENT=staging');
    expect(cloudbuild).toContain('--build-arg=VITE_FIREBASE_PROJECT_ID=booking-bridge-bbos-stage');
    expect(cloudbuild).toContain('--build-arg=VITE_BBOS_FIRESTORE_DATABASE_ID=(default)');
    expect(cloudbuild).not.toContain('booking-bridge-bbos-prod');
    expect(cloudbuild).not.toMatch(/\.env|service.?account|private.?key/i);
  });
});

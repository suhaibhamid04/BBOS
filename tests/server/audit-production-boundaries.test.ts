import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { productionFrontend } from '../../server/frontend';
import { firestoreData } from '../../server/storage/firestoreData';

describe('production HTTP asset boundary', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let base: string;
  const directory = mkdtempSync(path.join(tmpdir(), 'bbos-public-'));
  beforeAll(() => {
    mkdirSync(path.join(directory, 'assets'));
    writeFileSync(path.join(directory, 'index.html'), '<h1>BBOS</h1>');
    writeFileSync(path.join(directory, 'assets', 'app.js'), 'window.bbos = true;');
    writeFileSync(path.join(directory, 'server.js'), 'private backend implementation');
    writeFileSync(path.join(directory, 'server.js.map'), 'private source map');
    const app = express();
    app.use(productionFrontend(directory));
    server = app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('bbos-public-')) {
      throw new Error('Refusing to remove a directory outside the test temp boundary.');
    }
    rmSync(directory, { recursive: true });
  });
  it('serves the SPA and customer links while denying server artifacts', async () => {
    for (const route of ['/', '/index.html', '/quote/share/secure-token']) {
      expect(await (await fetch(`${base}${route}`)).text()).toContain('<h1>BBOS</h1>');
    }
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toContain('window.bbos');
    for (const route of ['/server.js', '/server.js.map', '/%73erver.js', '/assets/../server.js']) {
      const response = await fetch(`${base}${route}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('private');
    }
  });
});

describe('actual Firestore SDK write validation without credentials or network', () => {
  const db = new Firestore({ projectId: 'bbos-audit-local' });
  it('rejects the previous optional-field shape and accepts the explicit storage projection', () => {
    const record = { amount: 100.25, notes: undefined, isDemo: undefined, items: [{ rateId: undefined, amount: 100.25 }] };
    expect(() => db.batch().set(db.doc('payments/example'), record)).toThrow('undefined');
    const projected = firestoreData(record);
    expect(() => db.batch().set(db.doc('payments/example'), projected)).not.toThrow();
    expect(projected).toEqual({ amount: 100.25, items: [{ amount: 100.25 }] });
    expect(Object.hasOwn(record, 'notes')).toBe(true);
  });
  it('preserves timestamps, sentinel values, null and invalid array positions', () => {
    const timestamp = Timestamp.now();
    const sentinel = FieldValue.serverTimestamp();
    const record = firestoreData({ timestamp, sentinel, nullable: null });
    expect(record.timestamp).toBe(timestamp);
    expect(record.sentinel).toBe(sentinel);
    expect(record.nullable).toBeNull();
    expect(() => db.batch().set(db.doc('records/example'), record)).not.toThrow();
    expect(() => db.batch().set(db.doc('records/example'), firestoreData({ values: [undefined] }))).toThrow();
  });
});

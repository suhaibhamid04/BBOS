import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import type { MediaActor } from '../../server/marketing/mediaDomain';
import { LocalMediaObjectStorageAdapter } from '../../server/marketing/mediaStorageAdapter';
import { MarketingMediaService } from '../../server/services/marketingMediaService';

const marketing: MediaActor = { employeeId: 'marketing-m1b', name: 'M1B Marketing', role: 'Marketing', active: true, department: 'MARKETING' };
const otherMarketing: MediaActor = { employeeId: 'marketing-other', name: 'Other Marketing', role: 'Marketing', active: true, department: 'MARKETING' };
const founder: MediaActor = { employeeId: 'founder-m1b', name: 'M1B Founder', role: 'Founder', active: true };
let png: Buffer;

function mp4Box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function syntheticMp4(): Buffer {
  const ftyp = mp4Box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.alloc(4), Buffer.from('isom')]));
  const mvhdPayload = Buffer.alloc(40);
  mvhdPayload.writeUInt32BE(1_000, 12);
  mvhdPayload.writeUInt32BE(2_000, 16);
  const tkhdPayload = Buffer.alloc(40);
  tkhdPayload.writeUInt32BE(320 * 65_536, 32);
  tkhdPayload.writeUInt32BE(240 * 65_536, 36);
  const moov = mp4Box('moov', Buffer.concat([mp4Box('mvhd', mvhdPayload), mp4Box('trak', mp4Box('tkhd', tkhdPayload))]));
  const mdat = mp4Box('mdat', Buffer.alloc(1_024, 7));
  return Buffer.concat([ftyp, moov, mdat]);
}

describe('Marketing media M1B local resumable workflow', () => {
  let root: string;
  let storage: LocalMediaObjectStorageAdapter;
  let service: MarketingMediaService;
  let sequence: number;

  beforeEach(async () => {
    png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#7056ee' } }).png().toBuffer();
    root = await mkdtemp(path.join(tmpdir(), 'bbos-m1b-test-'));
    storage = new LocalMediaObjectStorageAdapter(root);
    sequence = 0;
    service = new MarketingMediaService(
      new InMemoryConversionStorageProvider(),
      storage,
      () => new Date('2026-10-28T08:00:00.000Z'),
      () => `m1b-${++sequence}`,
    );
  });

  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('resumes a photo upload, reconciles SHA-256, and stores a private normalized thumbnail', async () => {
    const asset = await service.createAsset({ displayFilename: 'synthetic.png', category: 'IMAGE', declaredContentType: 'image/png', tags: ['synthetic'] }, marketing);
    const session = await service.createUploadSession(asset.id, { declaredContentType: 'image/png', declaredBytes: png.byteLength }, marketing);
    const midpoint = Math.floor(png.byteLength / 2);
    const paused = await service.appendUploadChunk(session.id, 0, png.subarray(0, midpoint), marketing);
    expect(paused).toMatchObject({ state: 'UPLOADING', uploadedBytes: midpoint });
    await expect(service.appendUploadChunk(session.id, 0, png.subarray(midpoint), marketing)).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_OFFSET_CONFLICT' });
    await expect(service.appendUploadChunk(session.id, midpoint, png.subarray(midpoint), otherMarketing)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
    await service.appendUploadChunk(session.id, midpoint, png.subarray(midpoint), marketing);

    const detail = await service.reconcileUpload(session.id, marketing);
    expect(detail.asset).toMatchObject({ lifecycleState: 'READY', validationStatus: 'VALID' });
    expect(detail.currentVersion?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(detail.derivedObjects.some(object => object.kind === 'THUMBNAIL')).toBe(true);
    expect(detail.jobs[0]).toMatchObject({ type: 'VALIDATE', state: 'SUCCEEDED' });
    const preview = await service.readPreview(asset.id, marketing);
    expect(preview.contentType).toBe('image/webp');
    expect(preview.bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(preview.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  }, 30_000);

  it('inspects MP4 structure in the isolated worker and accepts a normalized client-captured preview', async () => {
    const video = syntheticMp4();
    const asset = await service.createAsset({ displayFilename: 'synthetic.mp4', category: 'VIDEO', declaredContentType: 'video/mp4', tags: [] }, marketing);
    const session = await service.createUploadSession(asset.id, { declaredContentType: 'video/mp4', declaredBytes: video.byteLength }, marketing);
    await service.appendUploadChunk(session.id, 0, video, marketing);
    const detail = await service.reconcileUpload(session.id, marketing);
    expect(detail.currentVersion).toMatchObject({ detectedContainer: 'mp4', durationMs: 2_000, width: 320, height: 240 });

    await service.createPreview(asset.id, 'image/png', png, marketing);
    const preview = await service.readPreview(asset.id, marketing);
    expect(preview.contentType).toBe('image/webp');
    expect(preview.bytes.byteLength).toBeGreaterThan(0);
  }, 30_000);

  it('keeps invalid media unusable and records a failed processing job', async () => {
    const hostile = Buffer.from('not really a jpeg');
    const asset = await service.createAsset({ displayFilename: 'hostile.jpg', category: 'IMAGE', declaredContentType: 'image/jpeg', tags: [] }, marketing);
    const session = await service.createUploadSession(asset.id, { declaredContentType: 'image/jpeg', declaredBytes: hostile.byteLength }, marketing);
    await service.appendUploadChunk(session.id, 0, hostile, marketing);
    const detail = await service.reconcileUpload(session.id, marketing);
    expect(detail.asset).toMatchObject({ lifecycleState: 'REJECTED', validationStatus: 'INVALID' });
    expect(detail.asset.currentVersionId).toBeUndefined();
    expect(detail.currentVersion).toBeUndefined();
    expect(detail.jobs[0]).toMatchObject({ state: 'FAILED' });
    await expect(service.readPreview(asset.id, marketing)).rejects.toMatchObject({ code: 'MEDIA_PREVIEW_NOT_FOUND' });
  }, 30_000);

  it('cancels an authorized upload and refuses further chunks', async () => {
    const asset = await service.createAsset({ displayFilename: 'cancel.png', category: 'IMAGE', declaredContentType: 'image/png', tags: [] }, marketing);
    const session = await service.createUploadSession(asset.id, { declaredContentType: 'image/png', declaredBytes: png.byteLength }, marketing);
    await service.appendUploadChunk(session.id, 0, png.subarray(0, 10), marketing);
    expect((await service.cancelUploadSession(session.id, marketing)).state).toBe('CANCELLED');
    await expect(service.appendUploadChunk(session.id, 10, png.subarray(10), marketing)).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED' });
  });

  it('preserves a rejected rights submission as immutable review history', async () => {
    const asset = await service.createAsset({ displayFilename: 'rights.png', category: 'IMAGE', declaredContentType: 'image/png', tags: [] }, marketing);
    const submitted = await service.submitRights(asset.id, {
      sourceOrContributor: 'Synthetic contributor', ownershipBasis: 'CONTRIBUTOR_PERMISSION',
      subjectConsentRequired: false, subjectConsentConfirmed: false, influencerRestrictions: 'Organic only',
      permittedSocialChannels: ['Instagram'], permittedTerritories: ['India'],
      validFrom: '2026-10-28T00:00:00.000Z', validUntil: '2027-10-28T00:00:00.000Z',
      musicRights: 'NOT_APPLICABLE', commercialAdvertisingAllowed: false, evidenceReference: 'SYNTHETIC-EVIDENCE-REJECT',
    }, marketing);
    const rejected = await service.decideRights(submitted.id, { decision: 'REJECTED', reason: 'Evidence excludes commercial advertising.' }, founder);
    expect(rejected).toMatchObject({ status: 'REJECTED', verifiedByEmployeeId: founder.employeeId, revision: 2 });
    const detail = await service.getAssetDetail(asset.id, marketing);
    expect(detail.asset.rightsStatus).toBe('REJECTED');
    expect(detail.rightsHistory).toHaveLength(1);
    expect(detail.rightsHistory[0]).toEqual(rejected);
  });
});

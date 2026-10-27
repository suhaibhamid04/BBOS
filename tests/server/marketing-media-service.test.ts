import { beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider';
import { MediaDomainError, type MediaActor, type MediaWorkerActor } from '../../server/marketing/mediaDomain';
import { FakeMediaObjectStorageAdapter, UnavailableMediaObjectStorageAdapter } from '../../server/marketing/mediaStorageAdapter';
import { MARKETING_MEDIA_COLLECTIONS, MarketingMediaService } from '../../server/services/marketingMediaService';

const marketing: MediaActor = { employeeId: 'marketing-1', name: 'Marketing One', role: 'Marketing', active: true, department: 'MARKETING' };
const otherMarketing: MediaActor = { employeeId: 'marketing-2', name: 'Marketing Two', role: 'Marketing', active: true, department: 'MARKETING' };
const founder: MediaActor = { employeeId: 'founder-1', name: 'Founder', role: 'Founder', active: true };
const accounts: MediaActor = { employeeId: 'accounts-1', name: 'Accounts', role: 'Accounts', active: true };
const workerA: MediaWorkerActor = { service: 'MEDIA_WORKER', instanceId: 'worker-a' };
const workerB: MediaWorkerActor = { service: 'MEDIA_WORKER', instanceId: 'worker-b' };
const checksumA = 'a'.repeat(64);

describe('Marketing media M1A foundation', () => {
  let store: InMemoryConversionStorageProvider;
  let storage: FakeMediaObjectStorageAdapter;
  let service: MarketingMediaService;
  let nowMs: number;
  let sequence: number;

  beforeEach(() => {
    store = new InMemoryConversionStorageProvider();
    storage = new FakeMediaObjectStorageAdapter();
    nowMs = Date.parse('2026-10-26T10:00:00.000Z');
    sequence = 0;
    service = new MarketingMediaService(store, storage, () => new Date(nowMs), () => `test-${++sequence}`);
  });

  const createAsset = () => service.createAsset({
    displayFilename: 'synthetic-kashmir.mp4',
    category: 'VIDEO',
    declaredContentType: 'video/mp4',
    tags: ['synthetic', 'test'],
  }, marketing);

  async function createSession(assetId: string) {
    return service.createUploadSession(assetId, { declaredContentType: 'video/mp4', declaredBytes: 1_000_000 }, marketing);
  }

  async function validateAsset(assetId: string, sessionId: string, checksum = checksumA) {
    return service.recordAssetVersion(assetId, {
      sourceUploadSessionId: sessionId,
      checksumSha256: checksum,
      bytes: 1_000_000,
      detectedContentType: 'video/mp4',
      durationMs: 15_000,
      width: 1080,
      height: 1920,
      detectedContainer: 'mp4',
      detectedCodecs: ['h264', 'aac'],
      validationStatus: 'VALID',
      validationErrors: [],
    }, workerA);
  }

  const validRights = (validUntil = '2027-10-26T10:00:00.000Z') => ({
    sourceOrContributor: 'Booking Bridge synthetic fixture',
    ownershipBasis: 'BOOKING_BRIDGE_OWNED',
    subjectConsentRequired: false,
    subjectConsentConfirmed: false,
    influencerRestrictions: '',
    permittedSocialChannels: ['Instagram', 'Facebook'],
    permittedTerritories: ['India'],
    validFrom: '2026-10-26T09:00:00.000Z',
    validUntil,
    musicRights: 'NOT_APPLICABLE',
    commercialAdvertisingAllowed: true,
    evidenceReference: 'rights-evidence-synthetic-1',
  });

  it('derives owner, audit actor, lifecycle, and storage scope on the server', async () => {
    const asset = await createAsset();
    expect(asset).toMatchObject({ ownerEmployeeId: marketing.employeeId, lifecycleState: 'DRAFT', validationStatus: 'PENDING', rightsStatus: 'DRAFT' });
    expect(JSON.stringify(asset)).not.toContain('supplierCost');
    expect(JSON.stringify(asset)).not.toContain('grossProfit');
    expect(JSON.stringify(asset)).not.toContain('payment');

    const session = await createSession(asset.id);
    expect(session.storageObjectRef).toStartWith(`marketing/quarantine/${marketing.employeeId}/`);
    expect(session.storageObjectRef).not.toContain(asset.displayFilename);
    expect(session.uploadTarget).toStartWith('fake-upload://');
    expect(storage.uploadRequests).toHaveLength(1);

    const auditEvents = store.rawList(MARKETING_MEDIA_COLLECTIONS.audit);
    expect(auditEvents.map(event => event.action)).toEqual(['MEDIA_ASSET_CREATED', 'MEDIA_UPLOAD_SESSION_ISSUED']);
    expect(auditEvents[0].actorId).toBe(marketing.employeeId);
  });

  it('rejects client control of owner, role, storage, immutable version, validation, rights decision, audit actor, and job state', async () => {
    for (const forbidden of ['ownerEmployeeId', 'role', 'storageObjectRef', 'currentVersionId', 'validationStatus', 'rightsStatus', 'actorId', 'state']) {
      await expect(service.createAsset({
        displayFilename: 'fixture.mp4', category: 'VIDEO', declaredContentType: 'video/mp4', tags: [], [forbidden]: 'attacker-value',
      }, marketing)).rejects.toMatchObject({ code: 'FORBIDDEN_MEDIA_FIELD' });
    }
  });

  it('enforces active identity, Marketing ownership scope, and role denial', async () => {
    const asset = await createAsset();
    await expect(service.getAsset(asset.id, otherMarketing)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.getAsset(asset.id, accounts)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.createAsset({ displayFilename: 'x.jpg', category: 'IMAGE', declaredContentType: 'image/jpeg', tags: [] }, { ...marketing, active: false })).rejects.toMatchObject({ code: 'MEDIA_ACTOR_INVALID' });
    expect((await service.getAsset(asset.id, founder)).id).toBe(asset.id);
  });

  it('validates metadata and upload limits and never accepts client storage paths', async () => {
    await expect(service.createAsset({ displayFilename: 'x.exe', category: 'VIDEO', declaredContentType: 'application/octet-stream', tags: [] }, marketing)).rejects.toMatchObject({ code: 'MEDIA_TYPE_NOT_ALLOWED' });
    const asset = await createAsset();
    await expect(service.createUploadSession(asset.id, { declaredContentType: 'video/mp4', declaredBytes: 6 * 1024 * 1024 * 1024 }, marketing)).rejects.toMatchObject({ code: 'INVALID_MEDIA_INPUT' });
    await expect(service.createUploadSession(asset.id, { declaredContentType: 'video/mp4', declaredBytes: 100, storageObjectRef: 'attacker/path' }, marketing)).rejects.toMatchObject({ code: 'FORBIDDEN_MEDIA_FIELD' });
  });

  it('models upload expiry and blocks a worker from finalizing an expired session', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    nowMs += 60 * 60 * 1_000 + 1;
    expect((await service.getUploadSession(session.id, marketing)).state).toBe('EXPIRED');
    await expect(validateAsset(asset.id, session.id)).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_SESSION_EXPIRED' });
  });

  it('keeps original versions immutable and preserves source references', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    const version = await validateAsset(asset.id, session.id);
    expect(version).toMatchObject({ assetId: asset.id, sourceUploadSessionId: session.id, version: 1, validationStatus: 'VALID' });
    expect(version.storageObjectRef).toContain(`/originals/${asset.id}/${checksumA}/`);
    await expect(validateAsset(asset.id, session.id)).rejects.toMatchObject({ code: 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED' });
    await expect(service.updateMetadata(asset.id, { expectedRevision: 3, currentVersionId: 'attacker' }, marketing)).rejects.toMatchObject({ code: 'FORBIDDEN_MEDIA_FIELD' });
    expect(store.rawGet(MARKETING_MEDIA_COLLECTIONS.versions, version.id)).toEqual(version);
  });

  it('flags duplicate bytes without merging assets or rights', async () => {
    const first = await createAsset();
    const firstSession = await createSession(first.id);
    await validateAsset(first.id, firstSession.id);

    const second = await createAsset();
    const secondSession = await createSession(second.id);
    await validateAsset(second.id, secondSession.id, checksumA);
    const updatedSecond = await service.getAsset(second.id, marketing);
    expect(updatedSecond.duplicateOfAssetIds).toEqual([first.id]);
    expect(updatedSecond.id).not.toBe(first.id);
    expect(updatedSecond.currentRightsId).toBeUndefined();
  });

  it('requires complete consent and prevents Marketing from verifying its own rights', async () => {
    const asset = await createAsset();
    await expect(service.submitRights(asset.id, { ...validRights(), subjectConsentRequired: true, subjectConsentConfirmed: false }, marketing)).rejects.toMatchObject({ code: 'MEDIA_CONSENT_REQUIRED' });
    const rights = await service.submitRights(asset.id, validRights(), marketing);
    await expect(service.decideRights(rights.id, { decision: 'VERIFIED', reason: 'Evidence checked.' }, marketing)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
    const verified = await service.decideRights(rights.id, { decision: 'VERIFIED', reason: 'Synthetic evidence checked.' }, founder);
    expect(verified).toMatchObject({ status: 'VERIFIED', verifiedByEmployeeId: founder.employeeId });
  });

  it('blocks incomplete, expired, revoked, and out-of-scope commercial rights', async () => {
    const asset = await createAsset();
    const incomplete = await service.submitRights(asset.id, { ...validRights(), commercialAdvertisingAllowed: false }, marketing);
    await expect(service.decideRights(incomplete.id, { decision: 'VERIFIED', reason: 'Attempted verification.' }, founder)).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_NOT_ELIGIBLE' });

    const newRights = await service.submitRights(asset.id, validRights('2026-10-26T11:00:00.000Z'), marketing);
    await service.decideRights(newRights.id, { decision: 'VERIFIED', reason: 'Valid for test window.' }, founder);
    expect((await service.assertCommercialEligibility(asset.id, 'Instagram', 'India', marketing)).id).toBe(newRights.id);
    await expect(service.assertCommercialEligibility(asset.id, 'YouTube', 'India', marketing)).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_SCOPE_DENIED' });
    nowMs = Date.parse('2026-10-26T11:00:00.001Z');
    await expect(service.assertCommercialEligibility(asset.id, 'Instagram', 'India', marketing)).rejects.toMatchObject({ code: 'MEDIA_RIGHTS_REQUIRED' });
  });

  it('uses a disabled adapter outside isolated fake environments', async () => {
    const isolated = new MarketingMediaService(store, new UnavailableMediaObjectStorageAdapter(), () => new Date(nowMs), () => `disabled-${++sequence}`);
    const asset = await isolated.createAsset({ displayFilename: 'x.jpg', category: 'IMAGE', declaredContentType: 'image/jpeg', tags: [] }, marketing);
    await expect(isolated.createUploadSession(asset.id, { declaredContentType: 'image/jpeg', declaredBytes: 100 }, marketing)).rejects.toMatchObject({ code: 'MEDIA_STORAGE_NOT_CONFIGURED' });
  });

  it('submits processing jobs idempotently and rejects key reuse with different work', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    const input = { assetId: asset.id, type: 'VALIDATE', uploadSessionId: session.id, parameters: { profile: 'validation' }, idempotencyKey: 'validation-1' };
    const first = await service.submitJob(input, marketing);
    const replay = await service.submitJob(input, marketing);
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.job.id).toBe(first.job.id);
    await expect(service.submitJob({ ...input, parameters: { profile: 'different' } }, marketing)).rejects.toMatchObject({ code: 'MEDIA_JOB_IDEMPOTENCY_CONFLICT' });
    await expect(service.submitJob({ ...input, idempotencyKey: 'unsafe-url', parameters: { source: 'https://attacker.example/file' } }, marketing)).rejects.toMatchObject({ code: 'INVALID_JOB_PARAMETERS' });
  });

  it('leases, heartbeats, recovers expired leases, and rejects a stale worker', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    const { job } = await service.submitJob({ assetId: asset.id, type: 'VALIDATE', uploadSessionId: session.id, parameters: {}, idempotencyKey: 'lease-test' }, marketing);
    const leased = await service.leaseJob(job.id, workerA, 5_000);
    expect(leased).toMatchObject({ state: 'LEASED', leaseOwner: workerA.instanceId, attempt: 1 });
    const running = await service.heartbeatJob(job.id, workerA, 5_000);
    expect(running.state).toBe('RUNNING');
    await expect(service.leaseJob(job.id, workerB, 5_000)).rejects.toMatchObject({ code: 'MEDIA_JOB_ALREADY_LEASED' });
    nowMs += 5_001;
    const recovered = await service.leaseJob(job.id, workerB, 5_000);
    expect(recovered).toMatchObject({ state: 'LEASED', leaseOwner: workerB.instanceId, attempt: 2 });
    await expect(service.heartbeatJob(job.id, workerA, 5_000)).rejects.toMatchObject({ code: 'MEDIA_JOB_LEASE_MISMATCH' });
  });

  it('applies bounded retry classification and cancellation constraints', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    const { job } = await service.submitJob({ assetId: asset.id, type: 'VALIDATE', uploadSessionId: session.id, parameters: {}, idempotencyKey: 'retry-test' }, marketing);
    await service.leaseJob(job.id, workerA, 5_000);
    const retry = await service.failJob(job.id, { classification: 'TRANSIENT_INFRASTRUCTURE', code: 'WORKER_BUSY', safeMessage: 'Worker capacity was unavailable.', retryable: true, retryDelayMs: 1_000 }, workerA);
    expect(retry).toMatchObject({ state: 'RETRY_WAIT', failure: { retryable: true } });
    const cancelled = await service.cancelJob(job.id, 'No longer required.', marketing);
    expect(cancelled.state).toBe('CANCELLED');

    const { job: active } = await service.submitJob({ assetId: asset.id, type: 'VALIDATE', uploadSessionId: session.id, parameters: {}, idempotencyKey: 'active-test' }, marketing);
    await service.leaseJob(active.id, workerA, 5_000);
    await expect(service.cancelJob(active.id, 'Malicious cancellation.', marketing)).rejects.toMatchObject({ code: 'MEDIA_JOB_CANCELLATION_DENIED' });
  });

  it('keeps job and rights mutation unavailable to unrelated or inactive employees', async () => {
    const asset = await createAsset();
    const session = await createSession(asset.id);
    const { job } = await service.submitJob({ assetId: asset.id, type: 'VALIDATE', uploadSessionId: session.id, parameters: {}, idempotencyKey: 'scope-test' }, marketing);
    await expect(service.getJob(job.id, otherMarketing)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
    await expect(service.cancelJob(job.id, 'Attempt', { ...marketing, active: false })).rejects.toMatchObject({ code: 'MEDIA_ACTOR_INVALID' });
    await expect(service.submitRights(asset.id, validRights(), otherMarketing)).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
  });
});

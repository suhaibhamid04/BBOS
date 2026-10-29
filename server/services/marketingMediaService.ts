import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { ConversionStorageProvider, ConversionTransaction } from '../../src/services/conversion/conversionStorageProvider.js';
import { FirestoreConversionStorageProvider } from '../../src/services/conversion/conversionStorageProvider.js';
import { assertAuthorizedResource } from '../authorization/assertAuthorizedResource.js';
import { mediaAssetResourceContext } from '../authorization/resourceContext.js';
import {
  MEDIA_CATEGORIES,
  MEDIA_DERIVED_KINDS,
  MEDIA_ERROR_CLASSES,
  MEDIA_JOB_TYPES,
  MediaDomainError,
  asRecord,
  assertAllowedFields,
  booleanValue,
  enumValue,
  identifier,
  isoTimestamp,
  normalizedJobParameters,
  optionalText,
  positiveInteger,
  requiredText,
  requireActiveMediaActor,
  rightsAreCommerciallyEligible,
  uniqueStrings,
  type MediaActor,
  type MediaAsset,
  type MediaAssetVersion,
  type MediaAuditEvent,
  type MediaDerivedObject,
  type MediaErrorClass,
  type MediaJobFailure,
  type MediaProcessingJob,
  type MediaRightsRecord,
  type MediaUploadSession,
  type MediaWorkerActor,
} from '../marketing/mediaDomain.js';
import {
  UnavailableMediaObjectStorageAdapter,
  derivedObjectRef,
  isResumableStorageAdapter,
  originalObjectRef,
  type MediaObjectStorageAdapter,
} from '../marketing/mediaStorageAdapter.js';

type MediaMetadataStore = Pick<ConversionStorageProvider, 'runTransaction'>;
type Clock = () => Date;
type IdFactory = () => string;

export interface MediaAssetDetail {
  asset: MediaAsset;
  currentVersion?: MediaAssetVersion;
  currentRights?: MediaRightsRecord;
  rightsHistory: MediaRightsRecord[];
  derivedObjects: MediaDerivedObject[];
  jobs: MediaProcessingJob[];
}

interface MediaInspectionResult {
  detectedContentType: string;
  detectedContainer?: string;
  detectedCodecs: string[];
  durationMs?: number;
  width?: number;
  height?: number;
  thumbnail?: { path: string; contentType: 'image/webp'; bytes: number };
}

const COLLECTIONS = {
  assets: 'marketing_media_assets',
  versions: 'marketing_media_asset_versions',
  rights: 'marketing_media_rights',
  uploadSessions: 'marketing_media_upload_sessions',
  derived: 'marketing_media_derived_objects',
  jobs: 'marketing_media_jobs',
  audit: 'audit_logs',
} as const;

const CONTENT_TYPES: Record<(typeof MEDIA_CATEGORIES)[number], readonly string[]> = {
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm'],
  IMAGE: ['image/jpeg', 'image/png', 'image/webp'],
  AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm'],
};

const MAX_UPLOAD_BYTES: Record<(typeof MEDIA_CATEGORIES)[number], number> = {
  VIDEO: 512 * 1024 * 1024,
  IMAGE: 25 * 1024 * 1024,
  AUDIO: 100 * 1024 * 1024,
};

function clone<T>(value: T): T { return structuredClone(value); }

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function at(clock: Clock): string { return clock().toISOString(); }

async function checksumFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const input = createReadStream(filePath);
    input.on('data', chunk => hash.update(chunk));
    input.on('error', reject);
    input.on('end', resolve);
  });
  return hash.digest('hex');
}

async function inspectInIsolatedWorker(input: {
  mode: 'ORIGINAL' | 'PREVIEW';
  category: MediaAsset['category'];
  declaredContentType: string;
  sourcePath: string;
  outputPath?: string;
}): Promise<MediaInspectionResult> {
  const workerPath = path.resolve(process.cwd(), 'server/workers/mediaInspectionWorker.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new MediaDomainError(422, 'MEDIA_PROCESSING_TIMEOUT', 'Media inspection exceeded the 20 second safety limit.'));
    }, 20_000);
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
      if (stdout.length > 1_000_000) child.kill();
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
      if (stderr.length > 100_000) child.kill();
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      try {
        const payload = JSON.parse(stdout) as { ok: boolean; result?: MediaInspectionResult; error?: string };
        if (code !== 0 || !payload.ok || !payload.result) throw new Error(payload.error || stderr || 'Media inspection failed.');
        resolve(payload.result);
      } catch (error) {
        reject(new MediaDomainError(422, 'MEDIA_INSPECTION_FAILED', error instanceof Error ? error.message : 'Media inspection failed.'));
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function principal(actor: MediaActor) {
  return {
    employeeId: actor.employeeId,
    role: actor.role,
    active: actor.active,
    ...(actor.department ? { department: actor.department } : {}),
  };
}

function audit(
  id: string,
  action: string,
  entityType: MediaAuditEvent['entityType'],
  entityId: string,
  actor: MediaActor | MediaWorkerActor,
  timestamp: string,
  before: unknown,
  after: unknown,
  reason: string,
): MediaAuditEvent {
  const isWorker = 'service' in actor;
  return {
    id: `audit-media-${id}`,
    action,
    entityType,
    entityId,
    actorId: isWorker ? actor.instanceId : actor.employeeId,
    actorName: isWorker ? 'BBOS Media Worker' : actor.name,
    actorRole: isWorker ? actor.service : String(actor.role),
    before: before === undefined ? null : clone(before),
    after: after === undefined ? null : clone(after),
    reason,
    timestamp,
  };
}

function requireWorker(actor: MediaWorkerActor): void {
  if (!actor || actor.service !== 'MEDIA_WORKER' || !actor.instanceId || !/^[A-Za-z0-9._:-]{1,160}$/.test(actor.instanceId)) {
    throw new MediaDomainError(403, 'MEDIA_WORKER_INVALID', 'A valid media worker identity is required.');
  }
}

function authorize(actor: MediaActor, action: 'CREATE_MEDIA' | 'READ_MEDIA' | 'UPDATE_MEDIA_METADATA' | 'SUBMIT_MEDIA_RIGHTS' | 'VERIFY_MEDIA_RIGHTS' | 'CREATE_MEDIA_JOB' | 'READ_MEDIA_JOB', asset: Pick<MediaAsset, 'id' | 'ownerEmployeeId' | 'departmentId' | 'lifecycleState'>): void {
  requireActiveMediaActor(actor);
  assertAuthorizedResource(principal(actor), 'MEDIA_ASSET', action, mediaAssetResourceContext({
    id: asset.id,
    ownerEmployeeId: asset.ownerEmployeeId,
    departmentId: asset.departmentId,
    status: asset.lifecycleState,
  }));
}

function validateDeclaredContentType(category: MediaAsset['category'], value: unknown): string {
  const contentType = requiredText(value, 'declaredContentType', 120).toLowerCase();
  if (!CONTENT_TYPES[category].includes(contentType)) {
    throw new MediaDomainError(422, 'MEDIA_TYPE_NOT_ALLOWED', `The declared content type is not allowed for ${category.toLowerCase()} media.`);
  }
  return contentType;
}

function validateChecksum(value: unknown): string {
  const checksum = requiredText(value, 'checksumSha256', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new MediaDomainError(400, 'INVALID_CHECKSUM', 'checksumSha256 must be 64 hexadecimal characters.');
  return checksum;
}

function optionalPositiveInteger(value: unknown, field: string, max: number): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, field, max);
}

function assertWorkerOwnsActiveLease(job: MediaProcessingJob, worker: MediaWorkerActor, now: Date): void {
  if (!['LEASED', 'RUNNING'].includes(job.state) || job.leaseOwner !== worker.instanceId || !job.leaseExpiresAt) {
    throw new MediaDomainError(409, 'MEDIA_JOB_LEASE_MISMATCH', 'The worker does not own an active lease for this job.');
  }
  if (new Date(job.leaseExpiresAt).getTime() <= now.getTime()) {
    throw new MediaDomainError(409, 'MEDIA_JOB_LEASE_EXPIRED', 'The media job lease has expired.');
  }
}

export class MarketingMediaService {
  constructor(
    private readonly store: MediaMetadataStore = new FirestoreConversionStorageProvider(),
    private readonly objectStorage: MediaObjectStorageAdapter = new UnavailableMediaObjectStorageAdapter(),
    private readonly clock: Clock = () => new Date(),
    private readonly nextId: IdFactory = () => randomUUID(),
  ) {}

  async createAsset(rawInput: unknown, actor: MediaActor): Promise<MediaAsset> {
    requireActiveMediaActor(actor);
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['displayFilename', 'category', 'declaredContentType', 'tags']);
    const category = enumValue(input.category, MEDIA_CATEGORIES, 'category');
    const now = at(this.clock);
    const asset: MediaAsset = {
      id: `media-${this.nextId()}`,
      displayFilename: requiredText(input.displayFilename, 'displayFilename', 255),
      category,
      declaredContentType: validateDeclaredContentType(category, input.declaredContentType),
      tags: uniqueStrings(input.tags ?? [], 'tags', 30, 80),
      lifecycleState: 'DRAFT',
      validationStatus: 'PENDING',
      rightsStatus: 'DRAFT',
      ownerEmployeeId: actor.employeeId,
      assignedEmployeeIds: [],
      departmentId: 'MARKETING',
      duplicateOfAssetIds: [],
      revision: 1,
      createdAt: now,
      createdByEmployeeId: actor.employeeId,
      updatedAt: now,
      updatedByEmployeeId: actor.employeeId,
    };
    authorize(actor, 'CREATE_MEDIA', asset);
    return this.store.runTransaction(async tx => {
      tx.set(COLLECTIONS.assets, asset.id, asset);
      const event = audit(this.nextId(), 'MEDIA_ASSET_CREATED', 'MEDIA_ASSET', asset.id, actor, now, null, asset, 'Media metadata created; no binary was stored.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(asset);
    });
  }

  async getAsset(assetId: string, actor: MediaActor): Promise<MediaAsset> {
    const id = identifier(assetId, 'assetId');
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'READ_MEDIA', asset);
      return clone(asset);
    });
  }

  async listAssets(actor: MediaActor): Promise<MediaAsset[]> {
    requireActiveMediaActor(actor);
    return this.store.runTransaction(async tx => {
      const assets = await tx.list(COLLECTIONS.assets, 500) as MediaAsset[];
      if (['Founder', 'Admin'].includes(String(actor.role))) return assets.map(clone);
      if (actor.role !== 'Marketing') {
        authorize(actor, 'READ_MEDIA', { id: 'scope-check', ownerEmployeeId: actor.employeeId, departmentId: 'MARKETING', lifecycleState: 'DRAFT' });
      }
      return assets.filter(asset => asset.ownerEmployeeId === actor.employeeId).map(clone);
    });
  }

  async updateMetadata(assetId: string, rawInput: unknown, actor: MediaActor): Promise<MediaAsset> {
    const id = identifier(assetId, 'assetId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['displayFilename', 'tags', 'expectedRevision']);
    const expectedRevision = positiveInteger(input.expectedRevision, 'expectedRevision', Number.MAX_SAFE_INTEGER);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'UPDATE_MEDIA_METADATA', asset);
      if (asset.revision !== expectedRevision) throw new MediaDomainError(409, 'MEDIA_ASSET_VERSION_CONFLICT', 'Media metadata changed. Reload before saving.');
      if (['DELETED', 'DELETION_PENDING'].includes(asset.lifecycleState)) throw new MediaDomainError(409, 'MEDIA_ASSET_STATE_INVALID', 'Deleted media metadata cannot be edited.');
      const now = at(this.clock);
      const updated: MediaAsset = {
        ...asset,
        ...(input.displayFilename === undefined ? {} : { displayFilename: requiredText(input.displayFilename, 'displayFilename', 255) }),
        ...(input.tags === undefined ? {} : { tags: uniqueStrings(input.tags, 'tags', 30, 80) }),
        revision: asset.revision + 1,
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      };
      tx.update(COLLECTIONS.assets, id, updated);
      const event = audit(this.nextId(), 'MEDIA_METADATA_UPDATED', 'MEDIA_ASSET', id, actor, now, asset, updated, 'Editable media metadata updated.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(updated);
    });
  }

  async createUploadSession(assetId: string, rawInput: unknown, actor: MediaActor): Promise<MediaUploadSession> {
    const id = identifier(assetId, 'assetId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['declaredContentType', 'declaredBytes']);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'UPDATE_MEDIA_METADATA', asset);
      const contentType = validateDeclaredContentType(asset.category, input.declaredContentType);
      if (contentType !== asset.declaredContentType) throw new MediaDomainError(422, 'MEDIA_DECLARATION_MISMATCH', 'Upload content type does not match the media asset declaration.');
      const bytes = positiveInteger(input.declaredBytes, 'declaredBytes', MAX_UPLOAD_BYTES[asset.category]);
      const issued = this.clock();
      const sessionId = `media-upload-${this.nextId()}`;
      const expiresAt = new Date(issued.getTime() + 60 * 60 * 1_000).toISOString();
      const grant = await this.objectStorage.createScopedUpload({
        sessionId,
        assetId: asset.id,
        ownerEmployeeId: asset.ownerEmployeeId,
        category: asset.category,
        declaredContentType: contentType,
        declaredBytes: bytes,
        expiresAt,
      });
      const session: MediaUploadSession = {
        id: sessionId,
        assetId: asset.id,
        ownerEmployeeId: asset.ownerEmployeeId,
        declaredContentType: contentType,
        declaredBytes: bytes,
        storageObjectRef: grant.storageObjectRef,
        state: 'ISSUED',
        issuedAt: issued.toISOString(),
        expiresAt,
        issuedByEmployeeId: actor.employeeId,
        uploadTransport: grant.uploadTransport,
        uploadTarget: grant.uploadTarget,
        uploadedBytes: 0,
        chunkSizeBytes: 1024 * 1024,
      };
      const updated = { ...asset, lifecycleState: 'AWAITING_UPLOAD' as const, revision: asset.revision + 1, updatedAt: issued.toISOString(), updatedByEmployeeId: actor.employeeId };
      tx.set(COLLECTIONS.uploadSessions, session.id, session);
      tx.update(COLLECTIONS.assets, asset.id, updated);
      const event = audit(this.nextId(), 'MEDIA_UPLOAD_SESSION_ISSUED', 'MEDIA_UPLOAD_SESSION', session.id, actor, issued.toISOString(), null, { ...session, uploadTarget: '[REDACTED]' }, 'Scoped upload session issued by the configured storage adapter.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(session);
    });
  }

  async getUploadSession(sessionId: string, actor: MediaActor): Promise<MediaUploadSession> {
    const id = identifier(sessionId, 'sessionId');
    return this.store.runTransaction(async tx => {
      const session = await tx.get(COLLECTIONS.uploadSessions, id) as MediaUploadSession | null;
      if (!session) throw new MediaDomainError(404, 'MEDIA_UPLOAD_SESSION_NOT_FOUND', 'Upload session not found.');
      const asset = await tx.get(COLLECTIONS.assets, session.assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'READ_MEDIA', asset);
      const expired = new Date(session.expiresAt).getTime() <= this.clock().getTime();
      return clone(expired && !['COMPLETED', 'CANCELLED', 'FAILED'].includes(session.state) ? { ...session, state: 'EXPIRED' } : session);
    });
  }

  async getAssetDetail(assetId: string, actor: MediaActor): Promise<MediaAssetDetail> {
    const id = identifier(assetId, 'assetId');
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'READ_MEDIA', asset);
      const currentVersion = asset.currentVersionId
        ? await tx.get(COLLECTIONS.versions, asset.currentVersionId) as MediaAssetVersion | null
        : null;
      const currentRights = asset.currentRightsId
        ? await tx.get(COLLECTIONS.rights, asset.currentRightsId) as MediaRightsRecord | null
        : null;
      const derivedObjects = await tx.findByField(COLLECTIONS.derived, 'assetId', asset.id, 100) as MediaDerivedObject[];
      const rightsHistory = await tx.findByField(COLLECTIONS.rights, 'assetId', asset.id, 100) as MediaRightsRecord[];
      const jobs = (await tx.list(COLLECTIONS.jobs, 500) as MediaProcessingJob[]).filter(job => job.input.assetId === asset.id);
      return {
        asset: clone(asset),
        ...(currentVersion ? { currentVersion: clone(currentVersion) } : {}),
        ...(currentRights ? { currentRights: clone(currentRights) } : {}),
        rightsHistory: rightsHistory.sort((left, right) => right.submittedAt.localeCompare(left.submittedAt)).map(clone),
        derivedObjects: derivedObjects.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clone),
        jobs: jobs.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clone),
      };
    });
  }

  async listAssetDetails(actor: MediaActor): Promise<MediaAssetDetail[]> {
    const assets = await this.listAssets(actor);
    return Promise.all(assets.map(asset => this.getAssetDetail(asset.id, actor)));
  }

  async appendUploadChunk(sessionId: string, offset: number, chunk: Uint8Array, actor: MediaActor): Promise<MediaUploadSession> {
    if (!isResumableStorageAdapter(this.objectStorage)) throw new MediaDomainError(503, 'MEDIA_RESUMABLE_STORAGE_UNAVAILABLE', 'Resumable storage is unavailable.');
    const current = await this.getUploadSession(sessionId, actor);
    if (current.state === 'EXPIRED') throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_EXPIRED', 'The upload session expired.');
    if (!['ISSUED', 'UPLOADING'].includes(current.state)) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED', 'The upload session cannot accept more bytes.');
    const uploadedBytes = await this.objectStorage.appendChunk(current.storageObjectRef, offset, chunk, current.declaredBytes);
    return this.store.runTransaction(async tx => {
      const session = await tx.get(COLLECTIONS.uploadSessions, current.id) as MediaUploadSession | null;
      if (!session || !['ISSUED', 'UPLOADING'].includes(session.state)) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED', 'The upload session cannot accept more bytes.');
      const updated: MediaUploadSession = { ...session, state: 'UPLOADING', uploadedBytes };
      tx.update(COLLECTIONS.uploadSessions, session.id, updated);
      return clone(updated);
    });
  }

  async cancelUploadSession(sessionId: string, actor: MediaActor): Promise<MediaUploadSession> {
    const id = identifier(sessionId, 'sessionId');
    const result = await this.store.runTransaction(async tx => {
      const session = await tx.get(COLLECTIONS.uploadSessions, id) as MediaUploadSession | null;
      if (!session) throw new MediaDomainError(404, 'MEDIA_UPLOAD_SESSION_NOT_FOUND', 'Upload session not found.');
      const asset = await tx.get(COLLECTIONS.assets, session.assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'UPDATE_MEDIA_METADATA', asset);
      if (!['ISSUED', 'UPLOADING'].includes(session.state)) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED', 'The upload session cannot be cancelled.');
      const updated: MediaUploadSession = { ...session, state: 'CANCELLED' };
      tx.update(COLLECTIONS.uploadSessions, session.id, updated);
      tx.update(COLLECTIONS.assets, asset.id, { ...asset, lifecycleState: 'DRAFT', revision: asset.revision + 1, updatedAt: at(this.clock), updatedByEmployeeId: actor.employeeId });
      const event = audit(this.nextId(), 'MEDIA_UPLOAD_CANCELLED', 'MEDIA_UPLOAD_SESSION', session.id, actor, at(this.clock), session, updated, 'Upload cancelled by its authorized owner.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return updated;
    });
    await this.objectStorage.requestDeletion(result.storageObjectRef, 'Authorized upload cancellation.');
    return clone(result);
  }

  async reconcileUpload(sessionId: string, actor: MediaActor): Promise<MediaAssetDetail> {
    if (!isResumableStorageAdapter(this.objectStorage)) throw new MediaDomainError(503, 'MEDIA_RESUMABLE_STORAGE_UNAVAILABLE', 'Resumable storage is unavailable.');
    const session = await this.getUploadSession(sessionId, actor);
    if (session.state === 'EXPIRED') throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_EXPIRED', 'The upload session expired before completion.');
    if (!['ISSUED', 'UPLOADING'].includes(session.state)) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED', 'The upload session was already finalized.');
    const asset = await this.getAsset(session.assetId, actor);
    const actualBytes = await this.objectStorage.objectSize(session.storageObjectRef);
    if (actualBytes !== session.declaredBytes) throw new MediaDomainError(409, 'MEDIA_UPLOAD_INCOMPLETE', `Upload has ${actualBytes} of ${session.declaredBytes} authorized bytes.`);

    const checksum = await checksumFile(this.objectStorage.localPath(session.storageObjectRef));
    const worker: MediaWorkerActor = { service: 'MEDIA_WORKER', instanceId: `local-inspector-${this.nextId()}` };
    const { job } = await this.submitJob({
      assetId: asset.id,
      type: 'VALIDATE',
      uploadSessionId: session.id,
      parameters: { profile: 'm1bLocalInspection' },
      idempotencyKey: `reconcile-${session.id}`,
    }, actor);
    await this.leaseJob(job.id, worker, 30_000);
    await this.store.runTransaction(async tx => {
      const latest = await tx.get(COLLECTIONS.assets, asset.id) as MediaAsset;
      tx.update(COLLECTIONS.assets, asset.id, { ...latest, lifecycleState: 'VALIDATING', revision: latest.revision + 1, updatedAt: at(this.clock), updatedByEmployeeId: worker.instanceId });
    });

    const tempRoot = await mkdtemp(path.join(tmpdir(), 'bbos-media-inspect-'));
    const thumbnailPath = path.join(tempRoot, 'thumbnail.webp');
    try {
      const inspection = await inspectInIsolatedWorker({
        mode: 'ORIGINAL',
        category: asset.category,
        declaredContentType: asset.declaredContentType,
        sourcePath: this.objectStorage.localPath(session.storageObjectRef),
        ...(asset.category === 'IMAGE' ? { outputPath: thumbnailPath } : {}),
      });
      if (asset.category === 'VIDEO') {
        if (!inspection.durationMs || !inspection.width || !inspection.height) {
          throw new MediaDomainError(422, 'MEDIA_VIDEO_METADATA_REQUIRED', 'Video duration and resolution could not be verified by the approved inspector.');
        }
        if (inspection.durationMs > 10 * 60 * 1_000 || Math.max(inspection.width, inspection.height) > 4_096 || inspection.width * inspection.height > 8_847_360) {
          throw new MediaDomainError(422, 'MEDIA_VIDEO_LIMIT_EXCEEDED', 'Video exceeds the approved 10 minute or 4K inspection limit.');
        }
      }
      const version = await this.recordAssetVersion(asset.id, {
        sourceUploadSessionId: session.id,
        checksumSha256: checksum,
        bytes: actualBytes,
        detectedContentType: inspection.detectedContentType,
        ...(inspection.durationMs === undefined ? {} : { durationMs: inspection.durationMs }),
        ...(inspection.width === undefined ? {} : { width: inspection.width }),
        ...(inspection.height === undefined ? {} : { height: inspection.height }),
        ...(inspection.detectedContainer ? { detectedContainer: inspection.detectedContainer } : {}),
        detectedCodecs: inspection.detectedCodecs,
        validationStatus: 'VALID',
        validationErrors: [],
      }, worker);
      await this.objectStorage.promoteObject(session.storageObjectRef, version.storageObjectRef);
      const outputObjectIds: string[] = [];
      if (inspection.thumbnail) {
        const thumbnail = await readFile(inspection.thumbnail.path);
        const derived = await this.recordDerivedObject(asset.id, {
          sourceVersionId: version.id,
          kind: 'THUMBNAIL',
          checksumSha256: createHash('sha256').update(thumbnail).digest('hex'),
          contentType: inspection.thumbnail.contentType,
          bytes: thumbnail.byteLength,
          parametersHash: createHash('sha256').update('sharp:webp:640x640:inside:q78').digest('hex'),
        }, worker);
        await this.objectStorage.writeDerivedObject(derived.storageObjectRef, thumbnail);
        outputObjectIds.push(derived.id);
      }
      await this.completeJob(job.id, { outputObjectIds, metadata: { checksumSha256: checksum, bytes: actualBytes } }, worker);
    } catch (error) {
      const safeMessage = error instanceof Error ? error.message.slice(0, 300) : 'Media inspection failed.';
      try {
        await this.recordAssetVersion(asset.id, {
          sourceUploadSessionId: session.id,
          checksumSha256: checksum,
          bytes: actualBytes,
          detectedContentType: 'application/octet-stream',
          detectedCodecs: [],
          validationStatus: 'INVALID',
          validationErrors: [safeMessage],
        }, worker);
      } catch { /* preserve the original safe failure */ }
      await this.failJob(job.id, { classification: 'UNSUPPORTED_MEDIA', code: 'MEDIA_INSPECTION_FAILED', safeMessage, retryable: false }, worker).catch(() => undefined);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
    return this.getAssetDetail(asset.id, actor);
  }

  async createPreview(assetId: string, contentType: string, bytes: Uint8Array, actor: MediaActor): Promise<MediaDerivedObject> {
    if (!isResumableStorageAdapter(this.objectStorage)) throw new MediaDomainError(503, 'MEDIA_RESUMABLE_STORAGE_UNAVAILABLE', 'Preview storage is unavailable.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType) || bytes.byteLength <= 0 || bytes.byteLength > 8 * 1024 * 1024) {
      throw new MediaDomainError(422, 'MEDIA_PREVIEW_INVALID', 'Preview must be a JPEG, PNG, or WebP image no larger than 8 MiB.');
    }
    const detail = await this.getAssetDetail(assetId, actor);
    if (!detail.currentVersion || detail.currentVersion.validationStatus !== 'VALID') throw new MediaDomainError(409, 'MEDIA_VERSION_REQUIRED', 'A valid media version is required before preview creation.');
    const worker: MediaWorkerActor = { service: 'MEDIA_WORKER', instanceId: `local-preview-${this.nextId()}` };
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'bbos-media-preview-'));
    const inputPath = path.join(tempRoot, 'input');
    const outputPath = path.join(tempRoot, 'preview.webp');
    try {
      await writeFile(inputPath, bytes);
      const inspection = await inspectInIsolatedWorker({ mode: 'PREVIEW', category: 'IMAGE', declaredContentType: contentType, sourcePath: inputPath, outputPath });
      const normalized = await readFile(inspection.thumbnail!.path);
      const derived = await this.recordDerivedObject(detail.asset.id, {
        sourceVersionId: detail.currentVersion.id,
        kind: 'THUMBNAIL',
        checksumSha256: createHash('sha256').update(normalized).digest('hex'),
        contentType: 'image/webp',
        bytes: normalized.byteLength,
        parametersHash: createHash('sha256').update('sharp:client-capture:webp:640x640:inside:q78').digest('hex'),
      }, worker);
      await this.objectStorage.writeDerivedObject(derived.storageObjectRef, normalized);
      return derived;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  async readPreview(assetId: string, actor: MediaActor): Promise<{ bytes: Buffer; contentType: string }> {
    if (!isResumableStorageAdapter(this.objectStorage)) throw new MediaDomainError(503, 'MEDIA_RESUMABLE_STORAGE_UNAVAILABLE', 'Preview storage is unavailable.');
    const detail = await this.getAssetDetail(assetId, actor);
    const preview = detail.derivedObjects.find(item => item.kind === 'THUMBNAIL' || item.kind === 'PREVIEW');
    if (!preview) throw new MediaDomainError(404, 'MEDIA_PREVIEW_NOT_FOUND', 'A preview is not available for this asset.');
    return { bytes: await this.objectStorage.readObject(preview.storageObjectRef, 10 * 1024 * 1024), contentType: preview.contentType };
  }

  async submitRights(assetId: string, rawInput: unknown, actor: MediaActor): Promise<MediaRightsRecord> {
    const id = identifier(assetId, 'assetId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, [
      'sourceOrContributor', 'ownershipBasis', 'subjectConsentRequired', 'subjectConsentConfirmed', 'influencerRestrictions',
      'permittedSocialChannels', 'permittedTerritories', 'validFrom', 'validUntil', 'musicRights',
      'commercialAdvertisingAllowed', 'evidenceReference',
    ]);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'SUBMIT_MEDIA_RIGHTS', asset);
      const now = at(this.clock);
      const validFrom = isoTimestamp(input.validFrom, 'validFrom');
      const validUntil = input.validUntil === undefined || input.validUntil === '' ? undefined : isoTimestamp(input.validUntil, 'validUntil');
      if (validUntil && new Date(validUntil).getTime() <= new Date(validFrom).getTime()) {
        throw new MediaDomainError(422, 'MEDIA_RIGHTS_PERIOD_INVALID', 'Rights expiry must be after the validity start.');
      }
      const subjectConsentRequired = booleanValue(input.subjectConsentRequired, 'subjectConsentRequired');
      const subjectConsentConfirmed = booleanValue(input.subjectConsentConfirmed, 'subjectConsentConfirmed');
      const rights: MediaRightsRecord = {
        id: `media-rights-${this.nextId()}`,
        assetId: asset.id,
        sourceOrContributor: requiredText(input.sourceOrContributor, 'sourceOrContributor', 300),
        ownershipBasis: enumValue(input.ownershipBasis, ['BOOKING_BRIDGE_OWNED', 'LICENSED', 'CONTRIBUTOR_PERMISSION', 'CUSTOMER_CONSENT', 'OTHER'] as const, 'ownershipBasis'),
        subjectConsentRequired,
        subjectConsentConfirmed,
        influencerRestrictions: optionalText(input.influencerRestrictions, 'influencerRestrictions', 2_000),
        permittedSocialChannels: uniqueStrings(input.permittedSocialChannels, 'permittedSocialChannels', 20, 100),
        permittedTerritories: uniqueStrings(input.permittedTerritories, 'permittedTerritories', 50, 100),
        validFrom,
        ...(validUntil ? { validUntil } : {}),
        musicRights: enumValue(input.musicRights, ['NOT_APPLICABLE', 'ORIGINAL', 'LICENSED', 'UNKNOWN'] as const, 'musicRights'),
        commercialAdvertisingAllowed: booleanValue(input.commercialAdvertisingAllowed, 'commercialAdvertisingAllowed'),
        evidenceReference: requiredText(input.evidenceReference, 'evidenceReference', 500),
        status: 'SUBMITTED',
        submittedByEmployeeId: actor.employeeId,
        submittedAt: now,
        revision: 1,
      };
      if (subjectConsentRequired && !subjectConsentConfirmed) {
        throw new MediaDomainError(422, 'MEDIA_CONSENT_REQUIRED', 'Required subject consent must be confirmed before rights review.');
      }
      const updated: MediaAsset = { ...asset, currentRightsId: rights.id, rightsStatus: 'SUBMITTED', revision: asset.revision + 1, updatedAt: now, updatedByEmployeeId: actor.employeeId };
      tx.set(COLLECTIONS.rights, rights.id, rights);
      tx.update(COLLECTIONS.assets, asset.id, updated);
      const event = audit(this.nextId(), 'MEDIA_RIGHTS_SUBMITTED', 'MEDIA_RIGHTS', rights.id, actor, now, null, rights, 'Rights and consent information submitted for Founder/Admin review.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(rights);
    });
  }

  async decideRights(rightsId: string, rawInput: unknown, actor: MediaActor): Promise<MediaRightsRecord> {
    const id = identifier(rightsId, 'rightsId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['decision', 'reason']);
    const decision = enumValue(input.decision, ['VERIFIED', 'REJECTED', 'REVOKED'] as const, 'decision');
    const reason = requiredText(input.reason, 'reason', 1_000);
    return this.store.runTransaction(async tx => {
      const rights = await tx.get(COLLECTIONS.rights, id) as MediaRightsRecord | null;
      if (!rights) throw new MediaDomainError(404, 'MEDIA_RIGHTS_NOT_FOUND', 'Media rights record not found.');
      const asset = await tx.get(COLLECTIONS.assets, rights.assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'VERIFY_MEDIA_RIGHTS', asset);
      if (asset.currentRightsId !== rights.id) throw new MediaDomainError(409, 'MEDIA_RIGHTS_SUPERSEDED', 'A newer rights submission must be reviewed.');
      if (rights.status !== 'SUBMITTED' && !(decision === 'REVOKED' && rights.status === 'VERIFIED')) {
        throw new MediaDomainError(409, 'MEDIA_RIGHTS_STATE_INVALID', 'The rights record is not in a reviewable state.');
      }
      const now = at(this.clock);
      const candidate: MediaRightsRecord = {
        ...rights,
        status: decision,
        verifiedByEmployeeId: actor.employeeId,
        verifiedAt: now,
        decisionReason: reason,
        ...(decision === 'REVOKED' ? { revokedAt: now } : {}),
        revision: rights.revision + 1,
      };
      if (decision === 'VERIFIED' && !rightsAreCommerciallyEligible(candidate, this.clock())) {
        throw new MediaDomainError(422, 'MEDIA_RIGHTS_NOT_ELIGIBLE', 'Rights cannot be verified for commercial use because consent, license, channel, territory, or validity requirements are incomplete.');
      }
      const updatedAsset: MediaAsset = { ...asset, rightsStatus: decision, revision: asset.revision + 1, updatedAt: now, updatedByEmployeeId: actor.employeeId };
      tx.update(COLLECTIONS.rights, id, candidate);
      tx.update(COLLECTIONS.assets, asset.id, updatedAsset);
      const event = audit(this.nextId(), `MEDIA_RIGHTS_${decision}`, 'MEDIA_RIGHTS', id, actor, now, rights, candidate, reason);
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(candidate);
    });
  }

  async assertCommercialEligibility(assetId: string, channel: string, territory: string, actor: MediaActor): Promise<MediaRightsRecord> {
    const id = identifier(assetId, 'assetId');
    const requestedChannel = requiredText(channel, 'channel', 100);
    const requestedTerritory = requiredText(territory, 'territory', 100);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'READ_MEDIA', asset);
      if (!asset.currentRightsId) throw new MediaDomainError(409, 'MEDIA_RIGHTS_REQUIRED', 'Verified rights are required.');
      const rights = await tx.get(COLLECTIONS.rights, asset.currentRightsId) as MediaRightsRecord | null;
      if (!rights || !rightsAreCommerciallyEligible(rights, this.clock())) throw new MediaDomainError(409, 'MEDIA_RIGHTS_REQUIRED', 'Current rights are not eligible for commercial use.');
      if (!rights.permittedSocialChannels.includes(requestedChannel) || !rights.permittedTerritories.includes(requestedTerritory)) {
        throw new MediaDomainError(403, 'MEDIA_RIGHTS_SCOPE_DENIED', 'Rights do not cover the requested channel or territory.');
      }
      return clone(rights);
    });
  }

  async recordAssetVersion(assetId: string, rawInput: unknown, worker: MediaWorkerActor): Promise<MediaAssetVersion> {
    requireWorker(worker);
    const id = identifier(assetId, 'assetId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, [
      'sourceUploadSessionId', 'checksumSha256', 'bytes', 'detectedContentType', 'durationMs', 'width', 'height',
      'detectedContainer', 'detectedCodecs', 'validationStatus', 'validationErrors',
    ]);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      const sessionId = identifier(input.sourceUploadSessionId, 'sourceUploadSessionId');
      const session = await tx.get(COLLECTIONS.uploadSessions, sessionId) as MediaUploadSession | null;
      if (!session || session.assetId !== asset.id) throw new MediaDomainError(422, 'MEDIA_UPLOAD_SESSION_INVALID', 'The upload session does not belong to this asset.');
      if (!['ISSUED', 'UPLOADING'].includes(session.state)) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_ALREADY_FINALIZED', 'The upload session was already finalized.');
      if (new Date(session.expiresAt).getTime() <= this.clock().getTime()) throw new MediaDomainError(409, 'MEDIA_UPLOAD_SESSION_EXPIRED', 'The upload session expired before validation.');
      const checksum = validateChecksum(input.checksumSha256);
      const existingVersions = await tx.findByField(COLLECTIONS.versions, 'assetId', asset.id, 500) as MediaAssetVersion[];
      const versionNumber = existingVersions.length + 1;
      const versionId = `media-version-${asset.id}-${versionNumber}`;
      if (await tx.get(COLLECTIONS.versions, versionId)) throw new MediaDomainError(409, 'MEDIA_VERSION_IMMUTABLE', 'This immutable media version already exists.');
      const validationStatus = enumValue(input.validationStatus, ['VALID', 'INVALID'] as const, 'validationStatus');
      const now = at(this.clock);
      const version: MediaAssetVersion = {
        id: versionId,
        assetId: asset.id,
        version: versionNumber,
        sourceUploadSessionId: session.id,
        storageObjectRef: validationStatus === 'VALID' ? originalObjectRef(asset.id, checksum, `v${versionNumber}`) : session.storageObjectRef,
        checksumSha256: checksum,
        bytes: positiveInteger(input.bytes, 'bytes', MAX_UPLOAD_BYTES[asset.category]),
        declaredContentType: asset.declaredContentType,
        detectedContentType: requiredText(input.detectedContentType, 'detectedContentType', 120).toLowerCase(),
        ...(input.durationMs === undefined ? {} : { durationMs: optionalPositiveInteger(input.durationMs, 'durationMs', 24 * 60 * 60 * 1_000) }),
        ...(input.width === undefined ? {} : { width: optionalPositiveInteger(input.width, 'width', 32_768) }),
        ...(input.height === undefined ? {} : { height: optionalPositiveInteger(input.height, 'height', 32_768) }),
        ...(input.detectedContainer === undefined ? {} : { detectedContainer: requiredText(input.detectedContainer, 'detectedContainer', 100) }),
        detectedCodecs: uniqueStrings(input.detectedCodecs ?? [], 'detectedCodecs', 20, 100),
        validationStatus,
        validationErrors: uniqueStrings(input.validationErrors ?? [], 'validationErrors', 50, 300),
        createdAt: now,
        createdByService: 'MEDIA_WORKER',
      };
      if (validationStatus === 'VALID' && version.detectedContentType !== asset.declaredContentType) {
        throw new MediaDomainError(422, 'MEDIA_DETECTED_TYPE_MISMATCH', 'Detected content type does not match the declared type.');
      }
      const duplicates = await tx.findByField(COLLECTIONS.versions, 'checksumSha256', checksum, 100) as MediaAssetVersion[];
      const duplicateOfAssetIds = [...new Set(duplicates.filter(item => item.assetId !== asset.id).map(item => item.assetId))];
      const updatedAsset: MediaAsset = {
        ...asset,
        ...(validationStatus === 'VALID' ? { currentVersionId: version.id } : {}),
        duplicateOfAssetIds,
        lifecycleState: validationStatus === 'VALID' ? 'READY' : 'REJECTED',
        validationStatus,
        revision: asset.revision + 1,
        updatedAt: now,
        updatedByEmployeeId: worker.instanceId,
      };
      tx.set(COLLECTIONS.versions, version.id, version);
      tx.update(COLLECTIONS.assets, asset.id, updatedAsset);
      tx.update(COLLECTIONS.uploadSessions, session.id, { ...session, state: 'COMPLETED' });
      const event = audit(this.nextId(), 'MEDIA_ASSET_VERSION_RECORDED', 'MEDIA_ASSET_VERSION', version.id, worker, now, null, version, `Immutable media version recorded as ${validationStatus}.`);
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(version);
    });
  }

  async recordDerivedObject(assetId: string, rawInput: unknown, worker: MediaWorkerActor): Promise<MediaDerivedObject> {
    requireWorker(worker);
    const id = identifier(assetId, 'assetId');
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['sourceVersionId', 'kind', 'checksumSha256', 'contentType', 'bytes', 'parametersHash']);
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      const sourceVersionId = identifier(input.sourceVersionId, 'sourceVersionId');
      const source = await tx.get(COLLECTIONS.versions, sourceVersionId) as MediaAssetVersion | null;
      if (!source || source.assetId !== asset.id || source.validationStatus !== 'VALID') throw new MediaDomainError(422, 'MEDIA_SOURCE_VERSION_INVALID', 'A valid immutable source version is required.');
      const kind = enumValue(input.kind, MEDIA_DERIVED_KINDS, 'kind');
      const checksum = validateChecksum(input.checksumSha256);
      const parametersHash = validateChecksum(input.parametersHash);
      const object: MediaDerivedObject = {
        id: `media-derived-${this.nextId()}`,
        assetId: asset.id,
        sourceVersionId,
        kind,
        storageObjectRef: derivedObjectRef(asset.id, sourceVersionId, kind),
        checksumSha256: checksum,
        contentType: requiredText(input.contentType, 'contentType', 120),
        bytes: positiveInteger(input.bytes, 'bytes', MAX_UPLOAD_BYTES[asset.category]),
        parametersHash,
        createdAt: at(this.clock),
        createdByService: 'MEDIA_WORKER',
      };
      tx.set(COLLECTIONS.derived, object.id, object);
      return clone(object);
    });
  }

  async submitJob(rawInput: unknown, actor: MediaActor): Promise<{ job: MediaProcessingJob; idempotent: boolean }> {
    const input = asRecord(rawInput);
    assertAllowedFields(input, ['assetId', 'type', 'parameters', 'idempotencyKey', 'uploadSessionId']);
    const assetId = identifier(input.assetId, 'assetId');
    const type = enumValue(input.type, MEDIA_JOB_TYPES, 'type');
    const parameters = normalizedJobParameters(input.parameters);
    const parametersHash = sha256(JSON.stringify(parameters));
    const clientKey = identifier(input.idempotencyKey, 'idempotencyKey');
    const idempotencyKey = sha256(`${actor.employeeId}|${assetId}|${clientKey}`);
    const jobId = `media-job-${idempotencyKey.slice(0, 32)}`;
    return this.store.runTransaction(async tx => {
      const asset = await tx.get(COLLECTIONS.assets, assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'CREATE_MEDIA_JOB', asset);
      let uploadSessionId: string | undefined;
      let sourceChecksumSha256: string | undefined;
      if (type === 'VALIDATE') {
        uploadSessionId = identifier(input.uploadSessionId, 'uploadSessionId');
        const session = await tx.get(COLLECTIONS.uploadSessions, uploadSessionId) as MediaUploadSession | null;
        if (!session || session.assetId !== asset.id) throw new MediaDomainError(422, 'MEDIA_UPLOAD_SESSION_INVALID', 'The upload session does not belong to this asset.');
      } else {
        if (!asset.currentVersionId) throw new MediaDomainError(409, 'MEDIA_VERSION_REQUIRED', 'A valid immutable media version is required.');
        const version = await tx.get(COLLECTIONS.versions, asset.currentVersionId) as MediaAssetVersion | null;
        if (!version || version.validationStatus !== 'VALID') throw new MediaDomainError(409, 'MEDIA_VERSION_REQUIRED', 'A valid immutable media version is required.');
        sourceChecksumSha256 = version.checksumSha256;
      }
      const existing = await tx.get(COLLECTIONS.jobs, jobId) as MediaProcessingJob | null;
      if (existing) {
        if (existing.type !== type || existing.input.assetId !== asset.id || existing.parametersHash !== parametersHash || existing.input.uploadSessionId !== uploadSessionId) {
          throw new MediaDomainError(409, 'MEDIA_JOB_IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different media job.');
        }
        return { job: clone(existing), idempotent: true };
      }
      const now = at(this.clock);
      const job: MediaProcessingJob = {
        id: jobId,
        type,
        input: {
          assetId: asset.id,
          ...(asset.currentVersionId ? { assetVersionId: asset.currentVersionId } : {}),
          ...(uploadSessionId ? { uploadSessionId } : {}),
          ...(sourceChecksumSha256 ? { sourceChecksumSha256 } : {}),
        },
        normalizedParameters: parameters,
        parametersHash,
        idempotencyKey,
        state: 'QUEUED',
        attempt: 0,
        maxAttempts: 3,
        createdAt: now,
        createdByEmployeeId: actor.employeeId,
        updatedAt: now,
        updatedByEmployeeId: actor.employeeId,
      };
      tx.set(COLLECTIONS.jobs, job.id, job);
      const event = audit(this.nextId(), 'MEDIA_JOB_SUBMITTED', 'MEDIA_JOB', job.id, actor, now, null, job, 'Idempotent media job submitted.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return { job: clone(job), idempotent: false };
    });
  }

  async getJob(jobId: string, actor: MediaActor): Promise<MediaProcessingJob> {
    const id = identifier(jobId, 'jobId');
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const asset = await tx.get(COLLECTIONS.assets, job.input.assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'READ_MEDIA_JOB', asset);
      return clone(job);
    });
  }

  async leaseJob(jobId: string, worker: MediaWorkerActor, leaseMs = 60_000): Promise<MediaProcessingJob> {
    requireWorker(worker);
    const id = identifier(jobId, 'jobId');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) throw new MediaDomainError(400, 'MEDIA_LEASE_DURATION_INVALID', 'Lease duration is outside the allowed range.');
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const now = this.clock();
      const leaseExpired = !!job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() <= now.getTime();
      const retryDue = job.state !== 'RETRY_WAIT' || !job.retryAfter || new Date(job.retryAfter).getTime() <= now.getTime();
      if ((job.state === 'LEASED' || job.state === 'RUNNING') && !leaseExpired) throw new MediaDomainError(409, 'MEDIA_JOB_ALREADY_LEASED', 'Media job has an active lease.');
      if (job.state === 'RETRY_WAIT' && !retryDue) throw new MediaDomainError(409, 'MEDIA_JOB_RETRY_NOT_DUE', 'Media job retry is not due.');
      if (!['QUEUED', 'RETRY_WAIT', 'LEASED', 'RUNNING'].includes(job.state)) throw new MediaDomainError(409, 'MEDIA_JOB_STATE_INVALID', 'Media job cannot be leased from its current state.');
      if (job.attempt >= job.maxAttempts) {
        const failedAt = now.toISOString();
        const exhausted: MediaProcessingJob = {
          ...job,
          state: 'FAILED',
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
          failure: { classification: 'TRANSIENT_INFRASTRUCTURE', code: 'LEASE_RECOVERY_EXHAUSTED', safeMessage: 'Lease recovery attempts were exhausted.', retryable: false, failedAt },
          updatedAt: failedAt,
          updatedByEmployeeId: worker.instanceId,
        };
        tx.update(COLLECTIONS.jobs, id, exhausted);
        const event = audit(this.nextId(), 'MEDIA_JOB_FAILED', 'MEDIA_JOB', id, worker, failedAt, job, exhausted, 'Lease recovery attempts were exhausted.');
        tx.set(COLLECTIONS.audit, event.id, event);
        return clone(exhausted);
      }
      const updated: MediaProcessingJob = {
        ...job,
        state: 'LEASED',
        attempt: job.attempt + 1,
        leaseOwner: worker.instanceId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
        lastHeartbeatAt: now.toISOString(),
        retryAfter: undefined,
        failure: undefined,
        updatedAt: now.toISOString(),
        updatedByEmployeeId: worker.instanceId,
      };
      tx.update(COLLECTIONS.jobs, id, updated);
      const event = audit(this.nextId(), leaseExpired ? 'MEDIA_JOB_LEASE_RECOVERED' : 'MEDIA_JOB_LEASED', 'MEDIA_JOB', id, worker, now.toISOString(), job, updated, leaseExpired ? 'Expired lease recovered.' : 'Job leased by media worker.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(updated);
    });
  }

  async heartbeatJob(jobId: string, worker: MediaWorkerActor, leaseMs = 60_000): Promise<MediaProcessingJob> {
    requireWorker(worker);
    const id = identifier(jobId, 'jobId');
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const now = this.clock();
      assertWorkerOwnsActiveLease(job, worker, now);
      const updated: MediaProcessingJob = { ...job, state: 'RUNNING', lastHeartbeatAt: now.toISOString(), leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(), updatedAt: now.toISOString(), updatedByEmployeeId: worker.instanceId };
      tx.update(COLLECTIONS.jobs, id, updated);
      return clone(updated);
    });
  }

  async completeJob(jobId: string, rawResult: unknown, worker: MediaWorkerActor): Promise<MediaProcessingJob> {
    requireWorker(worker);
    const id = identifier(jobId, 'jobId');
    const input = asRecord(rawResult, 'result');
    assertAllowedFields(input, ['outputObjectIds', 'metadata']);
    const outputObjectIds = uniqueStrings(input.outputObjectIds ?? [], 'outputObjectIds', 100, 160);
    const metadata = normalizedJobParameters(input.metadata);
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const now = this.clock();
      assertWorkerOwnsActiveLease(job, worker, now);
      const updated: MediaProcessingJob = {
        ...job,
        state: 'SUCCEEDED',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        result: { outputObjectIds, metadata, completedAt: now.toISOString() },
        updatedAt: now.toISOString(),
        updatedByEmployeeId: worker.instanceId,
      };
      tx.update(COLLECTIONS.jobs, id, updated);
      const event = audit(this.nextId(), 'MEDIA_JOB_SUCCEEDED', 'MEDIA_JOB', id, worker, now.toISOString(), job, updated, 'Media job result recorded.');
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(updated);
    });
  }

  async failJob(jobId: string, rawFailure: unknown, worker: MediaWorkerActor): Promise<MediaProcessingJob> {
    requireWorker(worker);
    const id = identifier(jobId, 'jobId');
    const input = asRecord(rawFailure, 'failure');
    assertAllowedFields(input, ['classification', 'code', 'safeMessage', 'retryable', 'retryDelayMs']);
    const classification = enumValue(input.classification, MEDIA_ERROR_CLASSES, 'classification') as MediaErrorClass;
    const code = identifier(input.code, 'code');
    const safeMessage = requiredText(input.safeMessage, 'safeMessage', 500);
    const requestedRetry = booleanValue(input.retryable, 'retryable');
    const retryDelayMs = input.retryDelayMs === undefined ? 30_000 : positiveInteger(input.retryDelayMs, 'retryDelayMs', 24 * 60 * 60 * 1_000);
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const now = this.clock();
      assertWorkerOwnsActiveLease(job, worker, now);
      const retryable = requestedRetry && ['TRANSIENT_INFRASTRUCTURE', 'RESOURCE_LIMIT'].includes(classification) && job.attempt < job.maxAttempts;
      const failure: MediaJobFailure = { classification, code, safeMessage, retryable, failedAt: now.toISOString() };
      const updated: MediaProcessingJob = {
        ...job,
        state: retryable ? 'RETRY_WAIT' : 'FAILED',
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        ...(retryable ? { retryAfter: new Date(now.getTime() + retryDelayMs).toISOString() } : { retryAfter: undefined }),
        failure,
        updatedAt: now.toISOString(),
        updatedByEmployeeId: worker.instanceId,
      };
      tx.update(COLLECTIONS.jobs, id, updated);
      const event = audit(this.nextId(), retryable ? 'MEDIA_JOB_RETRY_SCHEDULED' : 'MEDIA_JOB_FAILED', 'MEDIA_JOB', id, worker, now.toISOString(), job, updated, safeMessage);
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(updated);
    });
  }

  async cancelJob(jobId: string, reasonInput: unknown, actor: MediaActor): Promise<MediaProcessingJob> {
    const id = identifier(jobId, 'jobId');
    const reason = requiredText(reasonInput, 'reason', 500);
    return this.store.runTransaction(async tx => {
      const job = await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
      if (!job) throw new MediaDomainError(404, 'MEDIA_JOB_NOT_FOUND', 'Media job not found.');
      const asset = await tx.get(COLLECTIONS.assets, job.input.assetId) as MediaAsset | null;
      if (!asset) throw new MediaDomainError(404, 'MEDIA_ASSET_NOT_FOUND', 'Media asset not found.');
      authorize(actor, 'CREATE_MEDIA_JOB', asset);
      if (!['QUEUED', 'RETRY_WAIT'].includes(job.state)) throw new MediaDomainError(409, 'MEDIA_JOB_CANCELLATION_DENIED', 'Only queued or retry-wait jobs can be cancelled.');
      const now = at(this.clock);
      const updated: MediaProcessingJob = { ...job, state: 'CANCELLED', cancelledByEmployeeId: actor.employeeId, cancellationReason: reason, retryAfter: undefined, updatedAt: now, updatedByEmployeeId: actor.employeeId };
      tx.update(COLLECTIONS.jobs, id, updated);
      const event = audit(this.nextId(), 'MEDIA_JOB_CANCELLED', 'MEDIA_JOB', id, actor, now, job, updated, reason);
      tx.set(COLLECTIONS.audit, event.id, event);
      return clone(updated);
    });
  }

  async listAuditEvents(entityId: string, actor: MediaActor): Promise<MediaAuditEvent[]> {
    const id = identifier(entityId, 'entityId');
    return this.store.runTransaction(async tx => {
      const directAsset = await tx.get(COLLECTIONS.assets, id) as MediaAsset | null;
      let asset = directAsset;
      if (!asset) {
        const rights = await tx.get(COLLECTIONS.rights, id) as MediaRightsRecord | null;
        const job = rights ? null : await tx.get(COLLECTIONS.jobs, id) as MediaProcessingJob | null;
        const version = rights || job ? null : await tx.get(COLLECTIONS.versions, id) as MediaAssetVersion | null;
        const linkedAssetId = rights?.assetId || job?.input.assetId || version?.assetId;
        if (linkedAssetId) asset = await tx.get(COLLECTIONS.assets, linkedAssetId) as MediaAsset | null;
      }
      if (!asset) throw new MediaDomainError(404, 'MEDIA_AUDIT_TARGET_NOT_FOUND', 'Media audit target not found.');
      authorize(actor, 'READ_MEDIA', asset);
      const events = await tx.findByField(COLLECTIONS.audit, 'entityId', id, 500) as MediaAuditEvent[];
      return events.sort((left, right) => left.timestamp.localeCompare(right.timestamp)).map(clone);
    });
  }
}

export { COLLECTIONS as MARKETING_MEDIA_COLLECTIONS };

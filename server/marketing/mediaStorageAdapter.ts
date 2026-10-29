import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MediaDomainError, type MediaCategory } from './mediaDomain.js';

export interface ScopedUploadRequest {
  sessionId: string;
  assetId: string;
  ownerEmployeeId: string;
  category: MediaCategory;
  declaredContentType: string;
  declaredBytes: number;
  expiresAt: string;
}

export interface ScopedUploadGrant {
  storageObjectRef: string;
  uploadTransport: 'FAKE' | 'LOCAL_RESUMABLE';
  uploadTarget: string;
  expiresAt: string;
}

export interface ScopedObjectAccessRequest {
  objectRef: string;
  employeeId: string;
  purpose: 'PREVIEW' | 'DOWNLOAD' | 'RIGHTS_REVIEW';
  expiresAt: string;
}

export interface ScopedObjectAccessGrant {
  accessTarget: string;
  expiresAt: string;
}

export interface MediaObjectStorageAdapter {
  readonly kind: 'FAKE' | 'LOCAL' | 'UNAVAILABLE';
  createScopedUpload(request: ScopedUploadRequest): Promise<ScopedUploadGrant>;
  createScopedRead(request: ScopedObjectAccessRequest): Promise<ScopedObjectAccessGrant>;
  requestDeletion(objectRef: string, reason: string): Promise<{ deletionRequestId: string }>;
}

export interface ResumableMediaObjectStorageAdapter extends MediaObjectStorageAdapter {
  readonly kind: 'LOCAL';
  appendChunk(objectRef: string, offset: number, chunk: Uint8Array, maximumBytes: number): Promise<number>;
  objectSize(objectRef: string): Promise<number>;
  readObject(objectRef: string, maximumBytes: number): Promise<Buffer>;
  promoteObject(sourceObjectRef: string, destinationObjectRef: string): Promise<void>;
  writeDerivedObject(objectRef: string, bytes: Uint8Array): Promise<void>;
  localPath(objectRef: string): string;
}

export function isResumableStorageAdapter(value: MediaObjectStorageAdapter): value is ResumableMediaObjectStorageAdapter {
  return value.kind === 'LOCAL';
}

export interface MediaRetentionDecision {
  action: 'RETAIN' | 'DELETE' | 'LEGAL_HOLD';
  reason: string;
  notBefore?: string;
}

export interface MediaRetentionPolicy {
  decide(input: {
    objectKind: 'QUARANTINE' | 'ORIGINAL' | 'DERIVED' | 'RIGHTS_EVIDENCE';
    lifecycleState: string;
    createdAt: string;
    legalHold: boolean;
  }): MediaRetentionDecision;
}

function keyPart(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) {
    throw new MediaDomainError(400, 'INVALID_STORAGE_KEY_INPUT', 'Storage key input is invalid.');
  }
  return value;
}

export function quarantineObjectRef(ownerEmployeeId: string, sessionId: string, objectId: string = randomUUID()): string {
  return `marketing/quarantine/${keyPart(ownerEmployeeId)}/${keyPart(sessionId)}/${keyPart(objectId)}`;
}

export function originalObjectRef(assetId: string, checksumSha256: string, objectId: string = randomUUID()): string {
  if (!/^[a-f0-9]{64}$/.test(checksumSha256)) throw new MediaDomainError(400, 'INVALID_CHECKSUM', 'SHA-256 checksum is invalid.');
  return `marketing/originals/${keyPart(assetId)}/${checksumSha256}/${keyPart(objectId)}`;
}

export function derivedObjectRef(assetId: string, sourceVersionId: string, kind: string, objectId: string = randomUUID()): string {
  return `marketing/derived/${keyPart(assetId)}/${keyPart(sourceVersionId)}/${keyPart(kind.toLowerCase())}/${keyPart(objectId)}`;
}

export class UnavailableMediaObjectStorageAdapter implements MediaObjectStorageAdapter {
  readonly kind = 'UNAVAILABLE' as const;

  private unavailable(): never {
    throw new MediaDomainError(503, 'MEDIA_STORAGE_NOT_CONFIGURED', 'Media object storage is not configured in this milestone.');
  }

  async createScopedUpload(): Promise<ScopedUploadGrant> { return this.unavailable(); }
  async createScopedRead(): Promise<ScopedObjectAccessGrant> { return this.unavailable(); }
  async requestDeletion(): Promise<{ deletionRequestId: string }> { return this.unavailable(); }
}

/** Deterministic, non-network storage contract used only by tests and opt-in demo mode. */
export class FakeMediaObjectStorageAdapter implements MediaObjectStorageAdapter {
  readonly kind = 'FAKE' as const;
  readonly uploadRequests: ScopedUploadRequest[] = [];
  readonly readRequests: ScopedObjectAccessRequest[] = [];
  readonly deletionRequests: Array<{ objectRef: string; reason: string }> = [];

  async createScopedUpload(request: ScopedUploadRequest): Promise<ScopedUploadGrant> {
    this.uploadRequests.push(structuredClone(request));
    const storageObjectRef = quarantineObjectRef(request.ownerEmployeeId, request.sessionId, `object-${request.sessionId}`);
    return {
      storageObjectRef,
      uploadTransport: 'FAKE',
      uploadTarget: `fake-upload://${request.sessionId}`,
      expiresAt: request.expiresAt,
    };
  }

  async createScopedRead(request: ScopedObjectAccessRequest): Promise<ScopedObjectAccessGrant> {
    this.readRequests.push(structuredClone(request));
    const token = createHash('sha256').update(`${request.objectRef}|${request.employeeId}|${request.purpose}|${request.expiresAt}`).digest('hex').slice(0, 24);
    return { accessTarget: `fake-read://${token}`, expiresAt: request.expiresAt };
  }

  async requestDeletion(objectRef: string, reason: string): Promise<{ deletionRequestId: string }> {
    if (!objectRef.startsWith('marketing/')) throw new MediaDomainError(400, 'INVALID_STORAGE_REFERENCE', 'Object reference is outside the media namespace.');
    this.deletionRequests.push({ objectRef, reason });
    const deletionRequestId = createHash('sha256').update(`${objectRef}|${reason}`).digest('hex').slice(0, 24);
    return { deletionRequestId: `fake-delete-${deletionRequestId}` };
  }
}

/**
 * Local-only object storage for isolated development and E2E verification.
 * References are namespace keys, never caller paths, and every resolved path
 * must remain beneath the configured root.
 */
export class LocalMediaObjectStorageAdapter implements ResumableMediaObjectStorageAdapter {
  readonly kind = 'LOCAL' as const;
  readonly rootPath: string;

  constructor(rootPath = path.join(tmpdir(), 'bbos-marketing-media')) {
    this.rootPath = path.resolve(rootPath);
  }

  localPath(objectRef: string): string {
    if (!/^marketing\/(quarantine|originals|derived|rights-evidence)\/[A-Za-z0-9._/-]+$/.test(objectRef) || objectRef.includes('..')) {
      throw new MediaDomainError(400, 'INVALID_STORAGE_REFERENCE', 'Object reference is outside the media namespace.');
    }
    const resolved = path.resolve(this.rootPath, ...objectRef.split('/'));
    const prefix = `${this.rootPath}${path.sep}`;
    if (!resolved.startsWith(prefix)) throw new MediaDomainError(400, 'INVALID_STORAGE_REFERENCE', 'Object reference escapes the media root.');
    return resolved;
  }

  async createScopedUpload(request: ScopedUploadRequest): Promise<ScopedUploadGrant> {
    const storageObjectRef = quarantineObjectRef(request.ownerEmployeeId, request.sessionId, `object-${randomUUID()}`);
    const target = this.localPath(storageObjectRef);
    await mkdir(path.dirname(target), { recursive: true });
    const handle = await open(target, 'wx');
    await handle.close();
    return {
      storageObjectRef,
      uploadTransport: 'LOCAL_RESUMABLE',
      uploadTarget: `/api/marketing/media/upload-sessions/${encodeURIComponent(request.sessionId)}/chunks`,
      expiresAt: request.expiresAt,
    };
  }

  async appendChunk(objectRef: string, offset: number, chunk: Uint8Array, maximumBytes: number): Promise<number> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new MediaDomainError(400, 'MEDIA_UPLOAD_OFFSET_INVALID', 'Upload offset is invalid.');
    if (chunk.byteLength === 0 || chunk.byteLength > 1024 * 1024) throw new MediaDomainError(413, 'MEDIA_UPLOAD_CHUNK_INVALID', 'Upload chunks must be between 1 byte and 1 MiB.');
    const target = this.localPath(objectRef);
    const current = (await stat(target)).size;
    if (current !== offset) throw new MediaDomainError(409, 'MEDIA_UPLOAD_OFFSET_CONFLICT', `Resume upload at byte ${current}.`);
    if (current + chunk.byteLength > maximumBytes) throw new MediaDomainError(413, 'MEDIA_UPLOAD_TOO_LARGE', 'Upload exceeds the authorized byte limit.');
    const handle = await open(target, 'r+');
    try {
      await handle.write(chunk, 0, chunk.byteLength, offset);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return current + chunk.byteLength;
  }

  async objectSize(objectRef: string): Promise<number> {
    return (await stat(this.localPath(objectRef))).size;
  }

  async readObject(objectRef: string, maximumBytes: number): Promise<Buffer> {
    const target = this.localPath(objectRef);
    const details = await stat(target);
    if (details.size > maximumBytes) throw new MediaDomainError(413, 'MEDIA_OBJECT_READ_LIMIT', 'Object exceeds the authorized read limit.');
    return readFile(target);
  }

  async promoteObject(sourceObjectRef: string, destinationObjectRef: string): Promise<void> {
    const source = this.localPath(sourceObjectRef);
    const destination = this.localPath(destinationObjectRef);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await rename(source, destination);
    } catch {
      await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
      await rm(source, { force: true });
    }
  }

  async writeDerivedObject(objectRef: string, bytes: Uint8Array): Promise<void> {
    const target = this.localPath(objectRef);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }

  async createScopedRead(request: ScopedObjectAccessRequest): Promise<ScopedObjectAccessGrant> {
    this.localPath(request.objectRef);
    const token = createHash('sha256').update(`${request.objectRef}|${request.employeeId}|${request.purpose}|${request.expiresAt}`).digest('hex').slice(0, 32);
    return { accessTarget: `local-read://${token}`, expiresAt: request.expiresAt };
  }

  async requestDeletion(objectRef: string, reason: string): Promise<{ deletionRequestId: string }> {
    await rm(this.localPath(objectRef), { force: true });
    const digest = createHash('sha256').update(`${objectRef}|${reason}`).digest('hex').slice(0, 24);
    return { deletionRequestId: `local-delete-${digest}` };
  }
}

export class FoundationRetentionPolicy implements MediaRetentionPolicy {
  decide(input: { objectKind: 'QUARANTINE' | 'ORIGINAL' | 'DERIVED' | 'RIGHTS_EVIDENCE'; lifecycleState: string; createdAt: string; legalHold: boolean }): MediaRetentionDecision {
    if (input.legalHold) return { action: 'LEGAL_HOLD', reason: 'An active legal hold prevents deletion.' };
    if (input.lifecycleState === 'DELETED') return { action: 'DELETE', reason: 'The metadata lifecycle authorized deletion.' };
    return { action: 'RETAIN', reason: 'M1A defaults to retention until a production retention schedule is approved.' };
  }
}

import { createHash, randomUUID } from 'node:crypto';
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
  uploadTransport: 'FAKE';
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
  readonly kind: 'FAKE' | 'UNAVAILABLE';
  createScopedUpload(request: ScopedUploadRequest): Promise<ScopedUploadGrant>;
  createScopedRead(request: ScopedObjectAccessRequest): Promise<ScopedObjectAccessGrant>;
  requestDeletion(objectRef: string, reason: string): Promise<{ deletionRequestId: string }>;
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

export class FoundationRetentionPolicy implements MediaRetentionPolicy {
  decide(input: { objectKind: 'QUARANTINE' | 'ORIGINAL' | 'DERIVED' | 'RIGHTS_EVIDENCE'; lifecycleState: string; createdAt: string; legalHold: boolean }): MediaRetentionDecision {
    if (input.legalHold) return { action: 'LEGAL_HOLD', reason: 'An active legal hold prevents deletion.' };
    if (input.lifecycleState === 'DELETED') return { action: 'DELETE', reason: 'The metadata lifecycle authorized deletion.' };
    return { action: 'RETAIN', reason: 'M1A defaults to retention until a production retention schedule is approved.' };
  }
}

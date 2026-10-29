import { authenticatedMutationHeaders, authenticatedReadHeaders } from '../auth/authenticatedApi';

export type MediaCategory = 'IMAGE' | 'VIDEO' | 'AUDIO';
export type MediaLifecycleState = 'DRAFT' | 'AWAITING_UPLOAD' | 'QUARANTINED' | 'VALIDATING' | 'READY' | 'REJECTED' | 'ARCHIVED' | 'DELETION_PENDING' | 'DELETED';
export type MediaRightsStatus = 'DRAFT' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';

export interface MediaAssetDto {
  id: string;
  displayFilename: string;
  category: MediaCategory;
  declaredContentType: string;
  tags: string[];
  lifecycleState: MediaLifecycleState;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID';
  rightsStatus: MediaRightsStatus;
  ownerEmployeeId: string;
  currentVersionId?: string;
  currentRightsId?: string;
  duplicateOfAssetIds: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaVersionDto {
  id: string;
  checksumSha256: string;
  bytes: number;
  detectedContentType: string;
  durationMs?: number;
  width?: number;
  height?: number;
  detectedContainer?: string;
  validationStatus: 'VALID' | 'INVALID';
  validationErrors: string[];
}

export interface MediaRightsDto {
  id: string;
  sourceOrContributor: string;
  ownershipBasis: string;
  subjectConsentRequired: boolean;
  subjectConsentConfirmed: boolean;
  influencerRestrictions: string;
  permittedSocialChannels: string[];
  permittedTerritories: string[];
  validFrom: string;
  validUntil?: string;
  musicRights: string;
  commercialAdvertisingAllowed: boolean;
  evidenceReference: string;
  status: MediaRightsStatus;
  submittedByEmployeeId: string;
  verifiedByEmployeeId?: string;
  decisionReason?: string;
  revision: number;
}

export interface MediaDerivedDto { id: string; kind: string; contentType: string; createdAt: string }
export interface MediaJobDto { id: string; type: string; state: string; failure?: { safeMessage: string }; createdAt: string }

export interface MediaAssetDetailDto {
  asset: MediaAssetDto;
  currentVersion?: MediaVersionDto;
  currentRights?: MediaRightsDto;
  rightsHistory: MediaRightsDto[];
  derivedObjects: MediaDerivedDto[];
  jobs: MediaJobDto[];
}

export interface MediaUploadSessionDto {
  id: string;
  assetId: string;
  declaredBytes: number;
  state: 'ISSUED' | 'UPLOADING' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED' | 'FAILED';
  expiresAt: string;
  uploadedBytes: number;
  chunkSizeBytes: number;
}

interface ApiEnvelope<T> { success?: boolean; data?: T; error?: string; code?: string }

async function payload<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || body.data === undefined) {
    const error = new Error(body.error || `Media request failed (${response.status}).`) as Error & { code?: string; status?: number };
    error.code = body.code;
    error.status = response.status;
    throw error;
  }
  return body.data;
}

export async function listMediaLibrary(employeeId: string): Promise<MediaAssetDetailDto[]> {
  return payload(await fetch('/api/marketing/media/library', { headers: await authenticatedReadHeaders(employeeId) }));
}

export async function createMediaAsset(employeeId: string, file: File): Promise<MediaAssetDto> {
  const category: MediaCategory = file.type.startsWith('image/') ? 'IMAGE' : file.type.startsWith('video/') ? 'VIDEO' : 'AUDIO';
  return payload(await fetch('/api/marketing/media/assets', {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify({ displayFilename: file.name, category, declaredContentType: file.type, tags: [] }),
  }));
}

export async function createMediaUploadSession(employeeId: string, assetId: string, file: File): Promise<MediaUploadSessionDto> {
  return payload(await fetch(`/api/marketing/media/assets/${encodeURIComponent(assetId)}/upload-sessions`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify({ declaredContentType: file.type, declaredBytes: file.size }),
  }));
}

export async function getMediaUploadSession(employeeId: string, sessionId: string): Promise<MediaUploadSessionDto> {
  return payload(await fetch(`/api/marketing/media/upload-sessions/${encodeURIComponent(sessionId)}`, { headers: await authenticatedReadHeaders(employeeId) }));
}

export async function uploadMediaChunk(employeeId: string, sessionId: string, offset: number, chunk: Blob, signal: AbortSignal): Promise<MediaUploadSessionDto> {
  return payload(await fetch(`/api/marketing/media/upload-sessions/${encodeURIComponent(sessionId)}/chunks`, {
    method: 'PUT', signal,
    headers: { ...(await authenticatedReadHeaders(employeeId)), 'Content-Type': 'application/octet-stream', 'X-Upload-Offset': String(offset) },
    body: chunk,
  }));
}

export async function completeMediaUpload(employeeId: string, sessionId: string): Promise<MediaAssetDetailDto> {
  return payload(await fetch(`/api/marketing/media/upload-sessions/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: '{}',
  }));
}

export async function cancelMediaUpload(employeeId: string, sessionId: string): Promise<MediaUploadSessionDto> {
  return payload(await fetch(`/api/marketing/media/upload-sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: '{}',
  }));
}

export async function uploadMediaPreview(employeeId: string, assetId: string, preview: Blob): Promise<void> {
  await payload(await fetch(`/api/marketing/media/assets/${encodeURIComponent(assetId)}/preview`, {
    method: 'POST', headers: { ...(await authenticatedReadHeaders(employeeId)), 'Content-Type': preview.type || 'image/jpeg' }, body: preview,
  }));
}

export async function fetchMediaPreview(employeeId: string, assetId: string): Promise<Blob> {
  const response = await fetch(`/api/marketing/media/assets/${encodeURIComponent(assetId)}/preview`, { headers: await authenticatedReadHeaders(employeeId) });
  if (!response.ok) throw new Error('Preview is unavailable.');
  return response.blob();
}

export async function updateMediaMetadata(employeeId: string, asset: MediaAssetDto, tags: string[]): Promise<MediaAssetDto> {
  return payload(await fetch(`/api/marketing/media/assets/${encodeURIComponent(asset.id)}/metadata`, {
    method: 'PATCH', headers: await authenticatedMutationHeaders(employeeId),
    body: JSON.stringify({ expectedRevision: asset.revision, tags }),
  }));
}

export async function submitMediaRights(employeeId: string, assetId: string, input: Record<string, unknown>): Promise<MediaRightsDto> {
  return payload(await fetch(`/api/marketing/media/assets/${encodeURIComponent(assetId)}/rights`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify(input),
  }));
}

export async function decideMediaRights(employeeId: string, rightsId: string, decision: 'VERIFIED' | 'REJECTED', reason: string): Promise<MediaRightsDto> {
  return payload(await fetch(`/api/marketing/media/rights/${encodeURIComponent(rightsId)}/decision`, {
    method: 'POST', headers: await authenticatedMutationHeaders(employeeId), body: JSON.stringify({ decision, reason }),
  }));
}

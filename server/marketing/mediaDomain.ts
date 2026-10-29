import type { UserRole } from '../../src/types/index.js';

export const MEDIA_CATEGORIES = ['VIDEO', 'IMAGE', 'AUDIO'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

export const MEDIA_LIFECYCLE_STATES = [
  'DRAFT', 'AWAITING_UPLOAD', 'QUARANTINED', 'VALIDATING', 'READY', 'REJECTED', 'ARCHIVED', 'DELETION_PENDING', 'DELETED',
] as const;
export type MediaLifecycleState = (typeof MEDIA_LIFECYCLE_STATES)[number];

export const MEDIA_VALIDATION_STATUSES = ['PENDING', 'VALID', 'INVALID'] as const;
export type MediaValidationStatus = (typeof MEDIA_VALIDATION_STATUSES)[number];

export const MEDIA_RIGHTS_STATUSES = ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED'] as const;
export type MediaRightsStatus = (typeof MEDIA_RIGHTS_STATUSES)[number];

export const MEDIA_UPLOAD_STATES = ['ISSUED', 'UPLOADING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED'] as const;
export type MediaUploadState = (typeof MEDIA_UPLOAD_STATES)[number];

export const MEDIA_DERIVED_KINDS = ['THUMBNAIL', 'PROXY', 'WAVEFORM', 'TRANSCRIPT', 'PREVIEW', 'EXPORT'] as const;
export type MediaDerivedKind = (typeof MEDIA_DERIVED_KINDS)[number];

export const MEDIA_JOB_TYPES = ['VALIDATE', 'INSPECT_METADATA', 'GENERATE_THUMBNAIL', 'GENERATE_PROXY', 'TRANSCRIBE', 'RENDER'] as const;
export type MediaJobType = (typeof MEDIA_JOB_TYPES)[number];

export const MEDIA_JOB_STATES = ['QUEUED', 'LEASED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export type MediaJobState = (typeof MEDIA_JOB_STATES)[number];

export const MEDIA_ERROR_CLASSES = [
  'VALIDATION', 'RIGHTS_POLICY', 'UNSUPPORTED_MEDIA', 'TRANSIENT_INFRASTRUCTURE', 'RESOURCE_LIMIT', 'WORKER_DEFECT', 'UNKNOWN',
] as const;
export type MediaErrorClass = (typeof MEDIA_ERROR_CLASSES)[number];

export interface MediaActor {
  employeeId: string;
  name: string;
  role: UserRole | string;
  active: boolean;
  department?: string;
}

export interface MediaWorkerActor {
  service: 'MEDIA_WORKER';
  instanceId: string;
}

export interface MediaScope {
  ownerEmployeeId: string;
  assignedEmployeeIds: string[];
  departmentId: 'MARKETING';
}

export interface MediaAuditMetadata {
  createdAt: string;
  createdByEmployeeId: string;
  updatedAt: string;
  updatedByEmployeeId: string;
}

export interface MediaAsset extends MediaAuditMetadata {
  id: string;
  displayFilename: string;
  category: MediaCategory;
  declaredContentType: string;
  tags: string[];
  lifecycleState: MediaLifecycleState;
  validationStatus: MediaValidationStatus;
  rightsStatus: MediaRightsStatus;
  ownerEmployeeId: string;
  assignedEmployeeIds: string[];
  departmentId: 'MARKETING';
  currentVersionId?: string;
  currentRightsId?: string;
  duplicateOfAssetIds: string[];
  revision: number;
}

export interface MediaAssetVersion {
  id: string;
  assetId: string;
  version: number;
  sourceUploadSessionId: string;
  storageObjectRef: string;
  checksumSha256: string;
  bytes: number;
  declaredContentType: string;
  detectedContentType: string;
  durationMs?: number;
  width?: number;
  height?: number;
  detectedContainer?: string;
  detectedCodecs: string[];
  validationStatus: 'VALID' | 'INVALID';
  validationErrors: string[];
  createdAt: string;
  createdByService: 'MEDIA_WORKER';
}

export interface MediaRightsRecord {
  id: string;
  assetId: string;
  sourceOrContributor: string;
  ownershipBasis: 'BOOKING_BRIDGE_OWNED' | 'LICENSED' | 'CONTRIBUTOR_PERMISSION' | 'CUSTOMER_CONSENT' | 'OTHER';
  subjectConsentRequired: boolean;
  subjectConsentConfirmed: boolean;
  influencerRestrictions: string;
  permittedSocialChannels: string[];
  permittedTerritories: string[];
  validFrom: string;
  validUntil?: string;
  musicRights: 'NOT_APPLICABLE' | 'ORIGINAL' | 'LICENSED' | 'UNKNOWN';
  commercialAdvertisingAllowed: boolean;
  evidenceReference: string;
  status: MediaRightsStatus;
  submittedByEmployeeId: string;
  submittedAt: string;
  verifiedByEmployeeId?: string;
  verifiedAt?: string;
  decisionReason?: string;
  revokedAt?: string;
  revision: number;
}

export interface MediaUploadSession {
  id: string;
  assetId: string;
  ownerEmployeeId: string;
  declaredContentType: string;
  declaredBytes: number;
  storageObjectRef: string;
  state: MediaUploadState;
  issuedAt: string;
  expiresAt: string;
  issuedByEmployeeId: string;
  uploadTransport: 'FAKE' | 'LOCAL_RESUMABLE';
  uploadTarget: string;
  uploadedBytes: number;
  chunkSizeBytes: number;
  failureCode?: string;
}

export interface MediaDerivedObject {
  id: string;
  assetId: string;
  sourceVersionId: string;
  kind: MediaDerivedKind;
  storageObjectRef: string;
  checksumSha256: string;
  contentType: string;
  bytes: number;
  parametersHash: string;
  createdAt: string;
  createdByService: 'MEDIA_WORKER';
}

export interface MediaJobInputReference {
  assetId: string;
  assetVersionId?: string;
  uploadSessionId?: string;
  sourceChecksumSha256?: string;
}

export interface MediaJobFailure {
  classification: MediaErrorClass;
  code: string;
  safeMessage: string;
  retryable: boolean;
  failedAt: string;
}

export interface MediaJobResult {
  outputObjectIds: string[];
  metadata: Record<string, string | number | boolean | null>;
  completedAt: string;
}

export interface MediaProcessingJob extends MediaAuditMetadata {
  id: string;
  type: MediaJobType;
  input: MediaJobInputReference;
  normalizedParameters: Record<string, string | number | boolean | null>;
  parametersHash: string;
  idempotencyKey: string;
  state: MediaJobState;
  attempt: number;
  maxAttempts: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  retryAfter?: string;
  cancelledByEmployeeId?: string;
  cancellationReason?: string;
  failure?: MediaJobFailure;
  result?: MediaJobResult;
}

export interface MediaAuditEvent {
  id: string;
  action: string;
  entityType: 'MEDIA_ASSET' | 'MEDIA_RIGHTS' | 'MEDIA_UPLOAD_SESSION' | 'MEDIA_JOB' | 'MEDIA_ASSET_VERSION';
  entityId: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  before: unknown;
  after: unknown;
  reason: string;
  timestamp: string;
}

export class MediaDomainError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = 'MediaDomainError';
  }
}

export function asRecord(value: unknown, field = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function assertAllowedFields(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allow = new Set(allowed);
  const forbidden = Object.keys(record).filter(key => !allow.has(key));
  if (forbidden.length > 0) {
    throw new MediaDomainError(400, 'FORBIDDEN_MEDIA_FIELD', `${forbidden[0]} is server-authoritative and cannot be supplied.`);
  }
}

export function requiredText(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength || /[\u0000-\u001f]/.test(value)) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} is invalid.`);
  }
  return value.trim();
}

export function optionalText(value: unknown, field: string, maxLength = 1_000): string {
  if (value === undefined || value === null || value === '') return '';
  return requiredText(value, field, maxLength);
}

export function identifier(value: unknown, field: string): string {
  const result = requiredText(value, field, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} has an invalid format.`);
  }
  return result;
}

export function positiveInteger(value: unknown, field: string, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > max) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} is outside the allowed range.`);
  }
  return Number(value);
}

export function isoTimestamp(value: unknown, field: string): string {
  const result = requiredText(value, field, 64);
  const date = new Date(result);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} must be an ISO timestamp.`);
  }
  return result;
}

export function enumValue<T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} is invalid.`);
  }
  return value as T[number];
}

export function uniqueStrings(value: unknown, field: string, maxItems = 50, maxLength = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} must be a bounded array.`);
  }
  return [...new Set(value.map((item, index) => requiredText(item, `${field}[${index}]`, maxLength)))];
}

export function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new MediaDomainError(400, 'INVALID_MEDIA_INPUT', `${field} must be boolean.`);
  return value;
}

export function normalizedJobParameters(value: unknown): Record<string, string | number | boolean | null> {
  if (value === undefined) return {};
  const record = asRecord(value, 'parameters');
  if (Object.keys(record).length > 30) throw new MediaDomainError(400, 'INVALID_JOB_PARAMETERS', 'Too many job parameters.');
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(record).sort()) {
    if (!/^[a-z][A-Za-z0-9]{0,63}$/.test(key)) throw new MediaDomainError(400, 'INVALID_JOB_PARAMETERS', 'Job parameter key is invalid.');
    const item = record[key];
    if (item === null) normalized[key] = null;
    else if (typeof item === 'boolean') normalized[key] = item;
    else if (typeof item === 'number' && Number.isFinite(item)) normalized[key] = item;
    else if (typeof item === 'string' && item.length <= 500 && !item.includes('://') && !/[\\/]/.test(item)) normalized[key] = item;
    else throw new MediaDomainError(400, 'INVALID_JOB_PARAMETERS', `Job parameter ${key} is invalid.`);
  }
  return normalized;
}

export function requireActiveMediaActor(actor: MediaActor): void {
  if (!actor || actor.active !== true || !actor.employeeId || !actor.name) {
    throw new MediaDomainError(403, 'MEDIA_ACTOR_INVALID', 'An active employee identity is required.');
  }
}

export function rightsAreCommerciallyEligible(rights: MediaRightsRecord, now: Date): boolean {
  if (rights.status !== 'VERIFIED' || !rights.commercialAdvertisingAllowed) return false;
  if (rights.subjectConsentRequired && !rights.subjectConsentConfirmed) return false;
  if (rights.musicRights === 'UNKNOWN') return false;
  if (rights.permittedSocialChannels.length === 0 || rights.permittedTerritories.length === 0) return false;
  if (new Date(rights.validFrom).getTime() > now.getTime()) return false;
  if (rights.validUntil && new Date(rights.validUntil).getTime() <= now.getTime()) return false;
  return true;
}

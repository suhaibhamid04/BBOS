import type {
  CustomerShareHistoryItem,
  CustomerSharePublicView,
  CustomerShareStatus,
} from '../../types';

export const DEMO_CUSTOMER_SHARES_KEY = 'bb_customer_shares';

export interface DemoCustomerShareRecord extends CustomerShareHistoryItem {
  tokenHash: string;
  snapshot: CustomerSharePublicView;
  salesEmployeeId: string;
  salesTeamId?: string;
  revokedByEmployeeId?: string;
}

export class DemoCustomerShareError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DemoCustomerShareError';
  }
}

export function readDemoCustomerShares(): DemoCustomerShareRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DEMO_CUSTOMER_SHARES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDemoCustomerShares(records: DemoCustomerShareRecord[]): void {
  localStorage.setItem(DEMO_CUSTOMER_SHARES_KEY, JSON.stringify(records));
}

export function effectiveDemoShareStatus(record: DemoCustomerShareRecord, now: string): CustomerShareStatus {
  if (record.status === 'REVOKED') return 'REVOKED';
  if (record.expiresAt && record.expiresAt <= now) return 'EXPIRED';
  return 'ACTIVE';
}

export function demoShareHistory(record: DemoCustomerShareRecord, now = new Date().toISOString()): CustomerShareHistoryItem {
  const { tokenHash: _tokenHash, snapshot: _snapshot, salesEmployeeId: _owner, salesTeamId: _team, revokedByEmployeeId: _revoker, ...history } = record;
  return { ...history, status: effectiveDemoShareStatus(record, now) };
}

export function generateDemoShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach(value => { binary += String.fromCharCode(value); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export async function hashDemoShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function openDemoCustomerShare(token: string): Promise<CustomerSharePublicView> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    throw new DemoCustomerShareError('CUSTOMER_SHARE_NOT_FOUND', 'This package link could not be found.');
  }
  const tokenHash = await hashDemoShareToken(token);
  const records = readDemoCustomerShares();
  const index = records.findIndex(record => record.tokenHash === tokenHash);
  if (index < 0) throw new DemoCustomerShareError('CUSTOMER_SHARE_NOT_FOUND', 'This package link could not be found.');
  const record = records[index];
  const now = new Date().toISOString();
  const status = effectiveDemoShareStatus(record, now);
  if (status === 'REVOKED') throw new DemoCustomerShareError('CUSTOMER_SHARE_REVOKED', 'This package link is no longer available.');
  if (status === 'EXPIRED') {
    records[index] = { ...record, status: 'EXPIRED' };
    writeDemoCustomerShares(records);
    throw new DemoCustomerShareError('CUSTOMER_SHARE_EXPIRED', 'This package link has expired. Please contact Booking Bridge for an updated itinerary.');
  }
  records[index] = {
    ...record,
    firstViewedAt: record.firstViewedAt || now,
    lastViewedAt: now,
    viewCount: (record.viewCount || 0) + 1,
  };
  writeDemoCustomerShares(records);
  return JSON.parse(JSON.stringify(record.snapshot)) as CustomerSharePublicView;
}

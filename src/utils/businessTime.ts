import type { Lead } from '../types/lead';
import type { SalesQueueGroup } from '../types/leadFollowUp';

export const SALES_BUSINESS_TIME_ZONE = 'Asia/Kolkata' as const;
export const CLOSED_LEAD_STATUSES = new Set(['CONVERTED', 'DROPPED', 'CANCELLED']);

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SALES_BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function businessDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid business-time value.');
  const parts = businessDateFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${read('year')}-${read('month')}-${read('day')}`;
}

export function nextBusinessDateKey(value: Date | string): string {
  const [year, month, day] = businessDateKey(value).split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

export function classifyLeadFollowUp(
  lead: Pick<Lead, 'status' | 'nextFollowUpAt' | 'lastContactAt'>,
  now: Date,
): SalesQueueGroup | null {
  if (CLOSED_LEAD_STATUSES.has(lead.status)) return null;
  if (lead.status === 'NEW' && !lead.lastContactAt) return 'NEEDS_ATTENTION';
  if (!lead.nextFollowUpAt) return 'NEEDS_ATTENTION';
  const followUp = new Date(lead.nextFollowUpAt);
  if (Number.isNaN(followUp.getTime())) return 'NEEDS_ATTENTION';
  if (followUp.getTime() < now.getTime()) return 'OVERDUE';
  if (businessDateKey(followUp) === businessDateKey(now)) return 'TODAY';
  return 'UPCOMING';
}

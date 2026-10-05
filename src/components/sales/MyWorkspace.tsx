import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, Clock3, RefreshCw, UserRound, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getSalesQueue } from '../../services/leads/leadFollowUpApi';
import type { LeadContactOutcome, SalesQueueGroup, SalesQueueItem, SalesQueueProjection } from '../../types';
import { LeadInteractionPanel, CONTACT_OUTCOME_LABELS } from './LeadInteractionPanel';

const GROUPS: Array<{ key: SalesQueueGroup; title: string; description: string; tone: string }> = [
  { key: 'OVERDUE', title: 'Overdue', description: 'Follow-ups whose scheduled time has passed', tone: 'border-rose-200 bg-rose-50/60' },
  { key: 'TODAY', title: 'Today', description: 'Actions due today in Asia/Kolkata', tone: 'border-amber-200 bg-amber-50/50' },
  { key: 'NEEDS_ATTENTION', title: 'Needs attention', description: 'New or active Leads without a next action', tone: 'border-violet-200 bg-violet-50/40' },
  { key: 'UPCOMING', title: 'Upcoming', description: 'Future follow-ups already scheduled', tone: 'border-slate-200 bg-white' },
];

const QUICK_ACTIONS: Array<{ outcome: LeadContactOutcome; label: string }> = [
  { outcome: 'NO_ANSWER', label: 'No Answer' },
  { outcome: 'CALLBACK_REQUESTED', label: 'Callback' },
  { outcome: 'INTERESTED', label: 'Interested' },
  { outcome: 'NEGOTIATING', label: 'Negotiating' },
  { outcome: 'NOT_INTERESTED', label: 'Not Interested' },
];

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled';
}

function QueueCard({ item, onNavigate, onAction }: {
  key?: React.Key;
  item: SalesQueueItem;
  onNavigate: (section: string, id?: string) => void;
  onAction: (item: SalesQueueItem, outcome: LeadContactOutcome) => void;
}) {
  return (
    <article data-testid={`sales-queue-lead-${item.leadId}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onNavigate('lead-detail', item.leadId)} className="font-bold text-slate-900 hover:text-[#7056EE]">{item.customerName}</button>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{item.statusLabel}</span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-[#7056EE]">{item.priority}</span>
          </div>
          <p className="text-xs text-slate-600">{item.destination || 'Destination not set'} · {item.adults ?? item.travelerCount ?? 0} adults · {item.children} children</p>
          <div className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
            <p><span className="font-semibold text-slate-700">Travel:</span> {item.travelStartDate ? new Date(item.travelStartDate).toLocaleDateString('en-IN') : 'Dates TBD'}{item.nights ? ` · ${item.nights} nights` : ''}</p>
            <p><span className="font-semibold text-slate-700">Owner:</span> {item.assignedEmployeeName || item.assignedEmployeeId || 'Assignment required'}</p>
            <p><span className="font-semibold text-slate-700">Last:</span> {item.lastContactOutcome ? CONTACT_OUTCOME_LABELS[item.lastContactOutcome] : 'No contact'}{item.lastContactAt ? ` · ${formatDateTime(item.lastContactAt)}` : ''}</p>
            <p data-testid={`queue-next-${item.leadId}`}><span className="font-semibold text-slate-700">Next:</span> {formatDateTime(item.nextFollowUpAt)}</p>
          </div>
          {item.quoteContext && <p data-testid={`quote-aging-${item.leadId}`} className="text-xs font-semibold text-amber-700">{item.quoteContext.label}</p>}
          {item.secondaryContext.length > 0 && <p className="text-[11px] text-slate-500">Also: {item.secondaryContext.join(' · ')}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {QUICK_ACTIONS.map(action => (
            <button key={action.outcome} data-testid={`queue-${action.outcome.toLowerCase().replaceAll('_', '-')}-${item.leadId}`} type="button" onClick={() => onAction(item, action.outcome)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-[#7056EE] hover:text-[#7056EE]">{action.label}</button>
          ))}
          <button type="button" onClick={() => onNavigate('lead-detail', item.leadId)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white">Open Lead</button>
        </div>
      </div>
    </article>
  );
}

export const MyWorkspaceView: React.FC<{ onNavigate: (section: string, id?: string) => void }> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [queue, setQueue] = useState<SalesQueueProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ item: SalesQueueItem; outcome: LeadContactOutcome } | null>(null);

  const loadQueue = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setQueue(await getSalesQueue(currentUser.employeeId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Sales queue could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser.employeeId]);

  useEffect(() => {
    void loadQueue();
    const interval = window.setInterval(() => void loadQueue(true), 60_000);
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void loadQueue(true);
    };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [loadQueue]);

  const total = useMemo(() => queue ? Object.values(queue.counts).reduce<number>((sum, count) => sum + Number(count), 0) : 0, [queue]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Sales Queue</h1>
          <p className="mt-1 text-sm text-slate-500">{currentUser.name} · {total} active Lead actions · Asia/Kolkata</p>
        </div>
        <button type="button" onClick={() => void loadQueue(true)} disabled={refreshing} className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh</button>
      </header>

      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {error}</span>
          <button type="button" onClick={() => void loadQueue()} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white">Retry</button>
        </div>
      )}

      {loading && !queue ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin" /> Loading authoritative Sales queue…</div>
      ) : (
        <div className="space-y-5">
          {GROUPS.map(group => {
            const items: SalesQueueItem[] = queue?.groups[group.key] || [];
            return (
              <section key={group.key} data-testid={`sales-queue-group-${group.key.toLowerCase().replaceAll('_', '-')}`} className={`rounded-2xl border p-4 ${group.tone}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">{group.key === 'OVERDUE' ? <Clock3 className="h-4 w-4 text-rose-600" /> : group.key === 'NEEDS_ATTENTION' ? <UserRound className="h-4 w-4 text-[#7056EE]" /> : <CalendarClock className="h-4 w-4 text-amber-600" />}{group.title}<span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{items.length}</span></h2><p className="mt-1 text-xs text-slate-500">{group.description}</p></div>
                </div>
                <div className="space-y-3">
                  {items.map(item => <QueueCard key={item.leadId} item={item} onNavigate={onNavigate} onAction={(target, outcome) => setSelected({ item: target, outcome })} />)}
                  {items.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-xs text-slate-500">No Leads in this queue.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-2 shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2"><div><p className="text-sm font-bold text-slate-900">{selected.item.customerName}</p><p className="text-xs text-slate-500">{selected.item.destination}</p></div><button type="button" aria-label="Close" onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <LeadInteractionPanel
              title="Record interaction"
              initialOutcome={selected.outcome}
              lead={{ id: selected.item.leadId, status: selected.item.status, updatedAt: selected.item.updatedAt, lastContactAt: selected.item.lastContactAt, lastContactOutcome: selected.item.lastContactOutcome, nextFollowUpAt: selected.item.nextFollowUpAt }}
              onRecorded={async () => { setSelected(null); await loadQueue(true); }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

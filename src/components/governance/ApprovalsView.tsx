import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock3, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { decideApprovalInboxItem, fetchApprovalInbox } from '../../services/approvals/approvalInboxApi';
import type { ApprovalInboxItem, ApprovalInboxResponse } from '../../types/approvalInbox';
import type { NavSectionKey } from '../layout/Sidebar';

interface ApprovalsViewProps {
  onNavigate?: (section: NavSectionKey, targetId?: string) => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function money(amountMinor: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amountMinor / 100);
}

const statusClass: Record<ApprovalInboxItem['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-900',
  REVIEW_REQUIRED: 'bg-violet-100 text-violet-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
};

function ApprovalCard({ item, deciding, onApprove, onReject, onOpen }: {
  key?: React.Key;
  item: ApprovalInboxItem;
  deciding: boolean;
  onApprove: () => void;
  onReject: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-extrabold tracking-wide ${statusClass[item.status]}`}>{item.status.replaceAll('_', ' ')}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{item.type.replaceAll('_', ' ')}</span>
            <span className="text-[10px] font-semibold text-slate-500">{item.priority}</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
          <p className="text-xs leading-relaxed text-slate-600">{item.summary}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
            {item.bookingReference && <span>Booking: <strong>{item.bookingReference}</strong></span>}
            {item.quoteReference && <span>{item.quoteReference}</span>}
            <span>Requester: <strong>{item.requestedByEmployeeId}</strong></span>
            <span>{formatDate(item.requestedAt)}</span>
            {item.amountMinor !== undefined && <span className="font-bold text-slate-800">{money(item.amountMinor, item.currency)}</span>}
          </div>
          {item.context && Object.keys(item.context).length > 0 && (
            <div className="grid gap-2 rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 sm:grid-cols-2">
              {item.context.customerName && <span>Customer: <strong>{item.context.customerName}</strong></span>}
              {item.context.propertyName && <span>Property: <strong>{item.context.propertyName}</strong></span>}
              {item.context.frozenSupplierUnitRate !== undefined && <span>Frozen rate: <strong>{item.context.frozenSupplierUnitRate}</strong></span>}
              {item.context.confirmedSupplierUnitRate !== undefined && <span>Confirmed rate: <strong>{item.context.confirmedSupplierUnitRate}</strong></span>}
              {item.context.difference !== undefined && <span>Difference: <strong>{item.context.difference}</strong></span>}
              {item.context.changeType && <span>Change: <strong>{item.context.changeType.replaceAll('_', ' ')}</strong></span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-3.5 w-3.5" /> Open record</button>
          {item.actionable ? <>
            <button type="button" disabled={deciding} onClick={onReject} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button>
            <button type="button" disabled={deciding} onClick={onApprove} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{deciding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve</button>
          </> : item.status === 'PENDING' || item.status === 'REVIEW_REQUIRED' ? (
            <span className="inline-flex items-center rounded-lg bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700">Review in source workflow</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const [inbox, setInbox] = useState<ApprovalInboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectingItem, setRejectingItem] = useState<ApprovalInboxItem | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setInbox(await fetchApprovalInbox(currentUser.employeeId)); }
    catch (loadError: any) { setError(loadError?.message || 'Unable to load Needs Attention.'); }
    finally { setLoading(false); }
  }, [currentUser.employeeId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: ApprovalInboxItem, decision: 'APPROVED' | 'REJECTED', reason?: string) => {
    setDecidingId(item.id);
    setError('');
    try {
      await decideApprovalInboxItem(item.id, {
        decision,
        expectedUpdatedAt: item.sourceVersion,
        ...(reason?.trim() ? { rejectionReason: reason.trim() } : {}),
      }, currentUser.employeeId);
      setRejectingItem(null);
      setRejectionReason('');
      await load();
    } catch (decisionError: any) {
      setError(decisionError?.message || 'Unable to record the decision. Reload and try again.');
    } finally { setDecidingId(null); }
  };

  const sections: Array<{ title: string; description: string; items: ApprovalInboxItem[] }> = inbox ? [
    { title: 'Awaiting My Decision', description: 'Items that your current role can decide through an authoritative workflow.', items: inbox.awaitingMyDecision },
    { title: 'Submitted by Me', description: 'Status of exceptions you submitted or escalated.', items: inbox.submittedByMe },
    { title: 'Recently Decided', description: 'Recently completed decisions visible within your scope.', items: inbox.recentlyDecided },
    ...(inbox.allPending ? [{ title: 'All Pending', description: 'Company-wide pending and review-required exceptions.', items: inbox.allPending }] : []),
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-[#7056EE]" /><h2 className="text-xl font-bold text-slate-900">Needs Attention</h2></div><p className="mt-1 text-xs text-slate-500">One role-scoped view of business exceptions. Source workflows remain authoritative.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
      </div>

      {inbox && <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-2xl font-bold text-slate-900">{inbox.summary.pendingCount}</div><div className="text-xs text-slate-500">Pending in my scope</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-2xl font-bold text-rose-700">{inbox.summary.highPriorityCount}</div><div className="text-xs text-slate-500">High or critical</div></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-sm font-bold text-slate-900"><Clock3 className="h-4 w-4" /> Oldest pending</div><div className="mt-1 text-xs text-slate-500">{inbox.summary.oldestPendingAt ? formatDate(inbox.summary.oldestPendingAt) : 'None'}</div></div>
      </div>}

      {error && <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertTriangle className="h-4 w-4" />{error}</div>}
      {loading && !inbox ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading scoped approvals…</div> : (
        <div className="space-y-7">{sections.map((section) => <section key={section.title} className="space-y-3">
          <div><h3 className="text-sm font-bold text-slate-900">{section.title}</h3><p className="text-xs text-slate-500">{section.description}</p></div>
          {section.items.length ? section.items.map((item) => <ApprovalCard key={`${section.title}-${item.id}`} item={item} deciding={decidingId === item.id} onApprove={() => void decide(item, 'APPROVED')} onReject={() => setRejectingItem(item)} onOpen={() => onNavigate?.(item.route.section, item.route.entityId)} />) : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-5 text-center text-xs text-slate-400">Nothing in this section.</div>}
        </section>)}</div>
      )}

      {rejectingItem && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
        <div><h3 className="text-sm font-bold text-slate-900">Reject emergency spend</h3><p className="mt-1 text-xs text-slate-500">A reason is required and will be recorded by the domain workflow.</p></div>
        <textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={4} maxLength={1000} className="w-full rounded-xl border border-slate-300 p-3 text-xs" placeholder="Reason for rejection" />
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setRejectingItem(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600">Cancel</button><button type="button" disabled={!rejectionReason.trim() || decidingId === rejectingItem.id} onClick={() => void decide(rejectingItem, 'REJECTED', rejectionReason)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><X className="h-3.5 w-3.5" /> Reject</button></div>
      </div></div>}
    </div>
  );
};

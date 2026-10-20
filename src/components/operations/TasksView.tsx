import React, { useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, Search } from 'lucide-react';
import { useData } from '../../context/DataContext';

export const TasksView: React.FC = () => {
  const { leads } = useData();
  const [query, setQuery] = useState('');
  const followUps = useMemo(() => leads
    .filter(lead => Boolean(lead.nextFollowUpAt) && !['CONVERTED', 'DROPPED', 'CANCELLED'].includes(lead.status))
    .filter(lead => !query.trim() || [lead.customerName, lead.customerPhone, lead.destination].some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())))
    .sort((left, right) => String(left.nextFollowUpAt).localeCompare(String(right.nextFollowUpAt))), [leads, query]);

  return <div id="tasks-view" className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold text-slate-900">Lead Follow-ups</h2><span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{followUps.length} scheduled</span></div><p className="mt-1 text-xs text-slate-500">Authoritative reminders from each Lead’s M3 follow-up state. Record outcomes in the Sales queue.</p></div><a href="?view=sales-workspace" className="flex items-center gap-1.5 rounded-xl bg-[#7056EE] px-4 py-2 text-xs font-bold text-white">Open Sales Queue <ExternalLink className="h-3.5 w-3.5"/></a></header>
    <div className="relative max-w-md"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search follow-ups…" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm"/></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{followUps.length ? followUps.map(lead => { const overdue = new Date(lead.nextFollowUpAt!).getTime() < Date.now(); return <article key={lead.id} data-testid={`follow-up-${lead.id}`} className="flex items-start justify-between gap-4 border-b border-slate-100 p-4 last:border-0"><div className="flex items-start gap-3"><CalendarClock className={`mt-0.5 h-5 w-5 ${overdue ? 'text-rose-600' : 'text-amber-600'}`}/><div><strong className="text-sm text-slate-900">{lead.customerName}</strong><p className="mt-1 text-xs text-slate-600">{lead.destination} · {lead.status.replaceAll('_', ' ')} · {lead.customerPhone}</p><p className={`mt-1 text-xs font-semibold ${overdue ? 'text-rose-700' : 'text-slate-500'}`}>{overdue ? 'Overdue · ' : ''}{new Date(lead.nextFollowUpAt!).toLocaleString('en-IN')}</p></div></div><a href={`?view=lead-detail&id=${encodeURIComponent(lead.id)}`} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-[#7056EE]">Open Lead</a></article>; }) : <div className="p-10 text-center text-sm text-slate-400">No scheduled follow-ups in your authorized Lead scope.</div>}</div>
  </div>;
};

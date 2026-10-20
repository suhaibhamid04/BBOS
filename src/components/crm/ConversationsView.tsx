import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, MessageSquare, Search, Send, Sparkles } from 'lucide-react';
import { useData } from '../../context/DataContext';
import type { ConversationTimelineEntry, WhatsAppConversationContext } from '../../types';

function idempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const ConversationsView: React.FC = () => {
  const { leads, loadLeadConversation, loadLeadWhatsAppContext, sendLeadWhatsApp } = useData();
  const [activeLeadId, setActiveLeadId] = useState('');
  const [entries, setEntries] = useState<ConversationTimelineEntry[]>([]);
  const [whatsApp, setWhatsApp] = useState<WhatsAppConversationContext | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const visibleLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return leads;
    return leads.filter(lead => [lead.customerName, lead.customerPhone, lead.destination]
      .some(value => String(value || '').toLowerCase().includes(query)));
  }, [leads, searchQuery]);
  const activeLead = leads.find(lead => lead.id === activeLeadId);

  useEffect(() => {
    if (!activeLeadId && leads[0]) setActiveLeadId(leads[0].id);
    if (activeLeadId && !leads.some(lead => lead.id === activeLeadId)) setActiveLeadId(leads[0]?.id || '');
  }, [activeLeadId, leads]);

  useEffect(() => {
    if (!activeLeadId) {
      setEntries([]);
      setWhatsApp(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      loadLeadConversation(activeLeadId, { limit: 100 }),
      loadLeadWhatsAppContext(activeLeadId),
    ]).then(([timeline, context]) => {
      if (!active) return;
      setEntries(timeline.entries);
      setWhatsApp(context);
    }).catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : 'Conversation could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeLeadId, loadLeadConversation, loadLeadWhatsAppContext]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = inputText.trim();
    if (!body || !activeLeadId) return;
    setSending(true);
    setError('');
    try {
      const result = await sendLeadWhatsApp(activeLeadId, {
        idempotencyKey: idempotencyKey('conversation'), messageType: 'TEXT', body,
      });
      setEntries(previous => [...previous.filter(entry => entry.entryId !== result.entry.entryId), result.entry]);
      setInputText('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Message could not be sent.');
    } finally { setSending(false); }
  };

  const suggestReply = () => {
    if (!activeLead) return;
    setInputText(`Hello ${activeLead.customerName}, I am following up on your ${activeLead.destination} enquiry. Would you like me to help with the next step?`);
  };

  return <div id="conversations-view" className="flex h-[calc(100vh-140px)] flex-col space-y-4">
    <header><div className="flex items-center gap-2"><h2 className="text-xl font-bold text-slate-900">Lead Conversations</h2><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">M6 Timeline</span></div><p className="text-xs text-slate-500">Scoped customer communication and business events for Leads you are authorized to access.</p></header>
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <aside className="flex w-80 flex-col border-r border-slate-200 bg-slate-50/50"><div className="border-b border-slate-200 bg-white p-3"><div className="relative"><Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400"/><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search scoped Leads…" className="w-full rounded-xl border border-slate-300 py-1.5 pl-8 pr-3 text-xs"/></div></div><div className="flex-1 space-y-1 overflow-y-auto p-1.5">
        {visibleLeads.map(lead => <button key={lead.id} data-testid={`conversation-lead-${lead.id}`} type="button" onClick={() => setActiveLeadId(lead.id)} className={`w-full rounded-xl border p-3 text-left ${lead.id === activeLeadId ? 'border-[#7056EE]/40 bg-[#7056EE]/10' : 'border-transparent hover:bg-slate-100'}`}><div className="flex justify-between gap-2"><strong className="truncate text-xs text-slate-900">{lead.customerName}</strong><span className="text-[10px] text-slate-400">{new Date(lead.lastContactAt || lead.updatedAt).toLocaleDateString()}</span></div><p className="mt-1 truncate text-[11px] text-slate-500">{lead.destination} · {lead.status.replaceAll('_', ' ')}</p></button>)}
        {!visibleLeads.length && <p className="p-6 text-center text-xs text-slate-400">No scoped Lead conversations.</p>}
      </div></aside>
      {activeLead ? <section className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 p-4"><div><strong className="text-sm text-slate-900">{activeLead.customerName}</strong><p className="text-[11px] text-slate-500">{activeLead.customerPhone} · {activeLead.destination} · Lead {activeLead.id}</p></div><button type="button" onClick={suggestReply} className="flex items-center gap-1.5 rounded-xl border border-[#7056EE]/20 bg-[#7056EE]/10 px-3 py-1.5 text-xs font-semibold text-[#7056EE]"><Sparkles className="h-3.5 w-3.5"/>Suggest reply</button></div>
        {error && <div role="alert" className="m-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertCircle className="h-4 w-4"/>{error}</div>}
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/30 p-4">{loading ? <Loader2 className="mx-auto mt-12 h-5 w-5 animate-spin text-[#7056EE]"/> : entries.map(entry => { const inbound = entry.direction === 'INBOUND'; return <article key={entry.entryId} data-testid={`conversation-entry-${entry.entryId}`} className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[80%] rounded-2xl p-3 text-xs shadow-sm ${inbound ? 'border border-slate-200 bg-white text-slate-900' : entry.visibility === 'INTERNAL_ONLY' ? 'bg-amber-100 text-amber-950' : 'bg-slate-900 text-white'}`}><div className="mb-1 flex justify-between gap-4 text-[10px] opacity-70"><strong>{entry.actorName}</strong><span>{new Date(entry.occurredAt).toLocaleString()}</span></div><strong className="block text-[10px] uppercase tracking-wide opacity-70">{entry.title}</strong>{entry.body && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{entry.body}</p>}{entry.providerStatus && <p className="mt-1 text-[9px] font-bold uppercase opacity-60">{entry.providerStatus}</p>}</div></article>; })}{!loading && !entries.length && <div className="flex h-full items-center justify-center text-xs text-slate-400"><MessageSquare className="mr-2 h-4 w-4"/>No conversation entries yet.</div>}</div>
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"><input data-testid="conversation-input" value={inputText} onChange={event => setInputText(event.target.value)} disabled={!whatsApp?.providerAvailable || sending} placeholder={whatsApp?.providerAvailable ? `Message ${activeLead.customerName} on WhatsApp…` : 'WhatsApp provider is unavailable'} className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:bg-slate-100"/><button data-testid="send-message-button" disabled={!whatsApp?.providerAvailable || sending || !inputText.trim()} className="rounded-xl bg-[#7056EE] p-2.5 text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}</button></form>
      </section> : <div className="flex flex-1 items-center justify-center text-xs text-slate-400">Select a scoped Lead conversation.</div>}
    </div>
  </div>;
};

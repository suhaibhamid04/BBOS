import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCheck, FileText, Link2, Loader2, MessageCircle, NotebookPen, PhoneCall, RefreshCw, Send } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type {
  ConversationChannel,
  ConversationDirection,
  ConversationEntryCreateInput,
  ConversationTimelineEntry,
  LeadContactOutcome,
  UnresolvedWhatsAppMessage,
  WhatsAppConversationContext,
  WhatsAppMessageType,
} from '../../types';

interface Props { leadId: string }

type ComposerMode = 'INTERNAL_NOTE' | 'MANUAL_CONTACT' | 'PHONE_CALL';

const outcomeOptions: Array<{ value: LeadContactOutcome; label: string }> = [
  { value: 'NO_ANSWER', label: 'No answer' },
  { value: 'CALLBACK_REQUESTED', label: 'Callback requested' },
  { value: 'INTERESTED', label: 'Customer interested' },
  { value: 'QUOTE_REQUESTED', label: 'Quote requested' },
  { value: 'NEGOTIATING', label: 'Negotiating' },
  { value: 'ADVANCE_PROMISED', label: 'Advance promised' },
  { value: 'NOT_INTERESTED', label: 'Not interested' },
];

function newKey(): string {
  return `conversation-${Date.now()}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function dayLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const localKey = (item: Date) => `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  if (localKey(date) === localKey(today)) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (localKey(date) === localKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function channelLabel(entry: ConversationTimelineEntry): string {
  if (entry.channel === 'MANUAL') return entry.metadata?.manualLog ? 'Other · Manual log' : 'Manual';
  if (entry.channel === 'SYSTEM') return 'System';
  const label = entry.channel === 'WHATSAPP' ? 'WhatsApp' : entry.channel.charAt(0) + entry.channel.slice(1).toLowerCase();
  return entry.metadata?.manualLog ? `${label} · Manual log` : label;
}

function entryStyle(entry: ConversationTimelineEntry): string {
  if (entry.visibility === 'INTERNAL_ONLY') return 'border-amber-200 bg-amber-50';
  if (entry.actorType === 'CUSTOMER') return 'border-blue-200 bg-blue-50';
  if (entry.actorType === 'SYSTEM') return 'border-slate-200 bg-slate-50';
  return 'border-violet-200 bg-violet-50';
}

function providerStatusLabel(entry: ConversationTimelineEntry): string | undefined {
  if (entry.channel !== 'WHATSAPP' || entry.direction !== 'OUTBOUND' || !entry.providerStatus) return undefined;
  const labels = { QUEUED: 'Queued', SENDING: 'Sending', SENT: 'Sent', DELIVERED: 'Delivered', READ: 'Read', FAILED: 'Failed to send' };
  return labels[entry.providerStatus];
}

export const LeadConversationTab: React.FC<Props> = ({ leadId }) => {
  const {
    loadLeadConversation, addLeadConversationEntry, loadLeadWhatsAppContext, sendLeadWhatsApp,
    retryLeadWhatsApp, listUnresolvedWhatsApp, linkUnresolvedWhatsApp, createLead,
  } = useData();
  const { currentUser } = useAuth();
  const [entries, setEntries] = useState<ConversationTimelineEntry[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [composer, setComposer] = useState<ComposerMode>();
  const [body, setBody] = useState('');
  const [channel, setChannel] = useState<Exclude<ConversationChannel, 'SYSTEM'>>('WHATSAPP');
  const [direction, setDirection] = useState<Extract<ConversationDirection, 'INBOUND' | 'OUTBOUND'>>('INBOUND');
  const [outcome, setOutcome] = useState<LeadContactOutcome>('INTERESTED');
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppConversationContext>();
  const [whatsAppLoading, setWhatsAppLoading] = useState(true);
  const [whatsAppBody, setWhatsAppBody] = useState('');
  const [whatsAppType, setWhatsAppType] = useState<WhatsAppMessageType>('TEXT');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState('');
  const [whatsAppKey, setWhatsAppKey] = useState(newKey);
  const [unresolved, setUnresolved] = useState<UnresolvedWhatsAppMessage[]>([]);
  const [unresolvedError, setUnresolvedError] = useState('');
  const canReviewUnresolved = currentUser.role === 'Founder' || currentUser.role === 'Admin';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadLeadConversation(leadId, { limit: 30 })
      .then(page => {
        if (!active) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
        setHasMore(page.hasMore && Boolean(page.nextCursor));
      })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Conversation could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [leadId, reload]);

  useEffect(() => {
    let active = true;
    setWhatsAppLoading(true);
    setWhatsAppError('');
    void loadLeadWhatsAppContext(leadId)
      .then(context => {
        if (!active) return;
        setWhatsAppContext(context);
        const first = context.approvedTemplates[0];
        if (first) setSelectedTemplate(current => current || first.name);
        if (!context.sessionWindowOpen && !context.demoProvider && first) setWhatsAppType('TEMPLATE');
      })
      .catch(caught => { if (active) setWhatsAppError(caught instanceof Error ? caught.message : 'WhatsApp is unavailable.'); })
      .finally(() => { if (active) setWhatsAppLoading(false); });
    return () => { active = false; };
  }, [leadId, reload]);

  useEffect(() => {
    if (!canReviewUnresolved) return;
    let active = true;
    setUnresolvedError('');
    void listUnresolvedWhatsApp()
      .then(items => { if (active) setUnresolved(items); })
      .catch(caught => { if (active) setUnresolvedError(caught instanceof Error ? caught.message : 'Unmatched WhatsApp could not be loaded.'); });
    return () => { active = false; };
  }, [canReviewUnresolved, reload]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ConversationTimelineEntry[]>();
    for (const entry of entries) groups.set(dayLabel(entry.occurredAt), [...(groups.get(dayLabel(entry.occurredAt)) || []), entry]);
    return [...groups.entries()];
  }, [entries]);

  const openComposer = (mode: ComposerMode) => {
    setComposer(mode);
    setBody('');
    setComposerError('');
    setIdempotencyKey(newKey());
    if (mode === 'PHONE_CALL') setChannel('PHONE');
    else if (mode === 'MANUAL_CONTACT') setChannel('WHATSAPP');
  };

  const save = async () => {
    if (!composer) return;
    setSaving(true);
    setComposerError('');
    try {
      const input: ConversationEntryCreateInput = composer === 'INTERNAL_NOTE'
        ? { kind: 'INTERNAL_NOTE', body, idempotencyKey }
        : {
            kind: 'MANUAL_CONTACT', body, idempotencyKey,
            channel: composer === 'PHONE_CALL' ? 'PHONE' : channel,
            direction,
            ...(composer === 'PHONE_CALL' ? { outcome } : {}),
          };
      const result = await addLeadConversationEntry(leadId, input);
      setEntries(current => [result.entry, ...current.filter(entry => entry.entryId !== result.entry.entryId)]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.entryId.localeCompare(left.entryId)));
      setComposer(undefined);
      setBody('');
    } catch (caught) {
      setComposerError(caught instanceof Error ? caught.message : 'Conversation entry could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const upsertEntry = (entry: ConversationTimelineEntry) => {
    setEntries(current => [entry, ...current.filter(item => item.entryId !== entry.entryId)]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.entryId.localeCompare(left.entryId)));
  };

  const sendWhatsApp = async () => {
    if (!whatsAppBody.trim() || sendingWhatsApp) return;
    setSendingWhatsApp(true);
    setWhatsAppError('');
    try {
      const template = whatsAppContext?.approvedTemplates.find(item => item.name === selectedTemplate);
      const result = await sendLeadWhatsApp(leadId, {
        idempotencyKey: whatsAppKey, messageType: whatsAppType, body: whatsAppBody.trim(),
        ...(whatsAppType === 'TEMPLATE' && template ? { templateName: template.name, languageCode: template.languageCode } : {}),
      });
      upsertEntry(result.entry);
      if (result.entry.providerStatus === 'FAILED') {
        setWhatsAppError(result.entry.metadata?.failureMessage || 'WhatsApp failed to send. The attempt remains in the timeline.');
      } else {
        setWhatsAppBody('');
        setWhatsAppKey(newKey());
      }
    } catch (caught) {
      setWhatsAppError(caught instanceof Error ? caught.message : 'WhatsApp could not be sent.');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const retryWhatsApp = async (entry: ConversationTimelineEntry) => {
    setWhatsAppError('');
    try {
      const result = await retryLeadWhatsApp(leadId, entry.entryId, newKey());
      upsertEntry(result.entry);
      if (result.entry.providerStatus === 'FAILED') setWhatsAppError(result.entry.metadata?.failureMessage || 'WhatsApp retry failed.');
    } catch (caught) {
      setWhatsAppError(caught instanceof Error ? caught.message : 'WhatsApp retry could not be completed.');
    }
  };

  const linkUnmatched = async (item: UnresolvedWhatsAppMessage) => {
    setUnresolvedError('');
    try {
      const entry = await linkUnresolvedWhatsApp(item.unresolvedId, leadId);
      upsertEntry(entry);
      setUnresolved(current => current.filter(candidate => candidate.unresolvedId !== item.unresolvedId));
    } catch (caught) {
      setUnresolvedError(caught instanceof Error ? caught.message : 'Message could not be linked.');
    }
  };

  const createLeadFromUnmatched = async (item: UnresolvedWhatsAppMessage) => {
    setUnresolvedError('');
    try {
      const lead = await createLead({
        creationRequestId: `whatsapp-${item.unresolvedId}`, customerName: item.customerName || 'WhatsApp customer',
        customerPhone: `+${item.customerPhone}`, destination: 'General', sourceId: 'WHATSAPP', notes: 'Created from an unmatched provider-confirmed WhatsApp message.',
      });
      await linkUnresolvedWhatsApp(item.unresolvedId, lead.id);
      setUnresolved(current => current.filter(candidate => candidate.unresolvedId !== item.unresolvedId));
    } catch (caught) {
      setUnresolvedError(caught instanceof Error ? caught.message : 'Lead could not be created from WhatsApp.');
    }
  };

  const loadEarlier = async () => {
    if (!cursor) return;
    setLoadingEarlier(true);
    setError('');
    try {
      const page = await loadLeadConversation(leadId, { limit: 30, cursor });
      setEntries(current => [...new Map([...current, ...page.entries].map(entry => [entry.entryId, entry])).values()]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.entryId.localeCompare(left.entryId)));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore && Boolean(page.nextCursor));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Earlier conversation could not be loaded.');
    } finally {
      setLoadingEarlier(false);
    }
  };

  if (loading) return <div data-testid="conversation-loading" className="flex min-h-60 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading conversation…</div>;
  if (error && entries.length === 0) return <div data-testid="conversation-error" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"><AlertCircle className="mx-auto mb-2 h-6 w-6" /><p className="text-sm font-bold">Conversation could not be loaded</p><p className="mt-1 text-xs">{error}</p><button type="button" onClick={() => setReload(value => value + 1)} className="mx-auto mt-4 flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white"><RefreshCw className="h-4 w-4" /> Retry</button></div>;

  return <div data-testid="lead-conversation-tab" className="mx-auto max-w-4xl space-y-5">
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-base font-bold text-slate-900">Customer conversation</h2><p className="text-xs text-slate-500">Relationship history and manually logged contact. Provider delivery is shown only when confirmed.</p></div>
        <div className="flex flex-wrap gap-2">
          <button data-testid="add-internal-note" type="button" onClick={() => openComposer('INTERNAL_NOTE')} className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><NotebookPen className="h-4 w-4" /> Add Internal Note</button>
          <button data-testid="log-customer-contact" type="button" onClick={() => openComposer('MANUAL_CONTACT')} className="flex items-center gap-1.5 rounded-lg bg-[#7056EE] px-3 py-2 text-xs font-bold text-white"><MessageCircle className="h-4 w-4" /> Log Customer Contact</button>
          <button data-testid="record-phone-call" type="button" onClick={() => openComposer('PHONE_CALL')} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><PhoneCall className="h-4 w-4" /> Record Call</button>
        </div>
      </div>
      {composer && <div data-testid="conversation-composer" className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-slate-900">{composer === 'INTERNAL_NOTE' ? 'Add internal note' : composer === 'PHONE_CALL' ? 'Record phone call' : 'Log customer contact'}</h3><span className="text-[11px] font-semibold text-slate-500">{composer === 'INTERNAL_NOTE' ? 'Never customer-facing' : 'Manual log — not provider verified'}</span></div>
        {composer !== 'INTERNAL_NOTE' && <div className="grid gap-3 sm:grid-cols-2">
          {composer === 'MANUAL_CONTACT' && <label className="text-xs font-semibold text-slate-700">Channel<select data-testid="contact-channel" value={channel} onChange={event => setChannel(event.target.value as typeof channel)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option><option value="PHONE">Phone</option><option value="MANUAL">Other</option></select></label>}
          <label className="text-xs font-semibold text-slate-700">Direction<select data-testid="contact-direction" value={direction} onChange={event => setDirection(event.target.value as typeof direction)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="INBOUND">Customer → Us</option><option value="OUTBOUND">Us → Customer</option></select></label>
          {composer === 'PHONE_CALL' && <label className="text-xs font-semibold text-slate-700">Outcome<select data-testid="call-outcome" value={outcome} onChange={event => setOutcome(event.target.value as LeadContactOutcome)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{outcomeOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
        </div>}
        <label className="block text-xs font-semibold text-slate-700">{composer === 'INTERNAL_NOTE' ? 'Note' : 'Summary'}<textarea data-testid="conversation-entry-body" value={body} onChange={event => setBody(event.target.value)} rows={3} maxLength={4000} placeholder={composer === 'INTERNAL_NOTE' ? 'Customer preferences or internal Sales context…' : 'What happened in this customer contact?'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        {composerError && <p role="alert" className="text-xs font-semibold text-rose-700">{composerError}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setComposer(undefined)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-600">Cancel</button><button data-testid="save-conversation-entry" type="button" disabled={saving || !body.trim()} onClick={() => void save()} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save entry'}</button></div>
      </div>}
    </div>

    <section data-testid="whatsapp-composer" className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><MessageCircle className="h-4 w-4 text-emerald-700" /> WhatsApp</h3><p data-testid="whatsapp-recipient" className="mt-1 text-xs text-slate-500">{whatsAppLoading ? 'Loading customer phone…' : whatsAppContext?.customerPhone ? `Customer phone: ${whatsAppContext.customerPhone}` : 'No valid customer phone available.'}</p></div>
        {whatsAppContext?.demoProvider && <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-800">Demo provider simulation</span>}
      </div>
      {!whatsAppLoading && whatsAppContext && !whatsAppContext.providerAvailable && <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Meta WhatsApp is not configured for this environment.</p>}
      {whatsAppContext && !whatsAppContext.sessionWindowOpen && !whatsAppContext.demoProvider && <p data-testid="whatsapp-template-required" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">A WhatsApp template is required to start or resume this conversation.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-[10rem_1fr]">
        <label className="text-xs font-semibold text-slate-700">Message type<select data-testid="whatsapp-message-type" value={whatsAppType} onChange={event => setWhatsAppType(event.target.value as WhatsAppMessageType)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="TEXT" disabled={Boolean(whatsAppContext && !whatsAppContext.sessionWindowOpen && !whatsAppContext.demoProvider)}>Free-form text</option><option value="TEMPLATE" disabled={!whatsAppContext?.approvedTemplates.length}>Approved template</option></select></label>
        {whatsAppType === 'TEMPLATE' && <label className="text-xs font-semibold text-slate-700">Approved template<select data-testid="whatsapp-template" value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{whatsAppContext?.approvedTemplates.map(template => <option key={`${template.name}:${template.languageCode}`} value={template.name}>{template.label} · {template.languageCode}</option>)}</select></label>}
      </div>
      <label className="mt-3 block text-xs font-semibold text-slate-700">Message<textarea data-testid="whatsapp-message-body" value={whatsAppBody} onChange={event => setWhatsAppBody(event.target.value)} rows={3} maxLength={4000} placeholder="Type a WhatsApp message…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
      {whatsAppError && <p data-testid="whatsapp-send-error" role="alert" className="mt-2 text-xs font-semibold text-rose-700">{whatsAppError}</p>}
      <div className="mt-3 flex justify-end"><button data-testid="send-whatsapp" type="button" disabled={sendingWhatsApp || !whatsAppBody.trim() || !whatsAppContext?.providerAvailable || !whatsAppContext.normalizedRecipient || (whatsAppType === 'TEMPLATE' && !selectedTemplate)} onClick={() => void sendWhatsApp()} className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-45"><Send className="h-4 w-4" />{sendingWhatsApp ? 'Sending…' : 'Send'}</button></div>
    </section>

    {canReviewUnresolved && (unresolved.length > 0 || unresolvedError) && <section data-testid="unmatched-whatsapp" className="rounded-xl border border-orange-200 bg-orange-50 p-4"><h3 className="text-sm font-black text-orange-950">Unmatched WhatsApp</h3><p className="mt-1 text-xs text-orange-800">Provider-confirmed messages that BBOS could not safely attach to one open Lead.</p>{unresolvedError && <p role="alert" className="mt-2 text-xs font-semibold text-rose-700">{unresolvedError}</p>}<div className="mt-3 space-y-2">{unresolved.map(item => <article key={item.unresolvedId} className="rounded-lg border border-orange-200 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-black text-slate-900">+{item.customerPhone}{item.customerName ? ` · ${item.customerName}` : ''}</p><p className="mt-1 text-sm text-slate-700">{item.body}</p><p className="mt-1 text-[10px] font-semibold text-orange-700">{item.reason.replaceAll('_', ' ').toLowerCase()} · {item.provider === 'META_MOCK' ? 'Demo simulation' : 'Meta confirmed'}</p></div><div className="flex gap-2"><button data-testid="link-unmatched-to-lead" type="button" onClick={() => void linkUnmatched(item)} className="flex items-center gap-1 rounded-lg border border-orange-300 px-2 py-1.5 text-[11px] font-bold text-orange-900"><Link2 className="h-3.5 w-3.5" /> Link to this Lead</button><button data-testid="create-lead-from-whatsapp" type="button" onClick={() => void createLeadFromUnmatched(item)} className="rounded-lg bg-orange-800 px-2 py-1.5 text-[11px] font-bold text-white">Create Lead</button></div></div></article>)}</div></section>}

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {entries.length === 0 ? <div data-testid="conversation-empty" className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center"><FileText className="mx-auto mb-3 h-9 w-9 text-slate-300" /><p className="text-sm font-bold text-slate-700">No conversation yet.</p><p className="mt-1 text-xs text-slate-500">Log a customer contact or add an internal note.</p></div> : grouped.map(([day, dayEntries]) => <section key={day} className="space-y-2"><h3 className="px-1 text-[11px] font-black uppercase tracking-wider text-slate-500">{day}</h3>{dayEntries.map(entry => <article data-testid="conversation-entry" data-entry-type={entry.entryType} key={entry.entryId} className={`rounded-xl border p-4 ${entryStyle(entry)}`}>
      <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{entry.title}</h4>{entry.visibility === 'INTERNAL_ONLY' && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-black text-amber-900">Internal only</span>}{entry.metadata?.manualLog && <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-600">Manually logged</span>}</div><p className="mt-0.5 text-[11px] font-semibold text-slate-500">{entry.actorName} · {channelLabel(entry)}</p></div><time className="whitespace-nowrap text-[11px] text-slate-500">{new Date(entry.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</time></div>
      {entry.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{entry.body}</p>}
      {providerStatusLabel(entry) && <div className={`mt-2 flex items-center gap-2 text-[11px] font-bold ${entry.providerStatus === 'FAILED' ? 'text-rose-700' : 'text-emerald-700'}`}><CheckCheck className="h-3.5 w-3.5" /><span data-testid="whatsapp-provider-status">{providerStatusLabel(entry)}</span>{entry.metadata?.demoSimulation && <span className="text-violet-700">· Demo simulation</span>}{entry.providerStatus === 'FAILED' && <button data-testid="retry-whatsapp" type="button" onClick={() => void retryWhatsApp(entry)} className="rounded border border-rose-300 bg-white px-2 py-1 text-[10px]">Retry</button>}</div>}
      {entry.channel === 'WHATSAPP' && entry.providerConfirmed && entry.direction === 'INBOUND' && <p className="mt-2 text-[10px] font-bold text-emerald-700">Provider confirmed{entry.metadata?.demoSimulation ? ' · Demo simulation' : ''}</p>}
    </article>)}</section>)}
    {hasMore && <div className="text-center"><button data-testid="load-earlier-conversation" type="button" disabled={loadingEarlier} onClick={() => void loadEarlier()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">{loadingEarlier ? 'Loading…' : 'Load earlier'}</button></div>}
  </div>;
};

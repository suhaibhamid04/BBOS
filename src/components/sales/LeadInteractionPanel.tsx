import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, PhoneCall, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import {
  LEAD_DROP_REASONS,
  type Lead,
  type LeadContactOutcome,
  type LeadDropReason,
} from '../../types';

const actions: Array<{ outcome: LeadContactOutcome; label: string }> = [
  { outcome: 'NO_ANSWER', label: 'No Answer' },
  { outcome: 'CALLBACK_REQUESTED', label: 'Callback / Reschedule' },
  { outcome: 'INTERESTED', label: 'Spoke / Interested' },
  { outcome: 'QUOTE_REQUESTED', label: 'Quote Requested' },
  { outcome: 'NEGOTIATING', label: 'Negotiating' },
  { outcome: 'ADVANCE_PROMISED', label: 'Advance Promised' },
  { outcome: 'NOT_INTERESTED', label: 'Not Interested' },
];

export const CONTACT_OUTCOME_LABELS = Object.fromEntries(actions.map(action => [action.outcome, action.label])) as Record<LeadContactOutcome, string>;

function localInputValue(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function suggestedTime(outcome: LeadContactOutcome): string {
  const value = new Date();
  if (outcome === 'NO_ANSWER') value.setHours(value.getHours() + 3);
  else {
    value.setDate(value.getDate() + 1);
    value.setHours(10, 0, 0, 0);
  }
  return localInputValue(value);
}

interface Props {
  lead: Pick<Lead, 'id' | 'status' | 'updatedAt' | 'lastContactAt' | 'lastContactOutcome' | 'nextFollowUpAt'>;
  initialOutcome?: LeadContactOutcome;
  onRecorded?: (lead: Lead) => void | Promise<void>;
  onClose?: () => void;
  title?: string;
}

export const LeadInteractionPanel: React.FC<Props> = ({ lead, initialOutcome = 'NO_ANSWER', onRecorded, onClose, title = 'Next action' }) => {
  const { recordLeadInteraction } = useData();
  const [outcome, setOutcome] = useState<LeadContactOutcome>(initialOutcome);
  const [nextFollowUp, setNextFollowUp] = useState(() => suggestedTime(initialOutcome as LeadContactOutcome));
  const [note, setNote] = useState('');
  const [dropReason, setDropReason] = useState<LeadDropReason>('NOT_INTERESTED');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);

  useEffect(() => {
    setOutcome(initialOutcome);
    setNextFollowUp(initialOutcome === 'NOT_INTERESTED' ? '' : suggestedTime(initialOutcome as LeadContactOutcome));
    setNote('');
    setDropReason('NOT_INTERESTED');
    setError('');
  }, [initialOutcome, lead.id]);

  const selectOutcome = (value: LeadContactOutcome) => {
    setOutcome(value);
    setNextFollowUp(value === 'NOT_INTERESTED' ? '' : suggestedTime(value));
    setError('');
  };

  const submit = async () => {
    if (savingRef.current) return;
    if (['CALLBACK_REQUESTED', 'NEGOTIATING'].includes(outcome) && !nextFollowUp) {
      setError('Choose the next follow-up date and time.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const updated = await recordLeadInteraction(lead.id, {
        outcome,
        expectedUpdatedAt: lead.updatedAt,
        idempotencyKey: crypto.randomUUID(),
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(nextFollowUp && outcome !== 'NOT_INTERESTED' ? { nextFollowUpAt: new Date(nextFollowUp).toISOString() } : {}),
        ...(outcome === 'NOT_INTERESTED' ? { dropReason, ...(note.trim() ? { dropNote: note.trim() } : {}) } : {}),
      });
      await onRecorded?.(updated);
      onClose?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The interaction could not be recorded.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const closed = ['CONVERTED', 'DROPPED', 'CANCELLED'].includes(lead.status);
  const overdue = Boolean(lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < Date.now());
  return (
    <section data-testid="lead-next-action-widget" className="space-y-4 rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><CalendarClock className="h-4 w-4 text-[#7056EE]" /> {title}</h3><p className="mt-1 text-xs text-slate-500">Business queue timing is evaluated by BBOS in Asia/Kolkata.</p></div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close interaction panel"><X className="h-4 w-4" /></button>}
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <p><span className="text-slate-500">Last outcome</span><br /><strong data-testid="last-contact-outcome">{lead.lastContactOutcome ? CONTACT_OUTCOME_LABELS[lead.lastContactOutcome] : 'No meaningful contact yet'}</strong></p>
        <p><span className="text-slate-500">Last contact</span><br /><strong>{lead.lastContactAt ? new Date(lead.lastContactAt).toLocaleString('en-IN') : 'Not recorded'}</strong></p>
        <p className="sm:col-span-2"><span className="text-slate-500">Next follow-up</span><br /><strong data-testid="next-follow-up-value" className={overdue ? 'text-rose-700' : undefined}>{lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleString('en-IN') : 'Needs scheduling'}{overdue ? ' · Overdue' : ''}</strong></p>
      </div>
      {!closed && <>
        <div className="flex flex-wrap gap-2">
          {actions.map(action => <button key={action.outcome} data-testid={`interaction-${action.outcome.toLowerCase().replaceAll('_', '-')}`} type="button" onClick={() => selectOutcome(action.outcome)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${outcome === action.outcome ? 'border-[#7056EE] bg-violet-50 text-[#7056EE]' : 'border-slate-200 text-slate-600'}`}>{action.label}</button>)}
        </div>
        {outcome !== 'NOT_INTERESTED' && <label className="block text-xs font-semibold text-slate-700">Next follow-up <span className="font-normal text-slate-500">(editable suggestion)</span><input data-testid="interaction-next-follow-up" type="datetime-local" value={nextFollowUp} onChange={event => setNextFollowUp(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>}
        {outcome === 'NOT_INTERESTED' && <label className="block text-xs font-semibold text-slate-700">Drop reason *<select data-testid="interaction-drop-reason" value={dropReason} onChange={event => setDropReason(event.target.value as LeadDropReason)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{LEAD_DROP_REASONS.map(reason => <option key={reason} value={reason}>{reason.replaceAll('_', ' ').toLowerCase()}</option>)}</select></label>}
        <label className="block text-xs font-semibold text-slate-700">Optional note<textarea data-testid="interaction-note" value={note} onChange={event => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{error}</p>}
        <button data-testid="save-lead-interaction" type="button" disabled={saving} onClick={() => void submit()} className="flex items-center justify-center gap-2 rounded-lg bg-[#7056EE] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"><PhoneCall className="h-4 w-4" /> {saving ? 'Saving…' : `Record: ${CONTACT_OUTCOME_LABELS[outcome]}`}</button>
      </>}
      {closed && <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">This Lead is closed and no longer accepts Sales follow-up activity.</p>}
    </section>
  );
};

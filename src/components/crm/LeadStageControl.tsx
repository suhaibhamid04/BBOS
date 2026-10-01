import React, { useState } from 'react';
import {
  LEAD_DROP_REASONS,
  LEAD_PRIORITIES,
  LEAD_STAGES,
  type Lead,
  type LeadDropReason,
  type LeadPriority,
  type LeadStatus,
} from '../../types';

const display = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^\w/, letter => letter.toUpperCase());

export const LeadStageControl: React.FC<{
  lead: Lead;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
}> = ({ lead, updateLead }) => {
  const [selectedStage, setSelectedStage] = useState<LeadStatus>(lead.status);
  const [dropReason, setDropReason] = useState<LeadDropReason | ''>(lead.dropReason || '');
  const [dropNote, setDropNote] = useState(lead.dropNote || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const changeStage = async (value: LeadStatus) => {
    setSelectedStage(value);
    setError('');
    if (value === 'DROPPED') return;
    try {
      setSaving(true);
      await updateLead(lead.id, { status: value });
    } catch (stageError) {
      setSelectedStage(lead.status);
      setError(stageError instanceof Error ? stageError.message : 'Lead stage could not be updated.');
    } finally { setSaving(false); }
  };

  const confirmDropped = async () => {
    if (!dropReason) { setError('Select a drop reason.'); return; }
    try {
      setSaving(true); setError('');
      await updateLead(lead.id, { status: 'DROPPED', dropReason, ...(dropNote.trim() ? { dropNote: dropNote.trim() } : {}) });
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : 'Lead could not be dropped.');
    } finally { setSaving(false); }
  };

  return <div className="space-y-3" data-testid="lead-stage-control">
    <label className="block space-y-1"><span className="text-xs font-medium text-slate-500">Lead stage</span><select data-testid="lead-stage-select" value={selectedStage} disabled={saving} onChange={event => void changeStage(event.target.value as LeadStatus)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{LEAD_STAGES.map(stage => <option key={stage} value={stage}>{display(stage)}</option>)}</select></label>
    {selectedStage === 'DROPPED' && <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
      <label className="block space-y-1"><span className="font-semibold text-rose-900">Drop reason *</span><select data-testid="lead-drop-reason" value={dropReason} onChange={event => setDropReason(event.target.value as LeadDropReason)} className="w-full rounded border border-rose-200 bg-white px-2 py-2"><option value="">Select reason</option>{LEAD_DROP_REASONS.map(reason => <option key={reason} value={reason}>{display(reason)}</option>)}</select></label>
      <label className="block space-y-1"><span className="font-semibold text-rose-900">Optional note</span><textarea value={dropNote} onChange={event => setDropNote(event.target.value)} className="w-full rounded border border-rose-200 bg-white px-2 py-2" /></label>
      <button data-testid="confirm-drop-lead" type="button" disabled={saving} onClick={() => void confirmDropped()} className="rounded bg-rose-700 px-3 py-2 font-bold text-white disabled:opacity-50">Confirm dropped</button>
    </div>}
    <label className="block space-y-1"><span className="text-xs font-medium text-slate-500">Priority</span><select data-testid="lead-priority-detail" value={lead.priority} disabled={saving} onChange={event => void updateLead(lead.id, { priority: event.target.value as LeadPriority })} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{LEAD_PRIORITIES.map(priority => <option key={priority}>{priority}</option>)}</select></label>
    {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
  </div>;
};

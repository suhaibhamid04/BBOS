import React, { useEffect, useState } from 'react';
import { AlertTriangle, History, UserRoundCheck } from 'lucide-react';
import type { Lead, LeadAssignmentHistoryEntry } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { getLeadAssignmentHistory, getLeadAssignmentOptions } from '../../services/leads/leadDistributionApi';

interface Props { lead: Lead; compact?: boolean }

const reasonLabel: Record<string, string> = {
  MANUAL_CREATOR: 'Kept with creator', PREVIOUS_SALESPERSON: 'Previous salesperson',
  ROUND_ROBIN: 'Kashmir round robin', MANUAL_MANAGER_ASSIGNMENT: 'Manager reassignment',
  MANUAL_ADMIN_ASSIGNMENT: 'Admin assignment', FALLBACK_ASSIGNMENT: 'Manual assignment required',
};

export const LeadAssignmentPanel: React.FC<Props> = ({ lead, compact = false }) => {
  const { currentUser } = useAuth();
  const { assignLead } = useData();
  const [history, setHistory] = useState<LeadAssignmentHistoryEntry[]>([]);
  const [options, setOptions] = useState<Array<{ employeeId: string; name: string; role: string }>>([]);
  const [target, setTarget] = useState(lead.assignedEmployeeId || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canReassign = ['Founder', 'Admin', 'Sales Manager'].includes(currentUser.role);

  const reloadHistory = async () => {
    try { setHistory(await getLeadAssignmentHistory(lead.id, currentUser.employeeId)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Assignment history could not be loaded.'); }
  };

  useEffect(() => {
    setTarget(lead.assignedEmployeeId || '');
    void reloadHistory();
    if (canReassign) {
      void getLeadAssignmentOptions(currentUser.employeeId)
        .then(setOptions)
        .catch(caught => setError(caught instanceof Error ? caught.message : 'Assignment options could not be loaded.'));
    }
  }, [lead.id, lead.assignedEmployeeId, currentUser.employeeId, canReassign]);

  const reassign = async () => {
    if (!target || target === lead.assignedEmployeeId) return;
    setSaving(true); setError('');
    try {
      await assignLead(lead.id, target, undefined, note);
      setNote('');
      await reloadHistory();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Lead could not be reassigned.'); }
    finally { setSaving(false); }
  };

  return (
    <section data-testid="lead-assignment-panel" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 font-bold text-slate-900"><UserRoundCheck className="h-4 w-4" /> Lead assignment</div>
      {lead.assignmentStatus === 'ASSIGNMENT_REQUIRED' && (
        <div data-testid="assignment-required-warning" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No eligible Sales employee available — manual assignment required.
        </div>
      )}
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <p><span className="text-slate-500">Salesperson</span><br /><strong>{lead.assignedEmployeeName || 'Unassigned'}</strong></p>
        <p><span className="text-slate-500">Team</span><br /><strong>{lead.salesTeamId || 'Not assigned'}</strong></p>
        <p><span className="text-slate-500">Method</span><br /><strong data-testid="assignment-reason">{reasonLabel[lead.assignmentReason || ''] || lead.assignmentReason || 'Legacy assignment'}</strong></p>
        <p><span className="text-slate-500">Assigned</span><br /><strong>{lead.assignedAt ? new Date(lead.assignedAt).toLocaleString() : 'Not recorded'}</strong></p>
      </div>
      {canReassign && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <select data-testid="lead-reassignment-select" value={target} onChange={event => setTarget(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs">
            <option value="">Choose eligible Sales employee</option>
            {options.map(employee => <option key={employee.employeeId} value={employee.employeeId}>{employee.name} ({employee.role})</option>)}
          </select>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="Reason (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs" />
          <button data-testid="reassign-lead" type="button" onClick={() => void reassign()} disabled={saving || !target || target === lead.assignedEmployeeId} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{saving ? 'Assigning…' : 'Reassign Lead'}</button>
        </div>
      )}
      {!compact && (
        <div className="space-y-2 border-t border-slate-200 pt-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700"><History className="h-4 w-4" /> Assignment history</div>
          <div data-testid="assignment-history" className="space-y-2">
            {history.length === 0 && <p className="text-xs text-slate-500">No assignment history recorded.</p>}
            {[...history].reverse().map(event => (
              <div key={event.id} className="rounded-lg border border-slate-200 bg-white p-2 text-xs">
                <strong>{reasonLabel[event.reason] || event.reason}</strong> · {event.previousEmployeeId || 'Unassigned'} → {event.newEmployeeId || 'Unassigned'}
                <div className="text-slate-500">{new Date(event.timestamp).toLocaleString()} · {event.actorEmployeeId}{event.ruleId ? ` · Rule: ${event.ruleId}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    </section>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, RefreshCw, Save, Shuffle, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { LeadDistributionOverview } from '../../types';
import {
  getLeadDistributionOverview,
  LeadDistributionApiError,
  updateLeadDistributionConfiguration,
} from '../../services/leads/leadDistributionApi';

interface ViewError { message: string; status: number | null; code: string }

function viewError(error: unknown): ViewError {
  if (error instanceof LeadDistributionApiError) return { message: error.message, status: error.status, code: error.code };
  return {
    message: error instanceof Error ? error.message : 'Distribution settings could not be loaded.',
    status: null,
    code: 'UNKNOWN_ERROR',
  };
}

export const LeadDistributionSettingsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [overview, setOverview] = useState<LeadDistributionOverview | null>(null);
  const [error, setError] = useState<ViewError | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setOverview(await getLeadDistributionOverview(currentUser.employeeId)); }
    catch (caught) { setOverview(null); setError(viewError(caught)); }
    finally { setLoading(false); }
  }, [currentUser.employeeId]);
  useEffect(() => { void load(); }, [load]);

  if (!['Founder', 'Admin'].includes(currentUser.role)) return <div className="p-8 text-center text-slate-500">Founder or Admin access is required.</div>;
  if (loading) return <div data-testid="lead-distribution-loading" className="p-8 text-center text-slate-500">Loading Lead distribution…</div>;
  if (!overview) return (
    <div id="lead-distribution-error" role="alert" className="mx-auto max-w-xl rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-bold">Lead Distribution could not be loaded</h2><p className="mt-1 text-sm">{error?.message || 'The settings request did not complete.'}</p><p className="mt-2 text-xs font-mono">{error?.status ? `HTTP ${error.status} · ` : ''}{error?.code || 'UNKNOWN_ERROR'}</p></div></div>
      <button data-testid="retry-lead-distribution" type="button" onClick={() => void load()} className="mt-4 flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white"><RefreshCw className="h-4 w-4" /> Retry</button>
    </div>
  );
  const config = overview.configuration;
  const update = (changes: Partial<typeof config>) => setOverview(current => current ? { ...current, configuration: { ...current.configuration, ...changes } } : current);
  const save = async () => {
    setSaving(true); setError(null);
    try {
      setOverview(await updateLeadDistributionConfiguration({
        enabled: config.enabled, salesTeamId: config.salesTeamId,
        includeSalesExecutives: config.includeSalesExecutives,
        includeSalesManagers: config.includeSalesManagers,
        previousSalespersonPreference: config.previousSalespersonPreference,
        excludedEmployeeIds: config.excludedEmployeeIds,
      }, currentUser.employeeId));
    } catch (caught) { setError(viewError(caught)); }
    finally { setSaving(false); }
  };

  return (
    <div id="lead-distribution-settings" className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-xl font-bold text-slate-900">Lead Distribution</h1><p className="text-sm text-slate-500">A small, deterministic assignment policy for the Kashmir Sales Team.</p></div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-slate-300 p-2 text-slate-600" aria-label="Refresh"><RefreshCw className="h-4 w-4" /></button>
      </div>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {!config.updatedAt && <div data-testid="default-distribution-configuration" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong>Default configuration</strong> — BBOS is using the safe Kashmir Sales Team defaults. Review and save them when ready.</div>}
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-bold"><Shuffle className="h-4 w-4" /> Automatic distribution</div><label className="flex items-center gap-2 text-sm"><input data-testid="distribution-enabled" type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} /> Enabled</label></div>
        <label className="block text-sm font-semibold text-slate-700">Sales team<select data-testid="distribution-team" value={config.salesTeamId} disabled={saving} onChange={event => update({ salesTeamId: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value={config.salesTeamId}>{config.salesTeamName}</option></select></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input data-testid="include-sales-executives" type="checkbox" checked={config.includeSalesExecutives} onChange={event => update({ includeSalesExecutives: event.target.checked })} /> Sales Executives</label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input data-testid="include-sales-managers" type="checkbox" checked={config.includeSalesManagers} onChange={event => update({ includeSalesManagers: event.target.checked })} /> Sales Managers</label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm"><input data-testid="prefer-previous-salesperson" type="checkbox" checked={config.previousSalespersonPreference} onChange={event => update({ previousSalespersonPreference: event.target.checked })} /> Prefer previous salesperson</label>
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 font-bold"><Users className="h-4 w-4" /> Eligible employees</div>
        <p className="text-xs text-slate-500">Excluding an employee pauses new Lead assignment without deactivating their BBOS access.</p>
        {overview.eligibleEmployees.map(employee => (
          <label key={employee.employeeId} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm">
            <span><strong>{employee.name}</strong><br /><span className="text-xs text-slate-500">{employee.employeeId} · {employee.role}</span></span>
            <span className="flex items-center gap-2"><input data-testid={`exclude-${employee.employeeId}`} type="checkbox" checked={config.excludedEmployeeIds.includes(employee.employeeId)} onChange={event => update({ excludedEmployeeIds: event.target.checked ? [...config.excludedEmployeeIds, employee.employeeId] : config.excludedEmployeeIds.filter(id => id !== employee.employeeId) })} /> Exclude</span>
          </label>
        ))}
      </section>
      <section data-testid="round-robin-state" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <h2 className="mb-3 font-bold">Round-robin state</h2>
        <p><span className="text-slate-500">Order:</span> {overview.roundRobinOrder.join(' → ') || 'No eligible employees'}</p>
        <p><span className="text-slate-500">Last assigned:</span> {overview.state.lastAssignedEmployeeId || 'None yet'}</p>
        <p><span className="text-slate-500">Sequence:</span> {overview.state.sequence}</p>
      </section>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><strong>{error.code}</strong>{error.status ? ` · HTTP ${error.status}` : ''}<br />{error.message}<button type="button" onClick={() => void load()} className="ml-2 underline">Reload settings</button></div>}
      <button data-testid="save-distribution-settings" type="button" onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-[#7056EE] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save distribution settings'}</button>
    </div>
  );
};

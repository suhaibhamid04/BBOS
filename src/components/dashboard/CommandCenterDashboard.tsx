import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, FileText, Flame, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { calculateDashboardMetrics, formatMetric, type DashboardMetric } from '../../services/dashboardMetrics';
import { NavSectionKey } from '../layout/Sidebar';

interface DashboardProps { onNavigate: (section: NavSectionKey, targetId?: string) => void; }

function MetricCard(props: { label: string; metric: DashboardMetric<number>; formatter?: (value: number) => string; testId: string; icon: React.ReactNode; definition: string }) {
  const formatter = props.formatter || (value => value.toLocaleString('en-IN'));
  return <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2" data-testid={props.testId}>
    <div className="flex items-center justify-between"><span className="text-slate-500 text-xs font-semibold">{props.label}</span>{props.icon}</div>
    <h3 className="text-2xl font-bold text-slate-900">{formatMetric(props.metric, formatter)}</h3>
    <p className="text-[11px] text-slate-500" title={props.metric.reason}>{props.metric.status === 'available' ? props.definition : props.metric.reason}</p>
  </div>;
}

export const CommandCenterDashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const { leads, tasks, quotes, bookings, recommendations, auditLogs, toggleTaskStatus, acceptRecommendation, dataLoadErrors, isLoading } = useData();
  const metrics = calculateDashboardMetrics({ leads, quotes, bookings, role: currentUser.role, errors: dataLoadErrors });
  const newLeads = leads.filter(lead => lead.status === 'NEW');
  const negotiationLeads = leads.filter(lead => ['NEGOTIATION', 'QUOTE_SHARED'].includes(lead.status));
  const bookedLeads = leads.filter(lead => lead.status === 'CONVERTED');
  const activeRecommendations = recommendations.filter(recommendation => recommendation.status === 'PENDING');
  const pendingTasks = tasks.filter(task => task.status !== 'COMPLETED');
  const destinationBreakdown = leads.reduce<Record<string, number>>((counts, lead) => {
    const destination = lead.destination?.trim() || 'Unspecified';
    counts[destination] = (counts[destination] || 0) + 1;
    return counts;
  }, {});
  const destinationEntries = Object.entries(destinationBreakdown) as Array<[string, number]>;
  const dashboardFailed = Boolean(dataLoadErrors.leads || dataLoadErrors.quotes || dataLoadErrors.bookings);

  return <div id="command-center-dashboard" className="space-y-6">
    <div><h2 className="text-xl font-bold text-slate-900">Command Center</h2><p className="text-xs text-slate-500 mt-1">Authorized operational data for {currentUser.name}</p></div>
    {dashboardFailed && <div role="alert" data-testid="dashboard-load-error" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>Some dashboard sources could not be loaded.</strong> Affected metrics are marked unavailable and are not shown as zero.</div></div>}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" aria-busy={isLoading}>
      <MetricCard label="Verified Customer Payments" metric={metrics.verifiedCustomerPayments} testId="metric-verified-payments" icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} definition="Sum of verified customer payments reflected on authorized bookings." formatter={value => `₹${value.toLocaleString('en-IN')}`} />
      <MetricCard label="New Leads" metric={metrics.newLeads} testId="metric-new-leads" icon={<Flame className="w-4 h-4 text-rose-500" />} definition="Authorized leads whose current status is New." />
      <MetricCard label="Lead Conversion" metric={metrics.conversionRate} testId="metric-conversion" icon={<CheckCircle2 className="w-4 h-4 text-violet-500" />} definition="Converted leads divided by all authorized leads." formatter={value => `${value.toFixed(1)}%`} />
      <MetricCard label="Active Quotes" metric={metrics.activeQuotes} testId="metric-active-quotes" icon={<FileText className="w-4 h-4 text-amber-500" />} definition="Draft, pending approval, sent, or viewed quotes." />
      <MetricCard label="Active Bookings" metric={metrics.activeBookings} testId="metric-active-bookings" icon={<CheckCircle2 className="w-4 h-4 text-blue-500" />} definition="Authorized bookings not completed or cancelled." />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-slate-50 rounded-2xl p-6 border border-slate-200">
        <div className="mb-5"><h2 className="font-bold text-slate-900">Sales Pipeline</h2><p className="text-xs text-slate-500">Current authorized lead records</p></div>
        {dataLoadErrors.leads ? <p className="rounded-xl bg-white p-5 text-sm text-amber-700">Pipeline unavailable because lead data failed to load.</p> : leads.length === 0 ? <p data-testid="empty-sales-pipeline" className="rounded-xl bg-white p-8 text-center text-sm text-slate-500">No leads are available.</p> : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'New', rows: newLeads, color: 'text-blue-700' },
            { label: 'Negotiation', rows: negotiationLeads, color: 'text-amber-700' },
            { label: 'Converted', rows: bookedLeads, color: 'text-emerald-700' },
          ].map(column => <div key={column.label} className="space-y-3"><p className={`text-xs font-bold uppercase ${column.color}`}>{column.label} ({column.rows.length})</p>{column.rows.slice(0, 3).map(lead => <button key={lead.id} onClick={() => onNavigate('leads', lead.id)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left"><p className="text-xs font-semibold text-slate-900">{lead.customerName}</p><p className="text-[11px] text-slate-500">{lead.destination || 'Destination not set'}</p>{typeof lead.leadScore === 'number' && <p className="text-[10px] text-slate-400">Score {lead.leadScore}</p>}</button>)}{column.rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-400">No records</p>}</div>)}
        </div>}
      </div>
      <div className="space-y-6">
        <div className="bg-[#7056EE] rounded-2xl p-6 text-white shadow-lg"><h2 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2"><Sparkles className="h-4 w-4" />AI Recommendations</h2><div className="space-y-3 mt-4">{activeRecommendations.slice(0, 2).map(recommendation => <div key={recommendation.id} className="bg-white/10 p-3 rounded-xl border border-white/20"><p className="text-xs font-bold">{recommendation.title}</p><p className="text-[10px] mt-1 opacity-80">{recommendation.description}</p><button onClick={() => acceptRecommendation(recommendation.id)} className="mt-2 text-[10px] bg-white text-[#7056EE] px-3 py-1 rounded font-bold">Accept</button></div>)}{activeRecommendations.length === 0 && <p data-testid="empty-ai-recommendations" className="text-xs text-white/80">No authoritative AI recommendations are available.</p>}</div></div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6"><h2 className="font-bold text-sm text-slate-900">Priority Tasks ({pendingTasks.length})</h2><div className="space-y-3 mt-4">{pendingTasks.slice(0, 3).map(task => <button key={task.id} onClick={() => toggleTaskStatus(task.id)} className="w-full text-left text-xs text-slate-700">□ {task.title}</button>)}{pendingTasks.length === 0 && <p className="text-xs text-slate-500">No pending tasks.</p>}</div></div>
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200"><h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-amber-500" />Destination Demand</h3><div className="space-y-3 mt-4">{destinationEntries.sort((a, b) => b[1] - a[1]).map(([destination, count]) => { const percent = leads.length === 0 ? 0 : Math.round((count / leads.length) * 100); return <div key={destination}><div className="flex justify-between text-xs"><span>{destination}</span><span>{count} ({percent}%)</span></div><div className="h-2 bg-slate-100 rounded mt-1"><div className="h-2 bg-violet-500 rounded" style={{ width: `${percent}%` }} /></div></div>; })}{destinationEntries.length === 0 && <p className="text-xs text-slate-500">No destination demand data.</p>}</div></div>
      <div className="bg-white rounded-2xl p-6 border border-slate-200"><h3 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-400" />Recent Audit Activity</h3><div className="space-y-3 mt-4">{auditLogs.slice(0, 3).map(log => <div key={log.id} className="text-xs"><strong>{log.action}</strong><p className="text-slate-500">{log.actorName}</p></div>)}{auditLogs.length === 0 && <p className="text-xs text-slate-500">No audit activity is available from an authoritative source.</p>}</div></div>
    </div>
  </div>;
};

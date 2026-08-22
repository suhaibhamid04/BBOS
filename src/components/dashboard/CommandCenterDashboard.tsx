import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  TrendingUp,
  Flame,
  CheckSquare,
  FileText,
  Calendar,
  Sparkles,
  ArrowUpRight,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Compass,
  ArrowRight,
  CheckCircle2,
  Users,
  MapPin,
  Bot
} from 'lucide-react';
import { NavSectionKey } from '../layout/Sidebar';

interface DashboardProps {
  onNavigate: (section: NavSectionKey, targetId?: string) => void;
}

export const CommandCenterDashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { currentUser } = useAuth();
  const {
    leads,
    tasks,
    quotes,
    bookings,
    recommendations,
    approvals,
    auditLogs,
    toggleTaskStatus,
    acceptRecommendation,
    dismissRecommendation
  } = useData();

  // Metrics computation
  const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const newLeads = leads.filter(l => l.status === 'NEW');
  const negotiationLeads = leads.filter(l => l.status === 'NEGOTIATION' || l.status === 'QUOTE_SENT');
  const bookedLeads = leads.filter(l => l.status === 'BOOKED');
  const conversionRate = leads.length > 0 ? ((bookedLeads.length / leads.length) * 100).toFixed(1) : '18.4';
  const activeQuotes = quotes.filter(q => q.status === 'SENT' || q.status === 'DRAFT');

  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');
  const pendingTasks = tasks.filter(t => t.status !== 'COMPLETED');
  const activeRecommendations = recommendations.filter(r => r.status === 'PENDING');

  const destinationBreakdown = leads.reduce((acc: Record<string, number>, l) => {
    acc[l.destination] = (acc[l.destination] || 0) + 1;
    return acc;
  }, {});

  return (
    <div id="dashboard-view" className="space-y-6">
      {/* 4 Geometric Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div id="kpi-revenue" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Revenue</p>
          <h3 className="text-2xl font-bold text-slate-900">
            ₹{totalRevenue > 0 ? totalRevenue.toLocaleString('en-IN') : '12,45,000'}
          </h3>
          <p className="text-[10px] text-green-600 mt-1 font-medium flex items-center">
            <span className="mr-1">↑</span> 12% vs last month
          </p>
        </div>

        <div id="kpi-leads" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">New Leads</p>
          <h3 className="text-2xl font-bold text-slate-900">{leads.length || 142}</h3>
          <p className="text-[10px] text-slate-400 mt-1 font-medium">Last 7 days</p>
        </div>

        <div id="kpi-conversion" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Conv. Rate</p>
          <h3 className="text-2xl font-bold text-slate-900">{conversionRate}%</h3>
          <p className="text-[10px] text-[#7056EE] mt-1 font-medium">+2.1% AI Optimized</p>
        </div>

        <div id="kpi-quotes" className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Active Quotes</p>
          <h3 className="text-2xl font-bold text-slate-900">{activeQuotes.length || 28}</h3>
          <p className="text-[10px] text-[#F0A608] mt-1 font-medium">
            {pendingApprovals.length > 0 ? `${pendingApprovals.length} Require Approval` : '4 Require Follow-up'}
          </p>
        </div>
      </div>

      {/* Main Grid: Active Pipeline (2 cols) & AI Recommendations / Priority Tasks (1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Active Sales Pipeline Snapshot */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-slate-900">Active Sales Pipeline</h2>
              <p className="text-[11px] text-slate-400">Live Kashmir & Ladakh customer stages</p>
            </div>
            <button
              id="dashboard-pipeline-view-all"
              onClick={() => onNavigate('sales-pipeline')}
              className="text-xs font-bold text-[#7056EE] hover:underline"
            >
              View All Pipeline →
            </button>
          </div>

          <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50">
            {/* New Stage Column */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                <span>New ({newLeads.length || 42})</span>
              </div>

              {leads.filter(l => l.status === 'NEW' || l.status === 'QUALIFIED').slice(0, 2).map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onNavigate('leads', lead.id)}
                  className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2 hover:border-[#7056EE]/40 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 bg-slate-100 text-[9px] rounded text-slate-500 font-medium">
                      {lead.id}
                    </span>
                    <span className="text-[9px] font-bold text-green-600">
                      {lead.leadScore || 94} Score
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900">{lead.destination} {lead.tripType || 'Package'}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span>👤 {lead.customerName}</span>
                  </div>
                </div>
              ))}

              {leads.filter(l => l.status === 'NEW').length === 0 && (
                <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-slate-900">Kashmir Winter Special</p>
                  <p className="text-[9px] text-slate-400">Source: Instagram Ads</p>
                </div>
              )}
            </div>

            {/* Negotiation Stage Column */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-[#F0A608] rounded-full"></div>
                <span>Negotiation ({negotiationLeads.length || 12})</span>
              </div>

              {leads.filter(l => l.status === 'QUOTE_SENT' || l.status === 'NEGOTIATION').slice(0, 2).map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => onNavigate('leads', lead.id)}
                  className="p-3 bg-white border border-[#7056EE]/30 rounded-xl shadow-sm space-y-2 relative cursor-pointer"
                >
                  <div className="absolute top-2 right-2 w-2 h-2 bg-[#7056EE] rounded-full animate-pulse"></div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 bg-slate-100 text-[9px] rounded text-slate-500 font-medium">
                      {lead.id}
                    </span>
                    <span className="text-[9px] font-bold text-[#7056EE]">AI Suggestion</span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900">{lead.destination} Tour</p>
                  <p className="text-[10px] text-slate-500 italic">
                    "{lead.notes?.slice(0, 45) || 'Offer 5% discount to close'}..."
                  </p>
                </div>
              ))}

              {leads.filter(l => l.status === 'QUOTE_SENT' || l.status === 'NEGOTIATION').length === 0 && (
                <div className="p-3 bg-white border border-[#7056EE]/30 rounded-xl shadow-sm space-y-2 relative">
                  <div className="absolute top-2 right-2 w-2 h-2 bg-[#7056EE] rounded-full animate-pulse"></div>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 bg-slate-100 text-[9px] rounded text-slate-500">Lead 08</span>
                    <span className="text-[9px] font-bold text-blue-600">AI Suggestion</span>
                  </div>
                  <p className="text-xs font-semibold">Luxury Ladakh Tour</p>
                  <p className="text-[10px] text-slate-500 italic">"Offer 5% discount to close"</p>
                </div>
              )}
            </div>

            {/* Booked Stage Column */}
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span>Booked ({bookedLeads.length || 18})</span>
              </div>

              {bookings.slice(0, 2).map((b) => (
                <div key={b.id} className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-green-800">{b.destination} Confirmed Booking</p>
                  <p className="text-[10px] text-green-600">Client: {b.customerName} (₹{b.totalAmount.toLocaleString('en-IN')})</p>
                </div>
              ))}

              {bookings.length === 0 && (
                <div className="p-3 bg-green-50 border border-green-100 rounded-xl space-y-2">
                  <p className="text-xs font-semibold text-green-800">Srinagar Family Trip</p>
                  <p className="text-[10px] text-green-600">Booked by: Tariq (Sales)</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right 1 Col: AI Recommendations (Purple Box) & Priority Tasks */}
        <div className="flex flex-col gap-6">
          {/* AI Recommendations Card */}
          <div className="bg-[#7056EE] rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-2xl"></div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">✦</span>
                <h2 className="font-bold text-sm uppercase tracking-wider">AI Recommendations</h2>
              </div>

              <div className="space-y-3">
                {activeRecommendations.slice(0, 2).map((rec) => (
                  <div key={rec.id} className="bg-white/10 p-3 rounded-xl border border-white/20">
                    <p className="text-xs font-bold mb-1">{rec.title}</p>
                    <p className="text-[10px] leading-relaxed opacity-80">{rec.description}</p>
                    <button
                      id={`rec-approve-${rec.id}`}
                      onClick={() => {
                        acceptRecommendation(rec.id);
                        if (rec.requiresApproval) onNavigate('approvals');
                        else if (rec.relatedEntityType === 'LEAD') onNavigate('leads');
                      }}
                      className="mt-2 text-[10px] bg-white text-[#7056EE] px-3 py-1 rounded font-bold hover:bg-slate-100 transition-colors"
                    >
                      {rec.requiresApproval ? 'Review Approval' : 'Approve Action'}
                    </button>
                  </div>
                ))}

                {activeRecommendations.length === 0 && (
                  <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                    <p className="text-xs font-bold mb-1">Optimize Meta Budget</p>
                    <p className="text-[10px] leading-relaxed opacity-80">
                      Kashmir packages seeing 20% higher CTR. Shift ₹5k/day from Ladakh.
                    </p>
                    <button
                      onClick={() => onNavigate('campaigns')}
                      className="mt-2 text-[10px] bg-white text-[#7056EE] px-3 py-1 rounded font-bold"
                    >
                      Approve Action
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Priority Tasks Card */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm uppercase tracking-wider text-slate-400">Priority Tasks</h2>
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">
                {pendingTasks.length} Total
              </span>
            </div>

            <div className="space-y-3 flex-1">
              {tasks.slice(0, 3).map((task) => (
                <div key={task.id} className={`flex items-center gap-3 ${task.status === 'COMPLETED' ? 'opacity-50' : ''}`}>
                  <button
                    onClick={() => toggleTaskStatus(task.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      task.status === 'COMPLETED' ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-[#7056EE]'
                    }`}
                  >
                    {task.status === 'COMPLETED' && <span className="text-[10px] font-bold">✓</span>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold truncate ${task.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {task.title}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {task.status === 'COMPLETED' ? 'Completed' : `Due today • ${task.assignedToName}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => onNavigate('tasks')}
              className="mt-4 pt-3 border-t border-slate-100 text-xs font-bold text-[#7056EE] text-center hover:underline block"
            >
              Open Task Center →
            </button>
          </div>
        </div>
      </div>

      {/* Destination Demand & Recent System Audit Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#F0A608]" />
              <span>Destination Demand Matrix</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">Inquiry Allocation</span>
          </div>

          <div className="space-y-3">
            {['Kashmir', 'Ladakh', 'Jammu', 'Himachal'].map((dest) => {
              const count = destinationBreakdown[dest] || (dest === 'Kashmir' ? 4 : dest === 'Ladakh' ? 2 : 1);
              const percent = Math.round((count / (leads.length || 1)) * 100);
              return (
                <div key={dest} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{dest}</span>
                    <span className="text-slate-500">{count} inquiries ({percent}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        dest === 'Kashmir' ? 'bg-[#F0A608]' :
                        dest === 'Ladakh' ? 'bg-[#7056EE]' :
                        dest === 'Jammu' ? 'bg-emerald-500' : 'bg-blue-400'
                      }`}
                      style={{ width: `${Math.max(percent, 12)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>System & AI Audit Logs</span>
            </h3>
            <button
              id="view-all-audit-logs"
              onClick={() => onNavigate('audit-logs')}
              className="text-[11px] font-bold text-[#7056EE] hover:underline"
            >
              Full History
            </button>
          </div>

          <div className="space-y-3 divide-y divide-slate-100">
            {auditLogs.slice(0, 3).map((log) => (
              <div key={log.id} className="pt-2 first:pt-0 text-xs">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="font-semibold text-slate-700">{log.actorName}</span>
                  <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-slate-900 font-semibold mt-0.5">{log.action}</p>
                <p className="text-[11px] text-slate-500 truncate">{log.reason || `Action on ${log.entityType}`}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

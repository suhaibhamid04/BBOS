import React from 'react';
import { useData } from '../../context/DataContext';
import { Bell, CheckCircle2, Clock, Flame, Sparkles, Shield } from 'lucide-react';

export const NotificationsView: React.FC = () => {
  const { recommendations, tasks, approvals } = useData();

  return (
    <div id="notifications-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Alerts & Notifications</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
              Live Feed
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Real-time alerts, lead status changes, and critical task warnings</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
        {approvals.filter(a => a.status === 'PENDING').map(app => (
          <div key={app.id} className="p-4 flex items-start space-x-3 bg-amber-50/50">
            <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <span className="font-bold text-slate-900">Pending Approval Required: {app.summary}</span>
              <p className="text-slate-600">{app.reason}</p>
              <span className="text-[10px] text-slate-400 font-mono">Requires {app.requiresRole} Role</span>
            </div>
          </div>
        ))}

        {recommendations.map(rec => (
          <div key={rec.id} className="p-4 flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-[#7056EE] shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs">
              <span className="font-bold text-slate-900">AI Operating Insight: {rec.title}</span>
              <p className="text-slate-600">{rec.description}</p>
              <p className="text-[11px] text-[#7056EE] font-semibold">Action: {rec.recommendedAction}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

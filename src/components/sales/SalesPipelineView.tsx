import React from 'react';
import { useData } from '../../context/DataContext';
import { LeadStatus } from '../../types';
import { GitPullRequest, ArrowRight, Flame, Clock, Sparkles } from 'lucide-react';

export const SalesPipelineView: React.FC = () => {
  const { leads, updateLeadStatus } = useData();

  const stages: LeadStatus[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'QUOTE_SENT',
    'NEGOTIATION',
    'BOOKED',
  ];

  const totalPipelineValue = leads.reduce((acc, l) => acc + l.budget, 0);

  return (
    <div id="sales-pipeline-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sales Pipeline Kanban</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/10 text-[#7056EE]">
              ₹{(totalPipelineValue / 100000).toFixed(2)} Lakh Active Pipeline
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Stage-wise conversion funnel from new inquiry to booking advance confirmation
          </p>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="overflow-x-auto pb-6">
        <div className="flex space-x-4 min-w-[1100px]">
          {stages.map((stage, idx) => {
            const stageLeads = leads.filter((l) => l.status === stage);
            const stageValue = stageLeads.reduce((sum, l) => sum + l.budget, 0);
            const nextStage = stages[idx + 1];

            return (
              <div
                key={stage}
                id={`pipeline-col-${stage.toLowerCase()}`}
                className="w-72 bg-slate-100/70 rounded-2xl p-3.5 flex flex-col space-y-3 shrink-0 border border-slate-200"
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div>
                    <span className="text-xs font-bold text-slate-900">{stage}</span>
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full bg-white text-slate-700 font-black">
                      {stageLeads.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-600">
                    ₹{(stageValue / 1000).toFixed(0)}k
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 min-h-[350px]">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      id={`pipeline-card-${lead.id}`}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-[#7056EE] transition-all space-y-2.5 group"
                    >
                      <div className="flex items-start justify-between">
                        <h4 className="text-xs font-bold text-slate-900">{lead.customerName}</h4>
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded">
                          {lead.leadScore}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-600 space-y-0.5">
                        <p className="font-semibold text-[#7056EE]">{lead.destination} • {lead.tripType}</p>
                        <p className="font-bold text-slate-900">₹{lead.budget.toLocaleString('en-IN')}</p>
                      </div>

                      {nextStage && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">{lead.assignedEmployeeName.split(' ')[0]}</span>
                          <button
                            id={`advance-stage-${lead.id}`}
                            onClick={() => updateLeadStatus(lead.id, nextStage)}
                            className="px-2 py-1 bg-slate-50 hover:bg-[#7056EE] hover:text-white text-[10px] font-bold text-slate-700 rounded-lg transition-colors flex items-center space-x-1 border border-slate-200 hover:border-transparent"
                          >
                            <span>Move to {nextStage}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useData } from '../../context/DataContext';
import { Bot, Shield, CheckCircle2, AlertTriangle, Sparkles, Sliders } from 'lucide-react';

export const AiPermissionsView: React.FC = () => {
  const { aiAgents } = useData();

  return (
    <div id="ai-permissions-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">AI Safety & Execution Limits</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/15 text-[#7056EE]">
              Tool Gateway & Guardrails
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Hard boundaries for autonomous AI operations, discount thresholds, and mandatory human review gates
          </p>
        </div>
      </div>

      {/* Safety Policy Notice */}
      <div className="p-4 bg-purple-50/70 border border-purple-200/80 rounded-2xl flex items-start space-x-3 text-xs">
        <Shield className="w-5 h-5 text-[#7056EE] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-purple-950">Active AI Governance Guardrail</p>
          <p className="text-slate-700 leading-relaxed">
            AI agents can analyze inquiries, draft messages, suggest itineraries, and score leads autonomously. However, any commercial discount exceeding ₹5,000, publishing live Meta Ad campaigns, or deleting records requires human founder/management approval via the <strong>Approval Center</strong>.
          </p>
        </div>
      </div>

      {/* AI Agents Registry */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Registered System AI Agents</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {aiAgents.map((agent) => (
            <div
              key={agent.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded-xl bg-[#7056EE]/10 text-[#7056EE] flex items-center justify-center font-bold">
                    <Bot className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                    {agent.status}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-slate-900 text-sm">{agent.name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">{agent.purpose}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                  <div>
                    <span className="text-slate-400 text-[10px]">Autonomy Level:</span>
                    <p className="font-semibold text-slate-800">{agent.autonomyLevel}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">Permitted Tools:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.permittedTools.map((tool, tIdx) => (
                        <span key={tIdx} className="text-[10px] bg-white border border-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-mono">
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[11px]">
                <span className="text-slate-500">Human in the Loop:</span>
                <span className="font-bold text-emerald-600">
                  {agent.requiresHumanApproval ? 'Required for Sensitive Actions' : 'Full Auto'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

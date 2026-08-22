import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Bot, Sparkles, Send, Loader2, ArrowRight, CheckCircle2, ShieldCheck, Flame, TrendingUp } from 'lucide-react';
import { NavSectionKey } from '../layout/Sidebar';

interface AiCommandCenterViewProps {
  onNavigate: (section: NavSectionKey, targetId?: string) => void;
}

export const AiCommandCenterView: React.FC<AiCommandCenterViewProps> = ({ onNavigate }) => {
  const { queryCommandCenter, leads, tasks, quotes, approvals, campaigns } = useData();
  const { currentUser } = useAuth();

  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<Array<{ query: string; response: any; timestamp: string }>>([
    {
      query: "Show current pipeline health and top pending priorities for Kashmir & Ladakh travel.",
      response: {
        answer: `Booking Bridge OS is currently tracking **${leads.length} active leads** with an estimated pipeline value of **₹${(leads.reduce((s, l) => s + l.budget, 0) / 100000).toFixed(2)} Lakhs**.\n\n* **Top Priority:** You have ${approvals.filter(a => a.status === 'PENDING').length} pending approvals and ${tasks.filter(t => t.status !== 'COMPLETED').length} operational tasks.\n* **Hot Inquiries:** High-margin Kashmir honeymoon and luxury houseboat leads have a 64% conversion probability if contacted within 2 hours.`,
        suggestedActions: [
          { label: "Review Approvals", actionType: "NAVIGATE", targetView: "approvals" },
          { label: "View Active Leads", actionType: "NAVIGATE", targetView: "leads" },
        ]
      },
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const presetPrompts = [
    "What are the top 3 hottest leads requiring immediate sales follow-up?",
    "Which marketing campaigns are delivering the highest ROAS this month?",
    "Check for any discounts or quotes awaiting management approval.",
    "Give me an executive summary of our Kashmir autumn booking demand.",
  ];

  const handleSend = async (queryText?: string) => {
    const q = queryText || inputQuery;
    if (!q.trim() || isLoading) return;

    setIsLoading(true);
    setInputQuery('');

    try {
      const response = await queryCommandCenter(q);
      setHistory((prev) => [
        ...prev,
        {
          query: q,
          response,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Command center error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="ai-command-center-view" className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-[#F0A608]" />
            <span className="text-xs font-semibold text-[#F0A608] uppercase tracking-wider">Natural Language OS Command</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">AI Command Center & Intelligent Orchestrator</h2>
          <p className="text-xs text-slate-300">
            Ask complex cross-functional questions across Sales, CRM, Operations, Marketing, and Approvals.
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Role Grounded: <strong>{currentUser.role}</strong></span>
        </div>
      </div>

      {/* Suggested Quick Queries */}
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Suggested Inquiries</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {presetPrompts.map((prompt, pIdx) => (
            <button
              key={pIdx}
              onClick={() => handleSend(prompt)}
              className="p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#7056EE] rounded-xl text-left text-xs font-medium text-slate-700 transition-all flex items-center justify-between group shadow-2xs"
            >
              <span>{prompt}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#7056EE] group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>

      {/* Interaction Feed */}
      <div className="space-y-4">
        {history.map((item, idx) => (
          <div key={idx} className="space-y-3">
            {/* User Bubble */}
            <div className="flex justify-end">
              <div className="bg-slate-900 text-white text-xs px-4 py-2.5 rounded-2xl rounded-tr-xs max-w-xl shadow-xs">
                <p>{item.query}</p>
                <span className="text-[10px] text-slate-400 mt-1 block text-right">{item.timestamp}</span>
              </div>
            </div>

            {/* AI Response Card */}
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-5 max-w-2xl shadow-2xs space-y-3 text-xs text-slate-800">
                <div className="flex items-center space-x-2 pb-2 border-b border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-[#7056EE] text-white flex items-center justify-center font-bold">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-bold text-slate-900">Booking Bridge Copilot</span>
                </div>

                <div className="prose prose-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {item.response.answer}
                </div>

                {item.response.suggestedActions && item.response.suggestedActions.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                    {item.response.suggestedActions.map((act: any, aIdx: number) => (
                      <button
                        key={aIdx}
                        onClick={() => {
                          if (act.targetView) onNavigate(act.targetView as NavSectionKey);
                        }}
                        className="px-3 py-1.5 bg-[#7056EE]/10 hover:bg-[#7056EE]/20 text-[#7056EE] text-xs font-bold rounded-lg transition-colors flex items-center space-x-1"
                      >
                        <span>{act.label}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-xs text-[#7056EE] font-semibold p-4 bg-white rounded-xl border border-slate-200 max-w-md shadow-2xs animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Analyzing OS data & synthesizing decision...</span>
          </div>
        )}
      </div>

      {/* Input Field */}
      <div className="sticky bottom-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-lg flex items-center space-x-2 text-xs">
        <input
          id="ai-command-input"
          type="text"
          value={inputQuery}
          onChange={(e) => setInputQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Ask anything about Booking Bridge OS (e.g. 'Show revenue by destination this quarter')..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#7056EE]"
        />
        <button
          id="ai-command-submit-btn"
          onClick={() => handleSend()}
          disabled={isLoading || !inputQuery.trim()}
          className="px-4 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white font-bold rounded-xl flex items-center space-x-1.5 transition-colors disabled:opacity-50"
        >
          <span>Send</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

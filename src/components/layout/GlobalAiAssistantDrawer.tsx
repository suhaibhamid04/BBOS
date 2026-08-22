import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { Bot, Sparkles, Send, X, Shield, ArrowRight, CornerDownLeft, Loader2, Lightbulb } from 'lucide-react';
import { NavSectionKey } from './Sidebar';

interface GlobalAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: NavSectionKey) => void;
}

export const GlobalAiAssistantDrawer: React.FC<GlobalAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { currentUser } = useAuth();
  const { askCommandCenterAi } = useData();

  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string; actions?: any[] }>>([
    {
      role: 'assistant',
      text: `Hello **${currentUser.name}**! I am the **Booking Bridge Intelligence Assistant**.\n\nAs the **${currentUser.role}**, you can ask me anything regarding active leads, team focus, conversion rates, seasonal packages, or pending approvals.`,
    },
  ]);

  if (!isOpen) return null;

  const roleSuggestions: Record<string, string[]> = {
    Founder: [
      'Summarize today\'s business pipeline and critical risks.',
      'Which leads have the highest booking value right now?',
      'What are our top revenue opportunities this week?'
    ],
    'Sales Manager': [
      'Which leads need immediate sales attention?',
      'Show my team\'s hottest opportunities in Kashmir and Ladakh.',
      'What are the main objections our leads are facing?'
    ],
    'Sales Executive': [
      'Which of my leads should I follow up with today?',
      'Draft a WhatsApp response for Rohit Sharma regarding Gondola Phase 2.',
      'What is our best pricing package for a 6-pax family?'
    ],
    Marketing: [
      'What content should we create this week for Kashmir Autumn?',
      'Generate 3 high-converting hooks for Gulmarg snow packages.',
      'Analyze our lead source platforms and recommend budget allocation.'
    ],
    Operations: [
      'Are there any transit or logistical issues in our upcoming bookings?',
      'List all Kashmir and Ladakh departures for the next 7 days.',
      'Which hotel allocations require advance confirmation?'
    ],
    Accounts: [
      'What is our total outstanding payment balance on active quotes?',
      'Summarize customer advance collections this month.',
      'Review pending discount approvals.'
    ],
    Admin: [
      'Show system health, user roles, and recent audit logs.',
      'Are there any pending AI actions waiting for review?',
      'Summarize team activity logs for today.'
    ]
  };

  const currentSuggestions = roleSuggestions[currentUser.role] || roleSuggestions.Founder;

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || inputQuery;
    if (!query.trim() || isProcessing) return;

    const userMsg = query.trim();
    setInputQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsProcessing(true);

    try {
      const response = await askCommandCenterAi(userMsg);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: response.answer,
          actions: response.suggestedActions,
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `⚠️ I was unable to complete the query: ${err.message || 'Server error'}. Please verify backend server status.`,
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div
        id="ai-drawer-backdrop"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity"
      />
      <div
        id="global-ai-drawer"
        className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[6px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#F0A608]" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-xs font-bold text-white">Ask Booking Bridge AI</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#7056EE] text-white font-medium">Role-Aware</span>
              </div>
              <p className="text-[10px] text-slate-400">Grounded in verified database records • {currentUser.role}</p>
            </div>
          </div>
          <button
            id="close-ai-drawer"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`p-3.5 rounded-2xl max-w-[90%] space-y-2 ${
                  msg.role === 'user'
                    ? 'bg-[#7056EE] text-white rounded-tr-xs'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-xs'
                }`}
              >
                <div className="prose prose-xs max-w-none whitespace-pre-wrap leading-relaxed">
                  {msg.text}
                </div>

                {msg.actions && msg.actions.length > 0 && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Suggested OS Actions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.actions.map((act: any, aIdx: number) => (
                        <button
                          key={aIdx}
                          id={`ai-suggested-action-${aIdx}`}
                          onClick={() => {
                            if (act.actionType === 'VIEW_LEAD' || act.actionType === 'VIEW_PIPELINE') {
                              onNavigate('leads');
                            } else if (act.actionType === 'CREATE_TASK') {
                              onNavigate('tasks');
                            } else if (act.actionType === 'RUN_CAMPAIGN') {
                              onNavigate('marketing-ai');
                            }
                            onClose();
                          }}
                          className="px-2.5 py-1 bg-white border border-slate-300 hover:border-[#7056EE] hover:text-[#7056EE] rounded-lg text-[11px] font-medium text-slate-700 transition-colors flex items-center space-x-1 shadow-2xs"
                        >
                          <span>{act.label}</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex items-center space-x-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin text-[#7056EE]" />
              <span className="text-xs">Analyzing system database & computing response...</span>
            </div>
          )}
        </div>

        {/* Role Quick Prompts */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-1.5">
          <div className="flex items-center space-x-1.5 text-[11px] font-bold text-slate-600">
            <Lightbulb className="w-3.5 h-3.5 text-[#F0A608]" />
            <span>Suggested questions for {currentUser.role}:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {currentSuggestions.map((sug, sIdx) => (
              <button
                key={sIdx}
                id={`role-quick-prompt-${sIdx}`}
                onClick={() => handleSend(sug)}
                className="text-left text-[11px] px-2.5 py-1 bg-white border border-slate-200 hover:border-[#7056EE] hover:bg-[#7056EE]/5 rounded-lg text-slate-700 transition-colors truncate max-w-full"
              >
                "{sug}"
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-slate-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center space-x-2"
          >
            <input
              id="ai-drawer-input"
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask Booking Bridge AI about your data..."
              className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#7056EE] focus:border-[#7056EE]"
            />
            <button
              id="submit-ai-drawer-query"
              type="submit"
              disabled={isProcessing || !inputQuery.trim()}
              className="p-2.5 bg-[#7056EE] text-white rounded-xl hover:bg-[#5e43dc] disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

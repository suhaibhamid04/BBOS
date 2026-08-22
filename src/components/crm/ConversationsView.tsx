import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Conversation, Message } from '../../types';
import {
  MessageSquare,
  Send,
  Sparkles,
  Phone,
  Bot,
  User,
  CheckCheck,
  Search,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';

export const ConversationsView: React.FC = () => {
  const { conversations, messages, sendMessage, leads } = useData();
  const { currentUser } = useAuth();

  const [activeConvId, setActiveConvId] = useState<string>(conversations[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeMessages = messages.filter((m) => m.conversationId === activeConvId);
  const relatedLead = leads.find((l) => l.id === activeConv?.leadId);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConvId) return;
    await sendMessage(activeConvId, inputText.trim(), 'EMPLOYEE');
    setInputText('');
  };

  const handleAiDraftSuggestion = () => {
    if (!relatedLead) {
      setInputText(`Hello ${activeConv?.customerName || 'there'}, thank you for contacting Booking Bridge! How may we assist with your Kashmir or Ladakh journey today?`);
      return;
    }
    setInputText(
      `Hello ${relatedLead.customerName}! Regarding your upcoming ${relatedLead.destination} ${relatedLead.tripType} on ${relatedLead.travelStartDate}, we have reserved high-demand slots for your dates. Would you prefer our luxury houseboat on Nigeen Lake or a boutique cedar cottage in Pahalgam?`
    );
  };

  return (
    <div id="conversations-view" className="space-y-4 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Conversations & Client Chats</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Omnichannel Gateway
            </span>
          </div>
          <p className="text-xs text-slate-500">Unified WhatsApp, Instagram DM, and customer inbound chat records</p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex min-h-0">
        {/* Left Side: Conversation List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-3 border-b border-slate-200 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1.5 space-y-1">
            {conversations.map((conv) => {
              const isSelected = conv.id === activeConvId;
              return (
                <button
                  key={conv.id}
                  id={`conv-item-${conv.id}`}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`w-full p-3 rounded-xl text-left transition-all flex flex-col space-y-1 ${
                    isSelected
                      ? 'bg-[#7056EE]/10 border border-[#7056EE]/40'
                      : 'hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 truncate">{conv.customerName}</span>
                    <span className="text-[10px] text-slate-400">
                      {new Date(conv.lastMessageTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 truncate max-w-[180px]">{conv.lastMessage}</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                      {conv.channel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Active Chat Box */}
        {activeConv ? (
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            {/* Chat Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-[#F0A608]/20 text-[#F0A608] font-bold text-xs flex items-center justify-center border border-[#F0A608]/40">
                  {activeConv.customerName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">{activeConv.customerName}</h3>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                    <span>{activeConv.channel} • {activeConv.customerPhone}</span>
                    {relatedLead && (
                      <span className="font-bold text-[#7056EE] bg-[#7056EE]/10 px-1.5 py-0.2 rounded">
                        Lead #{relatedLead.id.slice(-4)} ({relatedLead.destination})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  id="ai-generate-reply-button"
                  onClick={handleAiDraftSuggestion}
                  className="px-3 py-1.5 bg-[#7056EE]/10 hover:bg-[#7056EE]/20 text-[#7056EE] text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors border border-[#7056EE]/20"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" />
                  <span>Suggest AI Reply</span>
                </button>
              </div>
            </div>

            {/* Chat Transcript */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs bg-slate-50/30">
              {activeMessages.map((msg) => {
                const isEmployee = msg.senderType === 'EMPLOYEE';
                const isCustomer = msg.senderType === 'CUSTOMER';
                const isAi = msg.senderType === 'AI';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl space-y-1 shadow-2xs ${
                        isCustomer
                          ? 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                          : isAi
                          ? 'bg-purple-600 text-white rounded-tr-xs'
                          : 'bg-slate-900 text-white rounded-tr-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between space-x-3 text-[10px] opacity-75">
                        <span className="font-semibold">{msg.senderName}</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-white flex items-center space-x-2">
              <input
                id="conversation-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Reply to ${activeConv.customerName} on ${activeConv.channel}...`}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#7056EE]"
              />
              <button
                id="send-message-button"
                type="submit"
                className="p-2.5 bg-[#7056EE] text-white rounded-xl hover:bg-[#5e43dc] transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">
            Select a conversation to view transcript.
          </div>
        )}
      </div>
    </div>
  );
};

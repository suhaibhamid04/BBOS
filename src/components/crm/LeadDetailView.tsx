import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { 
  ArrowLeft, Bot, Calendar, Clock, DollarSign, Flame, GitPullRequest, 
  MapPin, MessageSquare, Phone, Plus, Star, Sparkles, Building2, User, ChevronDown
} from 'lucide-react';
import { LeadStatus } from '../../types';
import { AiSalesHeadTab } from './AiSalesHeadTab';

interface Props {
  leadId: string;
  onNavigate: (section: any, targetId?: string) => void;
}

export const LeadDetailView: React.FC<Props> = ({ leadId, onNavigate }) => {
  const { leads, customers, updateLeadStatus, runSalesAiAnalysis } = useData();
  const { currentUser } = useAuth();
  
  const lead = leads.find(l => l.id === leadId);
  const customer = lead ? customers.find(c => c.id === lead.customerId) : null;
  
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'AI_SALES_HEAD' | 'CONVERSATION' | 'TASKS' | 'QUOTES' | 'AUDIT'>('SUMMARY');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);

  if (!lead) {
    return <div className="p-8 text-center text-slate-500">Lead not found.</div>;
  }

  const handleAiAction = async (action: string) => {
    setIsAnalyzing(true);
    setAiMenuOpen(false);
    try {
      if (action === 'Analyze Customer' || action === 'Summarize Lead') {
        await runSalesAiAnalysis(lead.id);
      }
      // Placeholder for other actions - would dispatch to specific AI endpoints
    } catch (e) {
      console.error(e);
    }
    setIsAnalyzing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW': return 'bg-blue-100 text-blue-800';
      case 'CONTACTED': return 'bg-indigo-100 text-indigo-800';
      case 'QUALIFIED': return 'bg-purple-100 text-purple-800';
      case 'QUOTE_SENT': return 'bg-amber-100 text-amber-800';
      case 'NEGOTIATION': return 'bg-[#F0A608]/20 text-amber-900';
      case 'BOOKED': return 'bg-emerald-100 text-emerald-800';
      case 'LOST': return 'bg-rose-100 text-rose-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onNavigate('sales-workspace')}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900">{lead.customerName}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getStatusColor(lead.status)}`}>
                {lead.status.replace('_', ' ')}
              </span>
              {lead.priority === 'HIGH' || lead.priority === 'URGENT' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  <Flame className="w-3 h-3" /> {lead.priority}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {lead.destination}</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {lead.travelStartDate && new Date(lead.travelStartDate).toLocaleDateString()}</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <button 
              onClick={() => setAiMenuOpen(!aiMenuOpen)}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 bg-[#F0A608]/10 text-amber-900 hover:bg-[#F0A608]/20 font-medium text-sm rounded-lg transition-colors border border-[#F0A608]/20"
            >
              <Sparkles className={`w-4 h-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
              {isAnalyzing ? 'Analyzing...' : 'AI Assist'}
              <ChevronDown className="w-4 h-4" />
            </button>
            {aiMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
                {[
                  'Summarize Lead',
                  'Analyze Customer',
                  'Suggest Reply',
                  'Handle Objection',
                  'Recommend Package',
                  'Suggest Follow-up',
                  'Generate Sales Strategy',
                  'Escalate to Manager'
                ].map(action => (
                  <button
                    key={action}
                    onClick={() => handleAiAction(action)}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#7056EE] transition-colors"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-[#7056EE] text-white hover:bg-[#5b42d6] font-medium text-sm rounded-lg transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Create Quote
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="flex space-x-6 overflow-x-auto custom-scrollbar">
          {['SUMMARY', 'AI_SALES_HEAD', 'CONVERSATION', 'TASKS', 'QUOTES', 'AUDIT'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab 
                  ? 'border-[#7056EE] text-[#7056EE]' 
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab === 'AI_SALES_HEAD' ? (
                <span className="flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> AI Sales Head</span>
              ) : (
                tab.charAt(0) + tab.slice(1).toLowerCase()
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'SUMMARY' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Customer & Trip Details */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* AI Insights Panel */}
                {(lead.leadScore > 0 || lead.scoreReasoning) && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-amber-900">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="font-bold text-sm uppercase tracking-wider">AI Sales Insights</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">Lead Score</div>
                        <div className="text-2xl font-bold text-amber-900">{lead.leadScore}/100</div>
                      </div>
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">Booking Prob.</div>
                        <div className="text-2xl font-bold text-emerald-700">{lead.bookingProbability || 0}%</div>
                      </div>
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">Price Sensitivity</div>
                        <div className="text-sm font-bold text-amber-900 mt-1">Medium</div>
                      </div>
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">Urgency</div>
                        <div className="text-sm font-bold text-amber-900 mt-1">High</div>
                      </div>
                    </div>
                    {lead.scoreReasoning && (
                      <p className="text-sm text-amber-900 leading-relaxed bg-white/40 p-4 rounded-lg">
                        {lead.scoreReasoning}
                      </p>
                    )}
                  </div>
                )}

                {/* Trip Requirements */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <GitPullRequest className="w-4 h-4 text-slate-400" /> Trip Requirements
                    </h3>
                  </div>
                  <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Destination</div>
                      <div className="text-sm font-medium text-slate-900">{lead.destination}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Trip Type</div>
                      <div className="text-sm font-medium text-slate-900">{lead.tripType}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Travelers</div>
                      <div className="text-sm font-medium text-slate-900">{lead.travelerCount} Persons</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Dates</div>
                      <div className="text-sm font-medium text-slate-900">
                        {lead.travelStartDate && new Date(lead.travelStartDate).toLocaleDateString()} - 
                        {lead.travelEndDate && new Date(lead.travelEndDate).toLocaleDateString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Budget</div>
                      <div className="text-sm font-medium text-slate-900">₹{lead.budget.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Hotel/Transport Pref</div>
                      <div className="text-sm font-medium text-slate-900">{lead.hotelPreference || 'Not specified'}</div>
                    </div>
                  </div>
                </div>

                {/* Notes & Internal Context */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-slate-400" /> Internal Notes
                    </h3>
                  </div>
                  <div className="p-5">
                    {lead.notes ? (
                      <div className="text-sm text-slate-700 whitespace-pre-wrap">{lead.notes}</div>
                    ) : (
                      <div className="text-sm text-slate-400 italic">No notes added yet.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Meta & Actions */}
              <div className="space-y-6">
                
                {/* Customer Summary Widget */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" /> Customer Summary
                    </h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                        {lead.customerName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900">{lead.customerName}</div>
                        <div className="text-xs text-slate-500">{customer?.customerType || 'B2C'} Customer</div>
                      </div>
                    </div>
                    <div className="pt-2 space-y-2 border-t border-slate-100">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Phone className="w-4 h-4 text-slate-400" /> {lead.customerPhone}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <MapPin className="w-4 h-4 text-slate-400" /> {customer?.city || 'Unknown City'}
                      </div>
                    </div>
                    {customer && (
                      <div className="pt-2 border-t border-slate-100">
                        <div className="text-xs text-slate-500 mb-1">Lifetime Value</div>
                        <div className="text-sm font-bold text-[#7056EE]">₹{customer.lifetimeValue.toLocaleString()}</div>
                        <div className="text-xs text-slate-500 mt-2 mb-1">Total Bookings</div>
                        <div className="text-sm font-medium text-slate-900">{customer.totalBookings} Completed</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pipeline Actions */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold text-slate-900">Pipeline State</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-2">Change Status</div>
                      <select 
                        value={lead.status}
                        onChange={(e) => updateLeadStatus(lead.id, e.target.value as LeadStatus)}
                        className="w-full bg-slate-50 border border-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-[#7056EE]"
                      >
                        <option value="NEW">New</option>
                        <option value="CONTACTED">Contacted</option>
                        <option value="QUALIFIED">Qualified</option>
                        <option value="QUOTE_SENT">Quote Sent</option>
                        <option value="NEGOTIATION">Negotiation</option>
                        <option value="BOOKED">Booked</option>
                        <option value="LOST">Lost</option>
                        <option value="NURTURE">Nurture</option>
                      </select>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-1">Assigned To</div>
                      <div className="text-sm font-medium text-slate-900">{lead.assignedEmployeeName}</div>
                    </div>
                    
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Source</div>
                      <div className="text-sm font-medium text-slate-900">{lead.sourcePlatform}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'AI_SALES_HEAD' && <AiSalesHeadTab leadId={leadId} />}

          {activeTab !== 'SUMMARY' && activeTab !== 'AI_SALES_HEAD' && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 flex items-center justify-center min-h-[400px]">
              <div className="space-y-3">
                <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                <p>This module section is actively being built for {activeTab}.</p>
                <p className="text-xs">Connecting to Firestore references...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

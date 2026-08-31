import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { 
  Sparkles, Brain, TrendingUp, Users, DollarSign, AlertCircle, 
  Clock, CheckCircle2, FileText, ChevronRight, Flame, Bot, Star
} from 'lucide-react';

export const SalesAiView: React.FC = () => {
  const { leads, quotes } = useData();
  const { currentUser, permissions } = useAuth();
  
  const [timeframe, setTimeframe] = useState<'WEEK' | 'MONTH' | 'QUARTER'>('MONTH');

  // Simulated AI metrics for the dashboard
  const activeLeads = leads.filter(l => l.status !== 'LOST' && l.status !== 'BOOKED');
  const hotLeads = activeLeads.filter(l => l.leadScore > 80);
  const totalPipeline = activeLeads.reduce((sum, l) => sum + l.budget, 0);
  const weightedPipeline = activeLeads.reduce((sum, l) => sum + (l.budget * ((l.bookingProbability || 50) / 100)), 0);
  
  const lowMarginQuotes = quotes.filter(q => q.status === 'SENT' && (q.discountAmount / q.totalAmount) > 0.1);
  const overdueFollowUps = activeLeads.filter(l => new Date(l.nextFollowUpAt) < new Date());

  const renderManagerView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Team Conversion</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">24.5%</div>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">↑ 2.1% from last month</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Avg Response Time</span>
            <Clock className="w-4 h-4 text-[#F0A608]" />
          </div>
          <div className="text-2xl font-black text-slate-900">14m</div>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">Within target (15m)</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">Hot Opportunities</span>
            <Flame className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{hotLeads.length}</div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">Score &gt; 80</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase">AI Actions Taken</span>
            <Bot className="w-4 h-4 text-[#7056EE]" />
          </div>
          <div className="text-2xl font-black text-slate-900">142</div>
          <p className="text-[10px] text-slate-500 font-bold mt-1">This {timeframe.toLowerCase()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-900">Overdue Follow-ups</h3>
            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full">{overdueFollowUps.length} Pending</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {overdueFollowUps.slice(0, 5).map(lead => (
              <div key={lead.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900">{lead.customerName}</span>
                  <span className="text-xs text-rose-600 font-bold">Overdue by 2 hrs</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Rep: {lead.assignedEmployeeName}</span>
                  <span>AI Score: {lead.leadScore}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-900">Low-Margin Quotes</h3>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">Requires Review</span>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {lowMarginQuotes.slice(0, 5).map(quote => (
              <div key={quote.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900">{quote.customerName}</span>
                  <span className="text-xs text-amber-600 font-bold">Margin &lt; 12%</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Quote: ₹{quote.finalAmount.toLocaleString()}</span>
                  <button className="text-[#7056EE] font-bold hover:underline">Inspect AI Reasoning</button>
                </div>
              </div>
            ))}
            {lowMarginQuotes.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">
                No low-margin quotes detected.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderFounderView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-xl p-6 shadow-md text-white">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-indigo-200 uppercase tracking-wider">Total Pipeline Value</span>
            <DollarSign className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="text-3xl font-black">₹{(totalPipeline / 100000).toFixed(1)}L</div>
          <p className="text-xs text-indigo-300 mt-2">Active opportunities</p>
        </div>
        
        <div className="bg-gradient-to-br from-[#7056EE] to-[#5b42d6] rounded-xl p-6 shadow-md text-white">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-purple-200 uppercase tracking-wider">Weighted Pipeline</span>
            <TrendingUp className="w-5 h-5 text-purple-300" />
          </div>
          <div className="text-3xl font-black">₹{(weightedPipeline / 100000).toFixed(1)}L</div>
          <p className="text-xs text-purple-200 mt-2">Based on AI win probability</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-xl p-6 shadow-md text-white">
          <div className="flex justify-between items-start mb-4">
            <span className="text-sm font-bold text-emerald-200 uppercase tracking-wider">High Value Ops</span>
            <Star className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="text-3xl font-black">{hotLeads.filter(l => l.budget > 100000).length}</div>
          <p className="text-xs text-emerald-200 mt-2">Budget &gt; 1L &amp; Score &gt; 80</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#7056EE]" /> AI Sales Recommendations
          </h3>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
              <div className="mt-0.5"><Sparkles className="w-4 h-4 text-emerald-500" /></div>
              <div>
                <p className="text-sm font-bold text-slate-900">Margin Optimization Opportunity</p>
                <p className="text-xs text-slate-600 mt-1">AI detected that 45% of honeymoon packages are sold with standard transport. Offering premium transport at booking could increase margin by 2.4%.</p>
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex gap-3">
              <div className="mt-0.5"><Sparkles className="w-4 h-4 text-amber-500" /></div>
              <div>
                <p className="text-sm font-bold text-slate-900">Lead Response Risk</p>
                <p className="text-xs text-slate-600 mt-1">Weekend response time dropped to 45m average, leading to a 15% lower AI Booking Probability score for weekend leads.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-slate-400" /> Pending Approvals
          </h3>
          <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-sm">
            <p>All AI-generated quotes and discounts have been approved.</p>
            <button className="mt-2 text-[#7056EE] font-bold text-xs hover:underline">View Approval Log</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div id="sales-ai-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#F0A608]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">AI Sales Intelligence</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manager and Founder insights, pipeline health, and team performance
          </p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {(['WEEK', 'MONTH', 'QUARTER'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                timeframe === t ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              This {t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {permissions.canViewFinancials ? renderFounderView() : renderManagerView()}
      
    </div>
  );
};

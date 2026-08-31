import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Lead, Customer, TravelPackage, Hotel, AiSalesPlaybookStep, AiObjectionAnalysis } from '../../types';
import { Sparkles, Brain, CheckCircle2, AlertTriangle, Lightbulb, MapPin, Bed, PackageSearch, MessageSquare, TrendingUp, DollarSign, Calendar, XCircle, ArrowRight, Plus } from 'lucide-react';

interface Props {
  leadId: string;
}

export const AiSalesHeadTab: React.FC<Props> = ({ leadId }) => {
  const { leads, customers, packages, hotels, updateLead, logAuditEvent } = useData();
  const { currentUser, permissions } = useAuth();
  
  const lead = leads.find(l => l.id === leadId);
  const customer = lead ? customers.find(c => c.id === lead.customerId) : null;

  const [activeSection, setActiveSection] = useState<'OVERVIEW' | 'RECOMMENDATIONS' | 'OPTIMIZATION' | 'OBJECTION'>('OVERVIEW');
  const [analyzing, setAnalyzing] = useState(false);

  if (!lead) return null;

  // Mocking AI analysis data based on the lead for demo purposes
  const aiScore = lead.leadScore || Math.floor(Math.random() * 40) + 60;
  const bookingProb = lead.bookingProbability || Math.floor(Math.random() * 30) + 50;

  const playbook: AiSalesPlaybookStep[] = [
    { step: 1, action: 'Clarify hotel preference', description: 'Ask if they prefer centrally located boutique hotels or luxury resorts.' },
    { step: 2, action: 'Send premium itinerary', description: 'Focus on experiential stays to match the high budget.' },
    { step: 3, action: 'Follow up tomorrow', description: 'Check if they reviewed the itinerary.' }
  ];

  const objectionAnalysis: AiObjectionAnalysis = {
    objectionType: 'PRICE',
    underlyingConcern: 'Value for money compared to online portals',
    customerSentiment: 'hesitant',
    recommendedStrategy: 'Highlight private transfers, 24/7 on-ground support, and premium inclusions.',
    suggestedResponse: 'I understand you found a cheaper package online. Unlike standard packages, our proposal includes private luxury transport, guaranteed upgraded rooms, and 24/7 local support. Would you like me to adjust the hotels to match that budget, or keep the premium experience?'
  };

  const handleCreateTasks = () => {
    alert('Tasks created from playbook!');
  };

  const handleUsePackage = (pkg: TravelPackage) => {
    alert(`Proposed trip built from package: ${pkg.title}. Action logged.`);
    logAuditEvent('AI_PACKAGE_PROPOSAL', 'LEAD', leadId, null, { packageId: pkg.id }, 'AI proposed package to trip builder');
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Intelligence */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Brain className="w-5 h-5 text-[#7056EE]" />
            <h3 className="font-bold text-slate-900">Customer Intelligence</h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">KNOWN DATA</p>
                <div className="space-y-2 text-sm text-slate-700">
                  <p><strong>Dest:</strong> {lead.destination}</p>
                  <p><strong>Budget:</strong> ₹{lead.budget.toLocaleString()}</p>
                  <p><strong>Travelers:</strong> {lead.travelerCount}</p>
                  <p><strong>Urgency:</strong> {lead.priority}</p>
                </div>
              </div>
              <div className="border-l border-slate-100 pl-4">
                <p className="text-[10px] uppercase font-bold text-[#7056EE] mb-1">AI INFERENCE</p>
                <div className="space-y-2 text-sm text-slate-700">
                  <p><strong>Intent:</strong> High</p>
                  <p><strong>Price Sensitivity:</strong> Medium</p>
                  <p><strong>Hotel Pref:</strong> Premium / Views</p>
                  <p><strong>Known Objections:</strong> Competitor Pricing</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lead Scoring & Probability */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold text-slate-900">Scoring & Probability</h3>
            </div>
            <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded uppercase">AI Estimate</span>
          </div>
          <div className="p-5 flex gap-6">
            <div className="flex-1 text-center border-r border-slate-100 pr-6">
              <p className="text-3xl font-black text-slate-900 mb-1">{aiScore}<span className="text-sm text-slate-400">/100</span></p>
              <p className="text-xs font-bold text-slate-500 uppercase">Lead Score</p>
              <div className="mt-3 text-left text-xs space-y-1">
                <p className="text-emerald-600 flex items-center gap-1"><Plus className="w-3 h-3" /> clear travel dates</p>
                <p className="text-emerald-600 flex items-center gap-1"><Plus className="w-3 h-3" /> realistic budget</p>
                <p className="text-rose-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> comparing competitors</p>
              </div>
            </div>
            <div className="flex-1 text-center">
              <p className="text-3xl font-black text-[#7056EE] mb-1">{bookingProb}%</p>
              <p className="text-xs font-bold text-slate-500 uppercase">Booking Probability</p>
              <div className="mt-3 text-left text-xs space-y-1">
                <p className="text-slate-600"><strong>Confidence:</strong> Medium</p>
                <p className="text-slate-500 mt-2">Reasons: High engagement, quote viewed.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sales Playbook */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-slate-900">Recommended Sales Playbook</h3>
          </div>
          <button onClick={handleCreateTasks} className="text-xs font-bold bg-[#7056EE] text-white px-3 py-1.5 rounded-lg hover:bg-[#5b42d6]">
            Create Tasks
          </button>
        </div>
        <div className="p-5">
          <div className="space-y-4">
            {playbook.map(step => (
              <div key={step.step} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center shrink-0">
                  {step.step}
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-900">{step.action}</p>
                  <p className="text-sm text-slate-500">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-[#7056EE] shrink-0" />
            <div>
              <p className="text-sm font-bold text-slate-900">Follow-up Intelligence</p>
              <p className="text-xs text-slate-600">Follow up tomorrow morning. Recommended message: "Hi {lead.customerName.split(' ')[0]}, just checking if you had a chance to review the itinerary?"</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRecommendations = () => (
    <div className="space-y-6">
      {/* Package Recommendations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <PackageSearch className="w-5 h-5 text-[#7056EE]" />
          <h3 className="font-bold text-slate-900">Package Recommendations</h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {packages.slice(0, 2).map(pkg => (
            <div key={pkg.id} className="border border-slate-200 rounded-lg p-4 hover:border-[#7056EE] transition-colors">
              <h4 className="font-bold text-slate-900">{pkg.title}</h4>
              <p className="text-xs text-slate-500 mb-3">{pkg.durationNights}N/{pkg.durationDays}D • {pkg.destination}</p>
              
              <div className="bg-slate-50 p-2 rounded text-xs mb-3">
                <strong>Why recommended:</strong> Matches budget, destination, and honeymoon trip type.
              </div>
              
              <div className="flex justify-between items-center mb-4 text-sm">
                <span className="font-bold text-slate-900">₹{pkg.basePrice.toLocaleString()}</span>
                {permissions.canViewMargins && (
                  <span className="text-xs font-bold text-emerald-600">Est. Margin: 18%</span>
                )}
              </div>
              <button onClick={() => handleUsePackage(pkg)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition-colors">
                Build Trip with AI
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Hotel Recommendations */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bed className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-slate-900">Hotel Recommendations</h3>
          </div>
          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">DEMO INVENTORY</span>
        </div>
        <div className="p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Hotel</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Selling Price</th>
                {permissions.canViewMargins && <th className="py-3 px-4">Margin</th>}
                <th className="py-3 px-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {hotels.slice(0, 3).map(hotel => (
                <tr key={hotel.id}>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{hotel.name}</p>
                    <p className="text-[10px] text-slate-500">Perfect for {lead.tripType}</p>
                  </td>
                  <td className="py-3 px-4">{hotel.category}</td>
                  <td className="py-3 px-4 font-bold">₹8,500/night</td>
                  {permissions.canViewMargins && <td className="py-3 px-4 text-emerald-600 font-bold">22%</td>}
                  <td className="py-3 px-4">
                    <button className="text-[11px] font-bold text-[#7056EE] hover:underline">Add to Trip</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderOptimization = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
        <DollarSign className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 mb-2">Smart Budget Optimization</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">Ask AI to optimize the proposed trip to fit a target budget while protecting margins.</p>
        
        <div className="max-w-xl mx-auto flex gap-2">
          <input 
            type="text" 
            placeholder="e.g. Keep this trip under ₹1,20,000"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <button className="px-4 py-2 bg-emerald-500 text-white font-bold text-sm rounded-lg hover:bg-emerald-600 transition-colors">
            Optimize
          </button>
        </div>
      </div>

      <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div>
            <h4 className="font-bold text-rose-900">Margin Protection Triggered</h4>
            <p className="text-sm text-rose-700 mt-1">
              Applying a 10% discount to reach ₹1,20,000 would drop the margin to 11%. 
              Your configured minimum permitted margin is 12%. 
            </p>
            <div className="mt-4 flex gap-3">
              <button className="text-xs font-bold bg-white text-rose-700 px-3 py-1.5 rounded-lg border border-rose-200 hover:bg-rose-100">
                Request Manager Approval
              </button>
              <button className="text-xs font-bold bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700">
                AI: Swap Hotel to Midscale
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderObjection = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-indigo-500" />
          <h3 className="font-bold text-slate-900">AI Objection Handler</h3>
        </div>
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 border-r border-slate-100 pr-6 space-y-4">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Identified Objection</p>
              <p className="font-bold text-slate-900">{objectionAnalysis.objectionType}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Underlying Concern</p>
              <p className="text-sm text-slate-700">{objectionAnalysis.underlyingConcern}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Customer Sentiment</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 uppercase">{objectionAnalysis.customerSentiment}</span>
            </div>
          </div>
          
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
              <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-2">Recommended Strategy</p>
              <p className="text-sm text-indigo-900">{objectionAnalysis.recommendedStrategy}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Suggested Response Draft</p>
              <div className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 min-h-[100px] whitespace-pre-wrap">
                {objectionAnalysis.suggestedResponse}
              </div>
              <div className="mt-3 flex justify-end">
                <button className="text-xs font-bold bg-[#7056EE] text-white px-4 py-2 rounded-lg hover:bg-[#5b42d6]">
                  Use Draft
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Competitor Response */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-sm text-slate-600">
        <p className="font-bold text-slate-900 mb-2">Competitor Analysis Note</p>
        <p>Competitor package details are not fully available in the conversation. Ask the customer for the inclusions before blindly matching the price. Never invent competitor pricing.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            AI Sales Head <Sparkles className="w-5 h-5 text-[#7056EE]" />
          </h2>
          <p className="text-xs text-slate-500">Your AI Sales Manager for every opportunity.</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-lg">
          {(['OVERVIEW', 'RECOMMENDATIONS', 'OPTIMIZATION', 'OBJECTION'] as const).map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                activeSection === section ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {section.charAt(0) + section.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'OVERVIEW' && renderOverview()}
      {activeSection === 'RECOMMENDATIONS' && renderRecommendations()}
      {activeSection === 'OPTIMIZATION' && renderOptimization()}
      {activeSection === 'OBJECTION' && renderObjection()}
      
      {/* AI Memory / Feedback Footer */}
      <div className="pt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" /> AI Sales Memory is active for this lead.
        </div>
        <div className="flex items-center gap-3">
          <span>Was this AI advice useful?</span>
          <button className="hover:text-emerald-600 font-bold">YES</button>
          <button className="hover:text-rose-600 font-bold">NO</button>
        </div>
      </div>
    </div>
  );
};

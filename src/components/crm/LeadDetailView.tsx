import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { 
  ArrowLeft, Bot, Calendar, Clock, DollarSign, Flame, GitPullRequest, 
  MapPin, MessageSquare, Phone, Plus, Star, Sparkles, Building2, User, ChevronDown, Plane, FileText, CheckCircle2
} from 'lucide-react';
import { AiSalesHeadTab } from './AiSalesHeadTab';
import { LeadStageControl } from './LeadStageControl';
import { CreateLeadModal } from './CreateLeadModal';

interface Props {
  leadId: string;
  onNavigate: (section: any, targetId?: string) => void;
}

export const LeadDetailView: React.FC<Props> = ({ leadId, onNavigate }) => {
  const { leads, customers, trips, quotes, bookings, createOrResumeLeadTrip, updateLead, runSalesAiAnalysis } = useData();
  
  const lead = leads.find(l => l.id === leadId);
  const customer = lead ? customers.find(c => c.id === lead.customerId) : null;
  
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'AI_SALES_HEAD' | 'CONVERSATION' | 'TASKS' | 'QUOTES' | 'AUDIT'>('SUMMARY');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [isBuildingPackage, setIsBuildingPackage] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const [isEditingLead, setIsEditingLead] = useState(false);

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

  const handleBuildTrip = async () => {
    if (!lead) return;
    try {
      setIsBuildingPackage(true);
      setWorkflowError('');
      const trip = await createOrResumeLeadTrip(lead.id);
      onNavigate('trips', trip.id);
    } catch (error: any) {
      setWorkflowError(error.message || 'Unable to open the Lead package.');
    } finally {
      setIsBuildingPackage(false);
    }
  };

  const linkedTrips = trips.filter(trip => trip.leadId === lead.id);
  const linkedQuotes = quotes.filter(quote => quote.leadId === lead.id);
  const linkedBookings = bookings.filter(booking => booking.leadId === lead.id);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW': return 'bg-blue-100 text-blue-800';
      case 'CONTACTED': return 'bg-indigo-100 text-indigo-800';
      case 'IN_PROGRESS': return 'bg-purple-100 text-purple-800';
      case 'QUOTE_SHARED': return 'bg-amber-100 text-amber-800';
      case 'NEGOTIATION': return 'bg-[#F0A608]/20 text-amber-900';
      case 'CONVERTED': return 'bg-emerald-100 text-emerald-800';
      case 'DROPPED': return 'bg-rose-100 text-rose-800';
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
              {lead.priority === 'HOT' ? (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                  <Flame className="w-3 h-3" /> {lead.priority}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-500 flex items-center gap-4 mt-1">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {lead.destination}</span>
              <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {lead.travelStartDate ? new Date(lead.travelStartDate).toLocaleDateString() : 'Dates TBD'}</span>
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative">
          <button data-testid="edit-lead" onClick={() => setIsEditingLead(true)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Edit Lead</button>
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
          <button
            id="btn-build-trip-from-lead"
            onClick={handleBuildTrip}
            disabled={isBuildingPackage}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-lg transition-colors border border-slate-200 shadow-2xs"
          >
            <Plane className="w-4 h-4 text-[#7056EE]" /> {isBuildingPackage ? 'Opening Package…' : linkedTrips.length ? 'Resume Package' : 'Build Package'}
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
                {(Number(lead.leadScore || 0) > 0 || lead.scoreReasoning) && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3 text-amber-900">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h3 className="font-bold text-sm uppercase tracking-wider">AI Sales Insights</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-white/60 p-3 rounded-lg border border-amber-100">
                        <div className="text-xs font-medium text-amber-700">Lead Score</div>
                        <div className="text-2xl font-bold text-amber-900">{lead.leadScore || 0}/100</div>
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
                      <div className="text-sm font-medium text-slate-900">{lead.tripType || 'Not specified'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Travelers</div>
                      <div className="text-sm font-medium text-slate-900">{lead.adults ?? '—'} adults · {lead.children || 0} children</div>
                      {(lead.childAges || []).length > 0 && <div data-testid="lead-detail-child-ages" className="text-xs text-slate-500">Ages: {(lead.childAges || []).join(', ')}</div>}
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Dates</div>
                      <div className="text-sm font-medium text-slate-900">
                        {lead.travelStartDate ? new Date(lead.travelStartDate).toLocaleDateString() : 'Not specified'}
                        {lead.travelEndDate ? ` - ${new Date(lead.travelEndDate).toLocaleDateString()}` : ''}
                        {lead.nights ? ` · ${lead.nights} nights` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Budget</div>
                      <div className="text-sm font-medium text-slate-900">{lead.budget === undefined ? 'Not specified' : `₹${lead.budget.toLocaleString()}`}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Preferences</div>
                      <div className="text-sm font-medium text-slate-900">{[lead.hotelPreference, lead.mealPlanPreference, lead.vehiclePreference].filter(Boolean).join(' · ') || 'Not specified'}</div>
                    </div>
                    <div><div className="text-xs font-medium text-slate-500 mb-1">Special requirements</div><div className="text-sm font-medium text-slate-900">{lead.specialRequirements || 'None recorded'}</div></div>
                    <div><div className="text-xs font-medium text-slate-500 mb-1">Tags</div><div className="text-sm font-medium text-slate-900">{lead.tags.join(', ') || 'None'}</div></div>
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
                      {lead.whatsAppNumber && <div className="text-sm text-slate-600">WhatsApp: {lead.whatsAppNumber}</div>}
                      {lead.customerEmail && <div className="text-sm text-slate-600">Email: {lead.customerEmail}</div>}
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
                    <LeadStageControl lead={lead} updateLead={updateLead} />
                    
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-xs font-medium text-slate-500 mb-1">Assigned To</div>
                      <div className="text-sm font-medium text-slate-900">{lead.assignedEmployeeName}</div>
                      <div className="text-xs text-slate-500">Team: {lead.salesTeamId || 'Not assigned'}</div>
                    </div>
                    
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-1">Source</div>
                      <div className="text-sm font-medium text-slate-900">{lead.sourcePlatform}</div>
                      {lead.sourceReference && <div className="text-xs text-slate-500">{lead.sourceReference}</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'AI_SALES_HEAD' && <AiSalesHeadTab leadId={leadId} />}

          {activeTab === 'QUOTES' && (
            <div className="space-y-4">
              {workflowError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{workflowError}</div>}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div><h3 className="text-sm font-bold text-slate-900">Commercial workflow</h3><p className="text-xs text-slate-500">Lead → Build Package → Calculate Cost → Create Quote → Send/Manage Quote</p></div>
                  <button data-testid="lead-build-package" onClick={handleBuildTrip} disabled={isBuildingPackage} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {linkedTrips.length ? 'Resume Package' : 'Build Package'}
                  </button>
                </div>
                {linkedTrips.length > 0 ? linkedTrips.map(trip => <div data-testid="lead-linked-trip" key={trip.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-xs">
                  <div><strong>{trip.title}</strong><p className="text-slate-500">{trip.status} · Costing {trip.costingStatus || 'PENDING'}</p></div>
                  <button onClick={() => onNavigate('trips', trip.id)} className="font-bold text-[#7056EE]">Open package →</button>
                </div>) : <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">No package has been built for this Lead.</p>}
                {linkedTrips.some(trip => trip.packageReview?.required) && <div data-testid="lead-package-review-warning" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"><p className="font-bold">Package review required</p><p>Apply the latest Lead travel details in the package and recalculate before creating or sharing a Quote.</p></div>}
                {linkedTrips.some(trip => trip.costingStatus !== 'CALCULATED') && <p className="mt-2 text-xs font-semibold text-amber-800">Recalculate package cost before creating a quote.</p>}
              </div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Quotes for this Lead</h3>
                <button
                  onClick={handleBuildTrip}
                  disabled={isBuildingPackage}
                  className="px-3 py-1.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5b42d6] transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" /> {linkedTrips.length ? 'Open Package' : 'Build Package'}
                </button>
              </div>

              {linkedQuotes.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {linkedQuotes.map(q => (
                    <div data-testid="lead-linked-quote" key={q.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{q.destination} Tour</span>
                          <span className="px-2 py-0.5 bg-purple-50 text-[#7056EE] font-bold text-[10px] rounded-md border border-purple-100">
                            V{q.version || 1}
                          </span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          q.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                          q.status === 'SENT' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {q.status}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                        <span className="text-slate-500">Final Quotation Value:</span>
                        <span className="font-black text-slate-900 text-sm">₹{q.finalAmount.toLocaleString('en-IN')}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Valid Until: {new Date(q.validUntil).toLocaleDateString()}</span>
                        <button
                          onClick={() => onNavigate('quotes', q.id)}
                          className="font-bold text-[#7056EE] hover:underline"
                        >
                          Open in Quote Builder &rarr;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No quotes generated yet for this lead</p>
                  <p className="text-xs text-slate-400 mt-1">Build and cost the package before creating a customer Quote.</p>
                </div>
              )}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-bold text-slate-900">Linked Bookings</h3>
                {linkedBookings.length > 0 ? linkedBookings.map(booking => (
                  <div data-testid="lead-linked-booking" key={booking.id} className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div><strong>{booking.bookingNumber || booking.id}</strong><p className="text-slate-500">{booking.status}</p></div>
                    <button onClick={() => onNavigate('bookings', booking.id)} className="font-bold text-[#7056EE]">Open booking &rarr;</button>
                  </div>
                )) : <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">No Booking is linked to this Lead yet.</p>}
              </div>
            </div>
          )}

          {activeTab !== 'SUMMARY' && activeTab !== 'AI_SALES_HEAD' && activeTab !== 'QUOTES' && (
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

      <CreateLeadModal isOpen={isEditingLead} onClose={() => setIsEditingLead(false)} onNavigate={onNavigate} lead={lead} />
    </div>
  );
};

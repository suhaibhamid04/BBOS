import React, { useState } from 'react';
import { Lead, LeadStatus, SalesAiAnalysisResult } from '../../types';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Flame,
  Sparkles,
  Phone,
  Mail,
  Calendar,
  Users,
  MapPin,
  Clock,
  Send,
  Loader2,
  CheckCircle2,
  FileText,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { PRESET_USERS } from '../../services/permissions';

interface LeadDetailDrawerProps {
  leadId: string | null;
  onClose: () => void;
  onNavigateToQuotes?: () => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({ leadId, onClose, onNavigateToQuotes }) => {
  const { leads, updateLead, updateLeadStatus, addLeadNote, assignLead, runSalesAiAnalysis, createQuote, packages } = useData();
  const { currentUser } = useAuth();

  const lead = leads.find((l) => l.id === leadId);

  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'SALES_AI' | 'NOTES' | 'QUOTE'>('OVERVIEW');
  const [newNote, setNewNote] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<SalesAiAnalysisResult | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);

  // Quote generator states
  const [selectedPackageId, setSelectedPackageId] = useState(packages[0]?.id || '');
  const [customDiscount, setCustomDiscount] = useState(2000);
  const [quoteCreatedSuccess, setQuoteCreatedSuccess] = useState(false);

  if (!lead) return null;

  const leadStatuses: LeadStatus[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'QUOTE_SENT',
    'NEGOTIATION',
    'BOOKED',
    'LOST',
    'NURTURE',
  ];

  const handleRunAi = async () => {
    setIsAnalyzing(true);
    try {
      const result = await runSalesAiAnalysis(lead.id);
      setAiResult(result);
      setActiveTab('SALES_AI');
    } catch (err: any) {
      console.error('Error analyzing lead with AI:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    await addLeadNote(lead.id, newNote.trim());
    setNewNote('');
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  const handleCreateQuote = async () => {
    const pkg = packages.find((p) => p.id === selectedPackageId) || packages[0];
    const totalAmount = pkg.basePrice * Math.max(1, Math.round(lead.travelerCount / 2));
    const finalAmount = Math.max(0, totalAmount - customDiscount);

    await createQuote({
      leadId: lead.id,
      customerId: lead.customerId,
      customerName: lead.customerName,
      destination: lead.destination,
      travelerCount: lead.travelerCount,
      packageId: pkg.id,
      packageName: pkg.title,
      totalAmount,
      discountAmount: customDiscount,
      finalAmount,
      status: 'SENT',
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      notes: `Customized for ${lead.travelerCount} Pax. Includes ${pkg.inclusions.slice(0, 2).join(', ')}`
    });

    await updateLeadStatus(lead.id, 'QUOTE_SENT');
    setQuoteCreatedSuccess(true);
  };

  return (
    <>
      <div id="lead-drawer-backdrop" onClick={onClose} className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 transition-opacity" />
      <div id="lead-detail-drawer" className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Flame className="w-5 h-5 text-[#F0A608]" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-bold text-white truncate">{lead.customerName}</h2>
                {lead.isDemo && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 bg-amber-500/20 text-[#F0A608] border border-[#F0A608]/40 rounded">
                    DEMO
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {lead.destination} • {lead.tripType} • ₹{lead.budget.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <button id="close-lead-drawer-btn" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Lead Score & AI Action Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 px-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-slate-600">Lead Score:</span>
              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                lead.leadScore >= 80 ? 'bg-emerald-100 text-emerald-800' :
                lead.leadScore >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {lead.leadScore}/100
              </span>
            </div>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500 font-medium">{lead.sourcePlatform}</span>
          </div>

          <button
            id="run-sales-ai-trigger"
            onClick={handleRunAi}
            disabled={isAnalyzing}
            className="px-3 py-1.5 bg-[#7056EE] hover:bg-[#5e43dc] text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-all shadow-xs disabled:opacity-60"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing with AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" />
                <span>Run Sales AI</span>
              </>
            )}
          </button>
        </div>

        {/* Drawer Tabs */}
        <div className="flex border-b border-slate-200 bg-white px-5 pt-2 space-x-4 text-xs font-semibold">
          <button
            id="tab-lead-overview"
            onClick={() => setActiveTab('OVERVIEW')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'OVERVIEW' ? 'border-[#7056EE] text-[#7056EE]' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Lead Overview
          </button>
          <button
            id="tab-lead-sales-ai"
            onClick={() => setActiveTab('SALES_AI')}
            className={`pb-2.5 border-b-2 transition-colors flex items-center space-x-1 ${
              activeTab === 'SALES_AI' ? 'border-[#7056EE] text-[#7056EE]' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" />
            <span>Sales AI Copilot</span>
          </button>
          <button
            id="tab-lead-notes"
            onClick={() => setActiveTab('NOTES')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'NOTES' ? 'border-[#7056EE] text-[#7056EE]' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Activity & Notes
          </button>
          <button
            id="tab-lead-quote"
            onClick={() => setActiveTab('QUOTE')}
            className={`pb-2.5 border-b-2 transition-colors ${
              activeTab === 'QUOTE' ? 'border-[#7056EE] text-[#7056EE]' : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Create Quote
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 text-xs space-y-5">
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-4">
              {/* Status Selector */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-semibold text-slate-700">Pipeline Stage</label>
                <div className="flex flex-wrap gap-1.5">
                  {leadStatuses.map((st) => (
                    <button
                      key={st}
                      id={`status-badge-${st}`}
                      onClick={() => updateLeadStatus(lead.id, st)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                        lead.status === st
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">Contact Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center space-x-2">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-[10px] text-slate-400">Phone / WhatsApp</p>
                      <p className="font-semibold text-slate-800">{lead.customerPhone}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-center space-x-2">
                    <Mail className="w-4 h-4 text-blue-600" />
                    <div>
                      <p className="text-[10px] text-slate-400">Email Address</p>
                      <p className="font-semibold text-slate-800">{lead.customerEmail || 'Not specified'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trip Specifications */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-500">Trip Specifications</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] text-slate-400">Destination & Type</span>
                    <p className="font-bold text-slate-900">{lead.destination}</p>
                    <p className="text-slate-600 text-[11px]">{lead.tripType}</p>
                  </div>
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
                    <span className="text-[10px] text-slate-400">Travel Dates & Pax</span>
                    <p className="font-bold text-slate-900">{lead.travelStartDate} to {lead.travelEndDate}</p>
                    <p className="text-slate-600 text-[11px]">{lead.travelerCount} Travelers</p>
                  </div>
                </div>
              </div>

              {/* Assignment Selector */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-semibold text-slate-700">Assigned Team Member</label>
                <select
                  id="drawer-assignee-select"
                  value={lead.assignedEmployeeId}
                  onChange={(e) => {
                    const u = PRESET_USERS.find(user => user.id === e.target.value);
                    if (u) assignLead(lead.id, u.id, u.name);
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white font-medium"
                >
                  {PRESET_USERS.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
              </div>

              {/* AI Score Reasoning Card */}
              {lead.scoreReasoning && (
                <div className="p-3.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-1">
                  <div className="flex items-center space-x-1.5 text-amber-900 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" />
                    <span>AI Lead Scoring Rationale</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{lead.scoreReasoning}</p>
                </div>
              )}
            </div>
          )}

          {/* Sales AI Copilot Tab */}
          {activeTab === 'SALES_AI' && (
            <div className="space-y-4">
              {!aiResult ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 mx-auto flex items-center justify-center">
                    <div className="w-full h-full bg-white rounded-[14px] flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-[#7056EE]" />
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Real-Time Sales AI Evaluation</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Evaluate customer intent, objections, recommended package, follow-up timing, and generate a customized WhatsApp reply draft.
                  </p>
                  <button
                    id="trigger-sales-ai-analysis-btn"
                    onClick={handleRunAi}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-[#7056EE] text-white font-semibold rounded-xl text-xs hover:bg-[#5e43dc]"
                  >
                    {isAnalyzing ? 'Computing AI Evaluation...' : 'Generate Sales AI Analysis'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* Summary & Intent */}
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Executive Summary</span>
                    <p className="font-semibold text-slate-900 leading-relaxed">{aiResult.summary}</p>
                    <div className="flex items-center space-x-2 pt-1">
                      <span className="text-[11px] font-semibold text-slate-600">Customer Intent:</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">{aiResult.intent}</span>
                    </div>
                  </div>

                  {/* Objections & Hesitations */}
                  <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Identified Objections</span>
                    <ul className="space-y-1">
                      {aiResult.objections.map((obj, i) => (
                        <li key={i} className="flex items-center space-x-2 text-slate-700">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended Operational Action */}
                  <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1.5">
                    <div className="flex items-center space-x-1.5 text-[#7056EE] font-bold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Recommended Sales Action</span>
                    </div>
                    <p className="text-slate-800 font-medium leading-relaxed">{aiResult.recommendedAction}</p>
                    <p className="text-[11px] text-purple-700 font-semibold">🕒 {aiResult.followUpRecommendation}</p>
                  </div>

                  {/* Tailored WhatsApp / Email Draft Reply */}
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Drafted Customer Reply (WhatsApp / Email)</span>
                      <button
                        id="copy-draft-reply-btn"
                        onClick={() => handleCopyDraft(aiResult.draftReply)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-[#7056EE] hover:bg-[#7056EE]/10 rounded flex items-center space-x-1"
                      >
                        {copiedDraft ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-600">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy Draft</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg text-slate-800 whitespace-pre-wrap font-mono text-[11px] leading-relaxed border border-slate-100">
                      {aiResult.draftReply}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Activity & Notes Tab */}
          {activeTab === 'NOTES' && (
            <div className="space-y-4">
              <form onSubmit={handleAddNote} className="space-y-2">
                <label className="block font-semibold text-slate-700">Add Operational Note / Call Summary</label>
                <textarea
                  id="drawer-add-note-input"
                  rows={3}
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Record customer preferences, call discussion, hotel requests..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
                />
                <button
                  id="submit-lead-note-btn"
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#7056EE] text-white font-semibold rounded-lg hover:bg-[#5e43dc]"
                >
                  Append Note
                </button>
              </form>

              <div className="space-y-2 pt-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Historical Notes</span>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {lead.notes || 'No historical notes yet.'}
                </div>
              </div>
            </div>
          )}

          {/* Create Quote Tab */}
          {activeTab === 'QUOTE' && (
            <div className="space-y-4">
              {quoteCreatedSuccess ? (
                <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-emerald-900 text-sm">Quotation Dispatched Successfully</h4>
                  <p className="text-xs text-emerald-800">
                    Quote has been logged and status updated to <strong>QUOTE_SENT</strong>.
                  </p>
                  <button
                    onClick={() => {
                      setQuoteCreatedSuccess(false);
                      if (onNavigateToQuotes) onNavigateToQuotes();
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold"
                  >
                    View All Quotes
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Select Travel Package Template</label>
                    <select
                      id="quote-package-select"
                      value={selectedPackageId}
                      onChange={(e) => setSelectedPackageId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      {packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.title} (₹{pkg.basePrice.toLocaleString('en-IN')})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Courtesy Discount (₹ INR)</label>
                    <input
                      id="quote-discount-input"
                      type="number"
                      value={customDiscount}
                      onChange={(e) => setCustomDiscount(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex justify-between text-slate-600">
                      <span>Base Package Price:</span>
                      <span>₹{(packages.find(p => p.id === selectedPackageId)?.basePrice || 58000).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Discount Applied:</span>
                      <span className="text-rose-600">- ₹{customDiscount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between font-black text-sm text-slate-900 pt-2 border-t border-slate-200">
                      <span>Net Final Price:</span>
                      <span className="text-[#7056EE]">
                        ₹{Math.max(0, (packages.find(p => p.id === selectedPackageId)?.basePrice || 58000) - customDiscount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <button
                    id="submit-generate-quote-btn"
                    onClick={handleCreateQuote}
                    className="w-full py-2.5 bg-[#7056EE] hover:bg-[#5e43dc] text-white font-bold rounded-xl shadow-sm"
                  >
                    Generate & Dispatch Quotation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

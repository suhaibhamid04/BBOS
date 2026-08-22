import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Lead, SalesAiAnalysisResult } from '../../types';
import {
  Sparkles,
  Bot,
  Flame,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Send,
  Loader2,
  Clock,
  ThumbsUp,
  MapPin
} from 'lucide-react';

export const SalesAiView: React.FC = () => {
  const { leads, runSalesAiAnalysis, updateLeadStatus } = useData();

  const [selectedLeadId, setSelectedLeadId] = useState<string>(leads[0]?.id || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<SalesAiAnalysisResult | null>(null);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [customQueryPrompt, setCustomQueryPrompt] = useState('');

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  const handleAnalyze = async () => {
    if (!selectedLeadId) return;
    setIsAnalyzing(true);
    try {
      const res = await runSalesAiAnalysis(selectedLeadId);
      setAnalysisResult(res);
    } catch (err) {
      console.error('Failed to run Sales AI:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  return (
    <div id="sales-ai-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#F0A608]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Sales AI Agent & Copilot</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/15 text-[#7056EE]">
              Gemini Powered
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Autonomous lead scoring, objection analysis, high-conversion reply drafting, and follow-up timing
          </p>
        </div>
      </div>

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Lead Selector & Context */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Select Target Lead</h3>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">Active CRM Leads</label>
              <select
                id="sales-ai-lead-select"
                value={selectedLeadId}
                onChange={(e) => {
                  setSelectedLeadId(e.target.value);
                  setAnalysisResult(null);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 font-semibold text-slate-900 focus:ring-2 focus:ring-[#7056EE]"
              >
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.customerName} — {l.destination} (₹{l.budget.toLocaleString('en-IN')}) [{l.status}]
                  </option>
                ))}
              </select>
            </div>

            {selectedLead && (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>{selectedLead.customerName}</span>
                  <span className="text-[#7056EE]">Score: {selectedLead.leadScore}/100</span>
                </div>
                <div className="space-y-1 text-slate-600 text-[11px]">
                  <p><strong>Destination:</strong> {selectedLead.destination} ({selectedLead.tripType})</p>
                  <p><strong>Dates:</strong> {selectedLead.travelStartDate} to {selectedLead.travelEndDate} ({selectedLead.travelerCount} Pax)</p>
                  <p><strong>Budget:</strong> ₹{selectedLead.budget.toLocaleString('en-IN')}</p>
                  <p><strong>Source:</strong> {selectedLead.sourcePlatform}</p>
                  <p><strong>Assigned:</strong> {selectedLead.assignedEmployeeName}</p>
                </div>
                {selectedLead.notes && (
                  <div className="pt-2 border-t border-slate-200 text-slate-700 text-[11px]">
                    <p className="font-semibold text-slate-900">Current Notes:</p>
                    <p className="mt-0.5 line-clamp-3">{selectedLead.notes}</p>
                  </div>
                )}
              </div>
            )}

            <button
              id="execute-sales-ai-btn"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !selectedLead}
              className="w-full py-2.5 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-sm disabled:opacity-60"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#F0A608]" />
                  <span>Evaluating Lead & Generating Insights...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#F0A608]" />
                  <span>Run Sales AI Evaluation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: AI Structured Output */}
        <div className="lg:col-span-7 space-y-4">
          {!analysisResult ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
              <Bot className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">Awaiting Sales AI Evaluation</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Select an active lead from the left and click "Run Sales AI Evaluation" to generate real-time lead score, objections, operational advice, and a drafted WhatsApp message.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-slate-900">AI Evaluation Report</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">
                    Confidence: {Math.round((analysisResult.confidence || 0.88) * 100)}%
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs text-slate-500">Calculated Lead Score:</span>
                  <span className="text-sm font-black text-[#7056EE] bg-[#7056EE]/10 px-2 py-0.5 rounded-md">
                    {analysisResult.leadScore}/100
                  </span>
                </div>
              </div>

              {/* Requirement Summary & Intent */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Intent Profile</span>
                <p className="font-semibold text-slate-900 leading-relaxed">{analysisResult.summary}</p>
                <div className="flex items-center space-x-2 pt-1">
                  <span className="text-[11px] text-slate-500 font-medium">Intent Category:</span>
                  <span className="text-[11px] font-bold text-[#7056EE]">{analysisResult.intent}</span>
                </div>
              </div>

              {/* Objections */}
              <div className="space-y-1.5 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Predicted / Stated Objections</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {analysisResult.objections.map((obj, i) => (
                    <div key={i} className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start space-x-2 text-slate-800">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="text-[11px]">{obj}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommended Action & Follow-up Timing */}
              <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2 text-xs">
                <div className="flex items-center space-x-1.5 text-[#7056EE] font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Recommended Sales Next Step</span>
                </div>
                <p className="text-slate-800 font-medium leading-relaxed">{analysisResult.recommendedAction}</p>
                <div className="flex items-center space-x-2 text-[11px] text-purple-800 font-semibold pt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{analysisResult.followUpRecommendation}</span>
                </div>
              </div>

              {/* Ready-to-Send Draft Reply */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    High-Converting WhatsApp / Email Draft
                  </span>
                  <button
                    id="sales-ai-copy-draft-btn"
                    onClick={() => handleCopy(analysisResult.draftReply)}
                    className="px-2.5 py-1 text-[11px] font-bold text-[#7056EE] hover:bg-[#7056EE]/10 rounded flex items-center space-x-1 transition-colors"
                  >
                    {copiedDraft ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied to Clipboard</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Draft Message</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                  {analysisResult.draftReply}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { DestinationRegion, MarketingAiGenerateResult } from '../../types';
import {
  Sparkles,
  Megaphone,
  Send,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export const MarketingAiView: React.FC = () => {
  const { runMarketingAiGenerate, submitForApproval, createContentItem } = useData();

  const [destination, setDestination] = useState<DestinationRegion>('Kashmir');
  const [objective, setObjective] = useState('Instagram Reel scripts and visual hooks');
  const [targetAudience, setTargetAudience] = useState('Couples and families researching Kashmir travel');
  const [tone, setTone] = useState('Clear, warm, and informative');
  const [specificFocus, setSpecificFocus] = useState('Use only details in this brief and mark every unsupported claim for verification');

  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<MarketingAiGenerateResult | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [submittedApproval, setSubmittedApproval] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setSubmittedApproval(false);
    setGenerationError(null);
    setResult(null);
    try {
      const res = await runMarketingAiGenerate({
        destination,
        objective,
        targetAudience,
        tone,
        specificFocus
      });
      setResult(res);
    } catch (err) {
      console.error('Failed to generate marketing assets:', err);
      setGenerationError(err instanceof Error ? err.message : 'Marketing AI is unavailable. Please retry later.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSubmitToApproval = async () => {
    if (!result) return;
    setApprovalError(null);
    try {
      await submitForApproval({
      actionType: 'PUBLISH_MARKETING_CAMPAIGN',
      summary: `Approve AI Marketing Content: "${result.campaignTitle}" (${destination})`,
      details: {
        campaignTitle: result.campaignTitle,
        adCopies: result.adCopies,
        instagramCaptions: result.instagramCaptions,
        videoHooks: result.videoHooks,
        visualPrompts: result.visualPrompts,
        targetAudience: result.targetAudienceRecommendation
      },
      submittedBy: 'AI_AGENT',
      requiresRole: 'FOUNDER',
      reason: 'AI marketing creatives require human leadership approval before publishing or spending ad budget.',
      impactLevel: 'MEDIUM',
      });

    // Also add to Content Calendar in PENDING state
      await createContentItem({
      title: result.campaignTitle,
      channel: 'Instagram',
      contentType: 'Reel',
      destination,
      caption: result.instagramCaptions[0] || result.adCopies[0],
      visualPrompt: result.visualPrompts[0] || '',
      hashtags: [],
      status: 'DRAFT',
      approvalStatus: 'PENDING',
      scheduledFor: '',
      generatedBy: 'AI',
      });
      setSubmittedApproval(true);
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : 'The approval request could not be created.');
    }
  };

  return (
    <div id="marketing-ai-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F0A608] to-[#7056EE] p-0.5 flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#F0A608]" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Marketing GenAI Engine</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/15 text-[#7056EE]">
              AI-generated draft
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Prepare draft concepts for human fact-checking. Generated content is never treated as approved or published.
          </p>
        </div>
      </div>

      {/* Main 2-Column Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Creative Brief Inputs */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4 text-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">1. Creative Generation Parameters</h3>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Destination Focus</label>
              <select
                id="genai-destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value as DestinationRegion)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold text-slate-900"
              >
                <option value="Kashmir">Kashmir (Srinagar, Gulmarg, Pahalgam, Sonamarg)</option>
                <option value="Ladakh">Ladakh (Leh, Nubra, Pangong Tso, Khardung La)</option>
                <option value="Jammu">Jammu & Vaishno Devi / Patnitop</option>
                <option value="Himachal">Himachal Pradesh</option>
                <option value="General">All Domestic India Travel</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Campaign Objective & Deliverables</label>
              <select
                id="genai-objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-semibold text-slate-900"
              >
                <option value="Instagram Reel scripts and visual hooks">Instagram Reel scripts and visual hooks</option>
                <option value="Meta Ads copy draft for lead generation">Meta Ads copy draft for lead generation</option>
                <option value="Carousel storytelling draft">Carousel storytelling draft</option>
                <option value="Seasonal travel email draft">Seasonal travel email draft</option>
                <option value="Complete Multi-Channel Launch Kit">Complete Multi-Channel Launch Kit</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Persona</label>
              <input
                id="genai-target-audience"
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Brand Voice & Atmosphere</label>
              <input
                id="genai-tone"
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Specific Angles / USP Details</label>
              <textarea
                id="genai-specific-focus"
                rows={3}
                value={specificFocus}
                onChange={(e) => setSpecificFocus(e.target.value)}
                placeholder="Add only verified facts or clearly identify details that need verification."
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>

            <button
              id="execute-genai-btn"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-2.5 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-sm disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#F0A608]" />
                  <span>Synthesizing Creatives with Gemini...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-[#F0A608]" />
                  <span>Generate Marketing Creative Package</span>
                </>
              )}
            </button>
            {generationError && (
              <div data-testid="marketing-ai-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
                <p className="font-bold">Marketing AI is unavailable</p>
                <p className="mt-1">{generationError}</p>
                <button type="button" onClick={handleGenerate} className="mt-2 rounded-lg border border-red-300 bg-white px-3 py-1.5 font-bold">Retry</button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Generated Creative Suite */}
        <div className="lg:col-span-7 space-y-4">
          {!result ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-2xs">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="font-bold text-slate-800 text-sm">No Marketing Creative Package Generated</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Configure your destination and target audience on the left, then click "Generate Marketing Creative Package" to create ad copies, video hooks, and visual prompts.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#7056EE]">AI-generated draft · requires fact-check and approval</span>
                  <h3 className="text-sm font-bold text-slate-900">{result.campaignTitle}</h3>
                </div>

                <button
                  id="submit-approval-btn"
                  onClick={handleSubmitToApproval}
                  disabled={submittedApproval}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs disabled:opacity-75"
                >
                  {submittedApproval ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Submitted to Approvals</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-[#F0A608]" />
                      <span>Submit for Founder Approval</span>
                    </>
                  )}
                </button>
              </div>
              {approvalError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800">Approval submission failed: {approvalError}</p>}

              {/* Video & Reel Hooks */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    High-Retention Reel / Video Hooks (First 3 Seconds)
                  </span>
                </div>
                <div className="space-y-1.5">
                  {result.videoHooks.map((hook, hIdx) => (
                    <div key={hIdx} className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl flex items-center justify-between">
                      <p className="text-amber-950 font-semibold">"{hook}"</p>
                      <button
                        onClick={() => handleCopy(hook, `hook-${hIdx}`)}
                        className="text-slate-400 hover:text-slate-700 p-1"
                      >
                        {copiedField === `hook-${hIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Meta Ad Copies */}
              <div className="space-y-2 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Meta Ad / Direct-Response Copies
                </span>
                <div className="space-y-2">
                  {result.adCopies.map((copy, cIdx) => (
                    <div key={cIdx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 relative group">
                      <button
                        onClick={() => handleCopy(copy, `ad-${cIdx}`)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-700 p-1 bg-white rounded-md border border-slate-200"
                      >
                        {copiedField === `ad-${cIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <p className="text-slate-800 whitespace-pre-wrap font-sans text-xs leading-relaxed pr-6">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Creative Visual Prompts (For Photographers / GenAI Images) */}
              <div className="space-y-2 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Visual Generation & Art Direction Prompts
                </span>
                <div className="space-y-1.5">
                  {result.visualPrompts.map((vp, vIdx) => (
                    <div key={vIdx} className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl flex items-start justify-between">
                      <p className="text-purple-950 italic text-[11px] leading-relaxed pr-4">{vp}</p>
                      <button
                        onClick={() => handleCopy(vp, `vp-${vIdx}`)}
                        className="text-purple-400 hover:text-purple-700 p-1"
                      >
                        {copiedField === `vp-${vIdx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

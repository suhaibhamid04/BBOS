import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Check, X, Clock, AlertTriangle, Sparkles, FileText, CheckCircle2 } from 'lucide-react';

export const ApprovalsView: React.FC = () => {
  const { approvals, approveApproval, rejectApproval } = useData();
  const { currentUser, permissions } = useAuth();

  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [rejectCommentModalId, setRejectCommentModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const filteredApprovals = approvals.filter((a) => filter === 'ALL' || a.status === filter);
  const pendingCount = approvals.filter((a) => a.status === 'PENDING').length;

  const handleApprove = async (id: string) => {
    await approveApproval(id, 'Approved after operational review.');
  };

  const handleReject = async (id: string) => {
    await rejectApproval(id, rejectReason || 'Declined during review.');
    setRejectCommentModalId(null);
    setRejectReason('');
  };

  return (
    <div id="approvals-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">AI & Human Approval Center</h2>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              pendingCount > 0 ? 'bg-amber-100 text-amber-900 font-bold' : 'bg-slate-100 text-slate-700'
            }`}>
              {pendingCount} Pending Review
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational sign-offs for high-discount quotations, automated marketing campaigns, and AI tool operations
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center space-x-1.5 bg-slate-200/80 p-1 rounded-xl text-xs">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
            <button
              key={st}
              id={`filter-approval-${st.toLowerCase()}`}
              onClick={() => setFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                filter === st ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Approvals List */}
      <div className="space-y-4">
        {filteredApprovals.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
            No approval requests found in this view.
          </div>
        ) : (
          filteredApprovals.map((item) => {
            const isPending = item.status === 'PENDING';
            const isAiOrigin = item.submittedBy === 'AI_AGENT';

            return (
              <div
                key={item.id}
                id={`approval-card-${item.id}`}
                className={`bg-white p-5 rounded-2xl border shadow-2xs space-y-4 transition-all ${
                  isPending ? 'border-amber-200 ring-1 ring-amber-200/50' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2">
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider ${
                        item.status === 'PENDING' ? 'bg-amber-100 text-amber-900' :
                        item.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {item.status}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isAiOrigin ? 'bg-[#7056EE]/15 text-[#7056EE]' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {isAiOrigin ? 'AI Initiated' : 'Team Member Initiated'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Target Role: <strong>{item.requiresRole}</strong>
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900">{item.summary}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{item.reason}</p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {isPending ? (
                      <>
                        <button
                          id={`reject-approval-btn-${item.id}`}
                          onClick={() => setRejectCommentModalId(item.id)}
                          className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-colors border border-rose-200"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                        <button
                          id={`approve-approval-btn-${item.id}`}
                          onClick={() => handleApprove(item.id)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center space-x-1.5 transition-all shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Approve Action</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-slate-500">
                        Reviewed by {item.reviewedByName || 'Management'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Payload preview if present */}
                {item.details && (
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 overflow-x-auto max-h-36">
                    <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(item.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reject Modal */}
      {rejectCommentModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-4 shadow-2xl border border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">Decline Approval Request</h3>
            <p className="text-xs text-slate-500">Provide an operational reason for rejecting this action:</p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Budget margin too low; refine itinerary first..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
            />
            <div className="flex justify-end space-x-2 text-xs">
              <button
                onClick={() => setRejectCommentModalId(null)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(rejectCommentModalId)}
                className="px-4 py-1.5 bg-rose-600 text-white font-bold rounded-lg"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

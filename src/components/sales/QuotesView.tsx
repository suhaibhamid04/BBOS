import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Quote } from '../../types';
import { FileText, Plus, CheckCircle2, Download, Send, Clock, Eye, Sparkles, X } from 'lucide-react';

export const QuotesView: React.FC = () => {
  const { quotes, packages } = useData();
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);

  return (
    <div id="quotes-view" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Travel Quotes & Itineraries</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {quotes.length} Generated
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Dispatched packages, customized margins, and client proposal status</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Quote ID & Recipient</th>
                <th className="py-3.5 px-4">Package & Destination</th>
                <th className="py-3.5 px-4">Pricing Breakdown</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Valid Until</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {quotes.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{q.customerName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">#{q.id}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-800">{q.destination}</p>
                    <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{q.packageName || 'Custom Package'}</p>
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">₹{q.finalAmount.toLocaleString('en-IN')}</p>
                    {q.discountAmount > 0 && (
                      <p className="text-[10px] text-rose-600 font-medium">Disc: ₹{q.discountAmount.toLocaleString('en-IN')}</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      q.status === 'SENT' ? 'bg-purple-100 text-purple-800' :
                      q.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-[11px]">
                    {new Date(q.validUntil).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedQuote(q)}
                      className="px-3 py-1 bg-slate-100 hover:bg-[#7056EE] hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition-colors"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quote Preview Modal */}
      {selectedQuote && (
        <div id="quote-preview-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="quote-preview-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FileText className="w-5 h-5 text-[#F0A608]" />
                <div>
                  <h3 className="text-sm font-bold text-white">Quotation #{selectedQuote.id}</h3>
                  <p className="text-xs text-slate-400">Recipient: {selectedQuote.customerName}</p>
                </div>
              </div>
              <button onClick={() => setSelectedQuote(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 bg-purple-50/50 border border-purple-200/80 rounded-xl space-y-2">
                <div className="flex justify-between font-bold text-slate-900 text-sm">
                  <span>{selectedQuote.destination} Signature Itinerary</span>
                  <span className="text-[#7056EE]">₹{selectedQuote.finalAmount.toLocaleString('en-IN')}</span>
                </div>
                <p className="text-slate-600">{selectedQuote.packageName || 'Comprehensive Kashmir Deluxe Itinerary'}</p>
                <div className="flex items-center space-x-4 text-[11px] text-slate-500 pt-1">
                  <span>Pax: {selectedQuote.travelerCount} Travelers</span>
                  <span>•</span>
                  <span>Validity: {new Date(selectedQuote.validUntil).toLocaleDateString()}</span>
                </div>
              </div>

              {selectedQuote.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-700 leading-relaxed">
                  <p className="font-bold text-slate-900 mb-1">Inclusions & Highlights:</p>
                  <p>{selectedQuote.notes}</p>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                <button
                  onClick={() => setSelectedQuote(null)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    alert(`Quote proposal for ${selectedQuote.customerName} copied to clipboard!`);
                    setSelectedQuote(null);
                  }}
                  className="px-4 py-2 bg-[#7056EE] text-white font-bold rounded-lg shadow-sm"
                >
                  Copy Proposal Link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { FileText, Search, Download, Eye, Send } from 'lucide-react';

export const VouchersView: React.FC = () => {
  const { vouchers, trips } = useData();
  const [searchTerm, setSearchTerm] = useState('');

  const getTripDetails = (tripId: string) => trips.find(t => t.id === tripId);

  return (
    <div id="vouchers-view" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Voucher Management</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/15 text-[#7056EE]">
              {vouchers.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Generate, view, and send booking vouchers to guests and suppliers.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search vouchers by ID or passenger name..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#7056EE] focus:ring-1 focus:ring-[#7056EE]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Voucher No.</th>
                <th className="py-3.5 px-4">Trip / Customer</th>
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Issue Date</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {vouchers.map((voucher) => {
                const trip = getTripDetails(voucher.tripId);
                return (
                  <tr key={voucher.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900 font-mono">{voucher.voucherNumber}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{trip?.tripName || 'Unknown Trip'}</p>
                      <p className="text-[11px] text-slate-500">{voucher.passengerName}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                        {voucher.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(voucher.issueDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        voucher.status === 'SENT' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {voucher.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 text-slate-400 hover:text-[#7056EE] rounded-md hover:bg-slate-100 transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-slate-100 transition-colors" title="Download PDF">
                          <Download className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-slate-400 hover:text-[#F0A608] rounded-md hover:bg-slate-100 transition-colors" title="Send to Guest">
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                    No vouchers generated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


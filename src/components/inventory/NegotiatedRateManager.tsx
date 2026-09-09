import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, Briefcase, CalendarDays, HelpCircle, FileText } from 'lucide-react';

interface NegotiatedRateManagerProps {
  propertyId: string;
}

export const NegotiatedRateManager: React.FC<NegotiatedRateManagerProps> = ({ propertyId }) => {
  const { negotiatedRates, roomCategories } = useData();
  const { permissions } = useAuth();
  
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');

  const propertyRooms = roomCategories.filter(r => r.propertyId === propertyId);
  const filteredRates = negotiatedRates.filter(r => 
    r.propertyId === propertyId && 
    (selectedRoomId === 'ALL' || r.roomCategoryId === selectedRoomId)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 text-rose-700 flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Negotiated Rates
          </h2>
          <p className="text-sm text-rose-600/70">Special group rates and one-off exceptions overriding standard rates.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
          >
            <option value="ALL">All Room Categories</option>
            {propertyRooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          
          {permissions.canManageNegotiatedRates && (
            <button className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Add Negotiated Rate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRates.map(rate => {
          const room = propertyRooms.find(r => r.id === rate.roomCategoryId);
          return (
            <div key={rate.id} className="bg-rose-50/30 border border-rose-200 rounded-xl p-5 hover:border-rose-300 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                
                {/* Left Col - Details */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px] font-bold tracking-wider uppercase">
                      {room?.name || 'Unknown Room'}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-800 text-white rounded text-[10px] font-bold tracking-wider uppercase">
                      Override
                    </span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Applied Trip / Group</span>
                    <p className="text-sm font-bold text-slate-900">{rate.tripId || 'Global Override'}</p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Specific Dates</span>
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <CalendarDays className="w-4 h-4 text-slate-400" />
                        {new Date(rate.dateFrom).toLocaleDateString()} 
                        <span className="text-slate-400 font-normal">to</span> 
                        {new Date(rate.dateTo).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-1.5 text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-100">
                    <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="line-clamp-2"><strong>Reason:</strong> {rate.reasoning}</span>
                  </div>
                </div>

                {/* Right Col - Pricing */}
                <div className="md:text-right bg-white p-3 rounded-lg border border-rose-100 min-w-[200px]">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Negotiated Rate (Per Night)</span>
                  <div className="flex items-baseline md:justify-end gap-1 mb-1">
                    <span className="text-rose-500 font-bold">{rate.currency}</span>
                    <span className="text-2xl font-bold text-rose-700">{rate.agreedBaseRate.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Authorized by: {rate.authorizedBy}
                  </p>
                </div>

                {/* Actions */}
                {permissions.canManageNegotiatedRates && (
                  <div className="flex items-center gap-1 border-t md:border-t-0 md:border-l border-rose-100 pt-3 md:pt-0 md:pl-3">
                    <button className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 rounded transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredRates.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-rose-200 rounded-xl bg-white/50">
            <Briefcase className="w-10 h-10 mb-3 text-rose-300" />
            <p className="font-medium text-slate-900">No negotiated rates found</p>
            <p className="text-sm">Standard rates apply to all bookings for this property.</p>
          </div>
        )}
      </div>
    </div>
  );
};

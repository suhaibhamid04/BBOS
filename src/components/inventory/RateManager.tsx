import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, CalendarDays, IndianRupee, HelpCircle, FileText } from 'lucide-react';
import { MEAL_PLAN_LABELS, TAX_TREATMENT_LABELS } from '../../types';

interface RateManagerProps {
  propertyId: string;
}

export const RateManager: React.FC<RateManagerProps> = ({ propertyId }) => {
  const { ratePeriods, roomCategories } = useData();
  const { permissions } = useAuth();
  
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');

  const propertyRooms = roomCategories.filter(r => r.propertyId === propertyId);
  const filteredRates = ratePeriods.filter(r => 
    r.propertyId === propertyId && 
    (selectedRoomId === 'ALL' || r.roomCategoryId === selectedRoomId)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Standard Rates</h2>
          <p className="text-sm text-slate-500">Manage base rates and supplements for supplier contracts.</p>
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
          
          {permissions.canManageAccommodation && (
            <button className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Add Rate
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredRates.map(rate => {
          const room = propertyRooms.find(r => r.id === rate.roomCategoryId);
          return (
            <div key={rate.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                
                {/* Left Col - Rate Details */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold tracking-wider uppercase">
                      {room?.name || 'Unknown Room'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                      rate.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {rate.status}
                    </span>
                    {rate.confirmationStatus === 'NEEDS_CONFIRMATION' && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold tracking-wider uppercase flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" /> Unconfirmed
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Validity Period</span>
                      <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                        <CalendarDays className="w-4 h-4 text-slate-400" />
                        {new Date(rate.validFrom).toLocaleDateString()} 
                        <span className="text-slate-400 font-normal">to</span> 
                        {rate.validTo ? new Date(rate.validTo).toLocaleDateString() : 'Open-Ended'}
                      </div>
                    </div>
                    
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Meal Plan</span>
                      <div className="text-sm font-bold text-slate-900">
                        {MEAL_PLAN_LABELS[rate.mealPlan] || rate.mealPlan}
                      </div>
                    </div>
                  </div>

                  {rate.notes && (
                    <div className="flex items-start gap-1.5 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span className="line-clamp-2">{rate.notes}</span>
                    </div>
                  )}
                </div>

                {/* Right Col - Pricing */}
                <div className="md:text-right bg-slate-50 p-3 rounded-lg border border-slate-100 min-w-[200px]">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Base Room Rate (Per Night)</span>
                  <div className="flex items-baseline md:justify-end gap-1 mb-1">
                    <span className="text-slate-500 font-bold">{rate.currency}</span>
                    <span className="text-2xl font-bold text-slate-900">{rate.baseRate.toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {TAX_TREATMENT_LABELS[rate.taxTreatment]}
                    {rate.taxTreatment === 'CUSTOM_TAX' && ` (${rate.customTaxPercent}%)`}
                  </p>
                </div>

                {/* Actions */}
                {permissions.canManageAccommodation && (
                  <div className="flex items-center gap-1 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-3">
                    <button className="p-1.5 text-slate-400 hover:text-[#7056EE] hover:bg-slate-100 rounded transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Supplements Strip */}
              {rate.supplements && rate.supplements.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-3">
                  {rate.supplements.map(sup => (
                    <div key={sup.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 border border-slate-100 rounded-md text-xs">
                      <span className="font-bold text-slate-600">{sup.name}</span>
                      <span className="text-slate-300">|</span>
                      <span className="font-bold text-[#7056EE] flex items-center">
                        {rate.currency} {sup.amount.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-500">({sup.unit.replace(/_/g, ' ')})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {filteredRates.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            <CalendarDays className="w-10 h-10 mb-3 text-slate-300" />
            <p className="font-medium text-slate-900">No standard rates found</p>
            <p className="text-sm">Adjust filters or add a new rate period.</p>
          </div>
        )}
      </div>
    </div>
  );
};

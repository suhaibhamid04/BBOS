import React from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { CalendarDays, Edit2, Trash2 } from 'lucide-react';
import { ActivityRatePeriod } from '../../types/activity';

export const ActivityRateManager: React.FC = () => {
  const { activityRatePeriods, addActivityRatePeriod, deleteActivityRatePeriod } = useData();
  const { permissions } = useAuth();

  const handleAddMockRate = async () => {
    try {
      await addActivityRatePeriod({
        activityMasterId: 'actm-01',
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        adultRate: 1500,
        childRate: 750,
        infantRate: 0,
        currency: 'INR',
        taxPercentage: 5,
        availabilityStatus: 'AVAILABLE'
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Activity Rates</h2>
          <p className="text-sm text-slate-500">Manage seasonal pricing for activities.</p>
        </div>
        {permissions.canManageOperations && (
          <button 
            onClick={handleAddMockRate}
            className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold shadow-sm transition-colors"
          >
            Add Mock Rate
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activityRatePeriods.map(rate => (
          <div key={rate.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <CalendarDays className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Act: {rate.activityMasterId}</h3>
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-bold">
                    {rate.availabilityStatus}
                  </div>
                </div>
              </div>
              {permissions.canManageOperations && (
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-[#7056EE] hover:bg-slate-100 rounded transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteActivityRatePeriod(rate.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Adult</span>
                <span className="font-semibold text-sm text-slate-900">{rate.currency} {rate.adultRate}</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Child</span>
                <span className="font-semibold text-sm text-slate-900">{rate.currency} {rate.childRate}</span>
              </div>
            </div>
            
            <div className="text-xs text-slate-500 text-center font-medium border-t border-slate-100 pt-2">
              Valid: {rate.validFrom} to {rate.validTo || 'Always'}
            </div>
          </div>
        ))}
        {activityRatePeriods.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
            No activity rates found. Add one to get started.
          </div>
        )}
      </div>
    </div>
  );
};

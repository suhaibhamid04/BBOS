import React from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { ActivitySquare, Edit2, Trash2, Clock, MapPin } from 'lucide-react';

export const ActivityMasterManager: React.FC = () => {
  const { activityMasters, addActivityMaster, deleteActivityMaster } = useData();
  const { permissions } = useAuth();

  const handleAddMockActivity = async () => {
    try {
      await addActivityMaster({
        supplierId: 'sup-01',
        name: 'Desert Safari',
        description: 'Evening desert safari with BBQ dinner',
        category: 'ADVENTURE',
        location: 'Dubai Desert',
        durationHours: 6,
        minParticipants: 1,
        maxParticipants: 100,
        inclusions: ['Dune bashing', 'BBQ Dinner', 'Camel ride'],
        exclusions: ['Alcoholic drinks'],
        cancellationPolicy: '24 hours prior',
        operatingDays: [1, 2, 3, 4, 5, 6, 7],
        active: true
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Activity Masters</h2>
          <p className="text-sm text-slate-500">Manage activity definitions, locations, and rules.</p>
        </div>
        {permissions.canManageOperations && (
          <button 
            onClick={handleAddMockActivity}
            className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold shadow-sm transition-colors"
          >
            Add Mock Activity
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activityMasters.map(act => (
          <div key={act.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <ActivitySquare className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{act.name}</h3>
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-bold">
                    {act.category}
                  </div>
                </div>
              </div>
              {permissions.canManageOperations && (
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-[#7056EE] hover:bg-slate-100 rounded transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteActivityMaster(act.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400"><Clock className="w-3 h-3" /> Duration</span>
                <span className="font-semibold text-sm text-slate-900">{act.durationHours} hours</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400"><MapPin className="w-3 h-3" /> Location</span>
                <span className="font-semibold text-sm text-slate-900 truncate" title={act.location}>{act.location}</span>
              </div>
            </div>
            
            <div className="text-xs text-slate-500 text-center font-medium border-t border-slate-100 pt-2">
              Status: <span className={act.active ? 'text-emerald-600' : 'text-slate-400'}>{act.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        ))}
        {activityMasters.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
            No activity masters found. Add one to get started.
          </div>
        )}
      </div>
    </div>
  );
};

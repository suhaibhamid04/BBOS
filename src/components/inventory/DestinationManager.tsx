import React from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { MapPin, Edit2, Trash2, Check, Navigation } from 'lucide-react';

export const DestinationManager: React.FC = () => {
  const { destinations } = useData();
  const { permissions } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Destinations</h2>
          <p className="text-sm text-slate-500">Manage destinations, altitudes, and categories.</p>
        </div>
        {permissions.canManageOperations && (
          <button className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold shadow-sm transition-colors">
            Add Destination
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {destinations.map(dest => (
          <div key={dest.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{dest.name}</h3>
                  <div className="text-xs text-slate-500 font-medium">
                    {dest.region}, {dest.state}
                  </div>
                </div>
              </div>
              {permissions.canManageOperations && (
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-slate-400 hover:text-[#7056EE] hover:bg-slate-100 rounded transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400"><Navigation className="w-3 h-3" /> Category</span>
                <span className="font-semibold text-sm text-slate-900">{dest.category}</span>
              </div>
              <div className="bg-slate-50 rounded-lg p-2 flex flex-col justify-center">
                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-400">Altitude</span>
                <span className="font-semibold text-sm text-slate-900">{dest.altitude ? `${dest.altitude}m` : 'N/A'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Status</span>
                <span className={`flex items-center gap-1 font-bold ${dest.active ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {dest.active ? <><Check className="w-3 h-3" /> Active</> : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

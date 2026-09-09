import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { RoomCategory } from '../../types';
import { Plus, Edit2, Trash2, Users, BedDouble, Check } from 'lucide-react';

interface RoomCategoryManagerProps {
  propertyId: string;
}

export const RoomCategoryManager: React.FC<RoomCategoryManagerProps> = ({ propertyId }) => {
  const { roomCategories } = useData();
  const { permissions } = useAuth();
  
  const categories = roomCategories.filter(r => r.propertyId === propertyId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Room Categories</h2>
          <p className="text-sm text-slate-500">Manage room types and occupancy limits.</p>
        </div>
        {permissions.canManageAccommodation && (
          <button className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
            <Plus className="w-4 h-4" />
            Add Room Category
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map(room => (
          <div key={room.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-[#7056EE]/30 transition-colors">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <BedDouble className="w-5 h-5 text-slate-500" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{room.name}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Max {room.maxAdults} Adults, {room.maxChildren} Children</span>
                  </div>
                </div>
              </div>
              {permissions.canManageAccommodation && (
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

            <p className="text-sm text-slate-600 mb-4 line-clamp-2 min-h-[40px]">
              {room.description || 'No description provided.'}
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Bed Configuration</span>
                <span className="font-medium text-slate-900">{room.bedConfiguration || 'Standard'}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Status</span>
                <span className={`flex items-center gap-1 font-bold ${room.active ? 'text-emerald-600' : 'text-slate-500'}`}>
                  {room.active ? <><Check className="w-3 h-3" /> Active</> : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            <BedDouble className="w-10 h-10 mb-3 text-slate-300" />
            <p className="font-medium text-slate-900">No room categories found</p>
            <p className="text-sm">Add a room category to start managing rates.</p>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Plus, Trash2, Image as ImageIcon } from 'lucide-react';
import { PropertyPhoto } from '../../types';

interface PhotoManagerProps {
  propertyId: string;
}

export const PhotoManager: React.FC<PhotoManagerProps> = ({ propertyId }) => {
  const { accommodationProperties } = useData();
  const { permissions } = useAuth();
  
  const property = accommodationProperties.find(p => p.id === propertyId);
  const photos = property?.photos || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Property Photos</h2>
          <p className="text-sm text-slate-500">Manage images used in Quote Builder and Trip Builder.</p>
        </div>
        {permissions.canManageAccommodation && (
          <button className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors">
            <Plus className="w-4 h-4" />
            Upload Photo
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {photos.map(photo => (
          <div key={photo.id} className="group relative aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
            <img src={photo.url} alt={photo.caption || 'Property'} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-3">
              <div className="flex justify-end">
                {permissions.canManageAccommodation && (
                  <button className="p-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded shadow-sm transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div>
                {photo.isPrimary && (
                  <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded uppercase tracking-wider mb-1 inline-block">
                    Primary
                  </span>
                )}
                {photo.caption && (
                  <p className="text-xs font-medium text-white truncate">{photo.caption}</p>
                )}
                <p className="text-[10px] text-white/70 uppercase tracking-wider">{photo.category}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {photos.length === 0 && (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
          <ImageIcon className="w-10 h-10 mb-3 text-slate-300" />
          <p className="font-medium text-slate-900">No photos available</p>
          <p className="text-sm">Upload photos to make this property look great in quotes.</p>
        </div>
      )}
    </div>
  );
};

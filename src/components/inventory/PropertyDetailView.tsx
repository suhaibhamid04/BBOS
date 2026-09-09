import React, { useState } from 'react';
import { AccommodationProperty } from '../../types';
import { ArrowLeft, Building2, BedDouble, CalendarDays, Briefcase, Image as ImageIcon, MapPin, AlignLeft, Info } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoomCategoryManager } from './RoomCategoryManager';
import { RateManager } from './RateManager';
import { NegotiatedRateManager } from './NegotiatedRateManager';
import { PhotoManager } from './PhotoManager';

interface PropertyDetailViewProps {
  property: AccommodationProperty;
  onBack: () => void;
}

type TabKey = 'details' | 'rooms' | 'rates' | 'negotiated' | 'photos';

export const PropertyDetailView: React.FC<PropertyDetailViewProps> = ({ property, onBack }) => {
  const { permissions } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('details');

  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: 'details', label: 'Property Details', icon: AlignLeft, show: true },
    { key: 'rooms', label: 'Room Categories', icon: BedDouble, show: true },
    { key: 'rates', label: 'Standard Rates', icon: CalendarDays, show: permissions.canViewSupplierRates },
    { key: 'negotiated', label: 'Negotiated Rates', icon: Briefcase, show: permissions.canViewSupplierRates },
    { key: 'photos', label: 'Photos', icon: ImageIcon, show: true },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <button 
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Inventory
        </button>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-slate-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {property.name}
                <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  property.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 
                  property.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 
                  'bg-amber-100 text-amber-700'
                }`}>
                  {property.status}
                </span>
              </h1>
              <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 font-medium">
                <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {property.city}, {property.location}</span>
                <span className="text-slate-300">•</span>
                <span>{property.propertyType}</span>
                {property.starCategory && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>{property.starCategory}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-6 border-b border-slate-100">
          {tabs.filter(t => t.show).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${
                  isActive 
                    ? 'border-[#7056EE] text-[#7056EE]' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'details' && (
          <div className="max-w-3xl space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <AlignLeft className="w-4 h-4 text-[#7056EE]" />
                Public Description
              </h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{property.description}</p>
              
              <div className="mt-6">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Amenities</h4>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((a, i) => (
                    <span key={i} className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {permissions.canManageAccommodation && property.internalNotes && (
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-6">
                <h3 className="font-bold text-rose-700 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Protected Internal Notes
                </h3>
                <p className="text-xs text-rose-600/70 font-medium mb-4 uppercase tracking-wider">
                  Visible to Ops/Accounts/Leadership only
                </p>
                <p className="text-sm text-rose-900 whitespace-pre-wrap">{property.internalNotes}</p>
              </div>
            )}
            
            <div className="bg-white border border-slate-200 rounded-xl p-6">
               <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Info className="w-4 h-4 text-[#7056EE]" />
                Contact Info & Status
              </h3>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Name</span>
                  <span className="text-slate-800 font-medium">{property.contactName || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Phone</span>
                  <span className="text-slate-800 font-medium">{property.contactPhone || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Email</span>
                  <span className="text-slate-800 font-medium">{property.contactEmail || '-'}</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider">Currency</span>
                  <span className="text-slate-800 font-medium">{property.currency}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rooms' && (
          <RoomCategoryManager propertyId={property.id} />
        )}

        {activeTab === 'rates' && permissions.canViewSupplierRates && (
          <RateManager propertyId={property.id} />
        )}

        {activeTab === 'negotiated' && permissions.canViewSupplierRates && (
          <NegotiatedRateManager propertyId={property.id} />
        )}

        {activeTab === 'photos' && (
          <PhotoManager propertyId={property.id} />
        )}
      </div>
    </div>
  );
};

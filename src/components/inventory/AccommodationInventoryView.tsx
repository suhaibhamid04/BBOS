import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Building2, Plus, Search, MapPin, Filter, Star, Eye } from 'lucide-react';
import { AccommodationProperty } from '../../types';
import { PropertyFormModal } from './PropertyFormModal';
import { PropertyDetailView } from './PropertyDetailView';

export const AccommodationInventoryView: React.FC = () => {
  const { accommodationProperties } = useData();
  const { permissions } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Filter properties
  const filteredProperties = accommodationProperties.filter(prop => {
    const matchesSearch = prop.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          prop.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCity = selectedCity === 'ALL' || prop.city === selectedCity;
    return matchesSearch && matchesCity;
  });

  // Extract unique cities
  const cities = ['ALL', ...Array.from(new Set(accommodationProperties.map(p => p.city)))];

  // If a property is selected, render the detail view
  if (selectedPropertyId) {
    const selectedProp = accommodationProperties.find(p => p.id === selectedPropertyId);
    if (selectedProp) {
      return (
        <PropertyDetailView 
          property={selectedProp} 
          onBack={() => setSelectedPropertyId(null)} 
        />
      );
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <Building2 className="w-6 h-6 text-[#7056EE]" />
              Accommodation Inventory
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage properties, room categories, and rate structures.</p>
          </div>
          {permissions.canManageAccommodation && (
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Property
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search properties or locations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
            >
              {cities.map(city => (
                <option key={city} value={city}>{city === 'ALL' ? 'All Locations' : city}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredProperties.map(property => (
            <div 
              key={property.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group cursor-pointer flex flex-col"
              onClick={() => setSelectedPropertyId(property.id)}
            >
              {/* Photo placeholder or real photo */}
              <div className="h-40 bg-slate-100 relative">
                {property.photos && property.photos.length > 0 ? (
                  <img 
                    src={property.photos[0].url} 
                    alt={property.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Building2 className="w-8 h-8 opacity-20" />
                    <span className="text-[10px] uppercase tracking-widest font-bold opacity-50">No Photo</span>
                  </div>
                )}
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-[10px] font-bold text-slate-700 tracking-wider">
                  {property.propertyType}
                </div>
                {property.preferredProperty && (
                  <div className="absolute top-3 right-3 bg-amber-500 text-white p-1 rounded-full shadow-sm">
                    <Star className="w-3 h-3 fill-current" />
                  </div>
                )}
              </div>

              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-slate-900 leading-tight group-hover:text-[#7056EE] transition-colors line-clamp-1">
                    {property.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{property.city}, {property.location}</span>
                </div>
                
                <p className="text-xs text-slate-600 line-clamp-2 mb-4 flex-1">
                  {property.description}
                </p>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    property.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 
                    property.status === 'ARCHIVED' ? 'bg-slate-100 text-slate-600' : 
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {property.status}
                  </span>
                  
                  <button className="text-[10px] font-bold text-[#7056EE] hover:text-[#5b43d6] uppercase tracking-wider flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProperties.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            <Building2 className="w-12 h-12 mb-3 text-slate-300" />
            <p className="font-medium text-slate-900">No properties found</p>
            <p className="text-sm">Try adjusting your search or filters.</p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <PropertyFormModal 
          onClose={() => setIsAddModalOpen(false)}
          onSave={async (data) => {
            console.log('Save property', data);
            // Will connect to DataContext soon
            setIsAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { X, Building2, MapPin, AlignLeft, Info } from 'lucide-react';
import { AccommodationProperty, PropertyType, PropertyStatus } from '../../types/accommodation';

interface PropertyFormModalProps {
  property?: AccommodationProperty | null;
  onClose: () => void;
  onSave: (data: Partial<AccommodationProperty>) => void;
}

export const PropertyFormModal: React.FC<PropertyFormModalProps> = ({ property, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<AccommodationProperty>>({
    name: property?.name || '',
    propertyType: property?.propertyType || 'HOTEL',
    location: property?.location || '',
    city: property?.city || '',
    starCategory: property?.starCategory || '',
    description: property?.description || '',
    amenities: property?.amenities || [],
    contactName: property?.contactName || '',
    contactPhone: property?.contactPhone || '',
    contactEmail: property?.contactEmail || '',
    address: property?.address || '',
    internalNotes: property?.internalNotes || '',
    preferredProperty: property?.preferredProperty || false,
    status: property?.status || 'ACTIVE',
    currency: property?.currency || 'INR',
  });

  const [amenityInput, setAmenityInput] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleAddAmenity = () => {
    if (amenityInput.trim() && !formData.amenities?.includes(amenityInput.trim())) {
      setFormData(prev => ({
        ...prev,
        amenities: [...(prev.amenities || []), amenityInput.trim()]
      }));
      setAmenityInput('');
    }
  };

  const handleRemoveAmenity = (amenity: string) => {
    setFormData(prev => ({
      ...prev,
      amenities: prev.amenities?.filter(a => a !== amenity)
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#7056EE]" />
            {property ? 'Edit Property' : 'Add New Property'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              Basic Information
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Property Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Property Type</label>
                <select
                  name="propertyType"
                  value={formData.propertyType}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="RESORT">Resort</option>
                  <option value="HOUSEBOAT">Houseboat</option>
                  <option value="HOMESTAY">Homestay</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Star Category</label>
                <select
                  name="starCategory"
                  value={formData.starCategory}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                >
                  <option value="">None / Unrated</option>
                  <option value="3 Star">3 Star</option>
                  <option value="4 Star">4 Star</option>
                  <option value="5 Star">5 Star</option>
                  <option value="5 Star Luxury">5 Star Luxury</option>
                  <option value="Boutique">Boutique</option>
                  <option value="Heritage">Heritage</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Location Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              Location Details
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">City *</label>
                <input
                  type="text"
                  name="city"
                  required
                  value={formData.city}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Region/Location *</label>
                <input
                  type="text"
                  name="location"
                  required
                  placeholder="e.g. Kashmir, Ladakh"
                  value={formData.location}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                />
              </div>
              
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Address</label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                />
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Description & Amenities */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlignLeft className="w-4 h-4 text-slate-400" />
              Description & Amenities
            </h3>
            
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Description (Public) *</label>
              <textarea
                name="description"
                required
                rows={3}
                value={formData.description}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Amenities</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={amenityInput}
                  onChange={(e) => setAmenityInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAmenity();
                    }
                  }}
                  placeholder="Add amenity and press Enter..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                />
                <button
                  type="button"
                  onClick={handleAddAmenity}
                  className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.amenities?.map((amenity, idx) => (
                  <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                    {amenity}
                    <button type="button" onClick={() => handleRemoveAmenity(amenity)} className="text-slate-400 hover:text-rose-500">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Internal Notes (Protected) */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-rose-600 uppercase tracking-wider flex items-center gap-2">
              <Info className="w-4 h-4 text-rose-500" />
              Internal Notes (Protected)
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              These notes are visible only to Operations, Accounts, and Leadership. Sales and Marketing cannot see this field.
            </p>
            
            <div>
              <textarea
                name="internalNotes"
                rows={3}
                placeholder="Contract details, supplier quirks, payment terms, operational warnings..."
                value={formData.internalNotes}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE] bg-rose-50/30"
              />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Status & Toggles */}
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="preferredProperty"
                  checked={formData.preferredProperty}
                  onChange={handleChange}
                  className="w-4 h-4 text-[#7056EE] border-slate-300 rounded focus:ring-[#7056EE]"
                />
                <span className="text-sm font-bold text-slate-700">Preferred Property</span>
              </label>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-bold text-slate-700">Status:</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
          </div>

        </form>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2 bg-[#7056EE] hover:bg-[#5b43d6] text-white rounded-md text-sm font-bold shadow-sm transition-colors"
          >
            {property ? 'Save Changes' : 'Create Property'}
          </button>
        </div>
      </div>
    </div>
  );
};

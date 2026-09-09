import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Building2, CalendarDays, Users, AlertTriangle } from 'lucide-react';
import { AccommodationProperty, RoomCategory, MealPlanType } from '../../types';

interface HotelInventoryPickerProps {
  date: string;
  tripAdults: number;
  tripChildren: number;
  onSelectRate: (data: { propertyId: string, propertyName: string, roomId: string, roomName: string, mealPlan: string, sellingPrice: number }) => void;
}

export const HotelInventoryPicker: React.FC<HotelInventoryPickerProps> = ({ date, tripAdults, tripChildren, onSelectRate }) => {
  const { accommodationProperties, roomCategories } = useData();
  const { currentUser } = useAuth();
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedMealPlan, setSelectedMealPlan] = useState<MealPlanType>('MAP');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProperties = accommodationProperties.filter(p => p.status === 'ACTIVE');
  const availableRooms = roomCategories.filter(r => r.propertyId === selectedPropertyId && r.active);

  useEffect(() => {
    if (activeProperties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(activeProperties[0].id);
    }
  }, [activeProperties]);

  useEffect(() => {
    if (availableRooms.length > 0) {
      setSelectedRoomId(availableRooms[0].id);
    } else {
      setSelectedRoomId('');
    }
  }, [selectedPropertyId, roomCategories]);

  useEffect(() => {
    if (selectedPropertyId && selectedRoomId) {
      calculateRate();
    }
  }, [selectedPropertyId, selectedRoomId, selectedMealPlan, date, tripAdults, tripChildren]);

  const calculateRate = async () => {
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    try {
      // Direct fetch to our backend API
      const res = await fetch('/api/accommodation/calculate-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer demo-token-${currentUser.id}` // Mock auth
        },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          roomCategoryId: selectedRoomId,
          checkIn: date,
          checkOut: new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0], // Next day
          adults: tripAdults,
          children: tripChildren,
          mealPlan: selectedMealPlan
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate rate');
      }
      
      setCalculatedRate(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSelect = () => {
    if (!calculatedRate || !selectedPropertyId || !selectedRoomId) return;
    const prop = accommodationProperties.find(p => p.id === selectedPropertyId);
    const room = roomCategories.find(r => r.id === selectedRoomId);
    
    onSelectRate({
      propertyId: selectedPropertyId,
      propertyName: prop?.name || 'Unknown',
      roomId: selectedRoomId,
      roomName: room?.name || 'Unknown',
      mealPlan: selectedMealPlan,
      sellingPrice: calculatedRate.summary.totalSellingPrice
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-[#7056EE]" />
        Phase 2B-2 Inventory Picker
      </h3>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Select Property</label>
          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
          >
            <option value="" disabled>Select Property</option>
            {activeProperties.map(p => (
              <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Room Category</label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
              disabled={availableRooms.length === 0}
            >
              {availableRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name} (Max: {r.maxAdults}A)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Meal Plan</label>
            <select
              value={selectedMealPlan}
              onChange={(e) => setSelectedMealPlan(e.target.value as MealPlanType)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
            >
              <option value="EP">EP (Room Only)</option>
              <option value="CP">CP (Breakfast)</option>
              <option value="MAP">MAP (Half Board)</option>
              <option value="AP">AP (Full Board)</option>
            </select>
          </div>
        </div>

        {/* Rate Result Area */}
        <div className="mt-4 p-4 rounded-lg bg-slate-50 border border-slate-100">
          {isCalculating ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-5 h-5 border-2 border-[#7056EE] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-rose-600 bg-rose-50 p-3 rounded border border-rose-100">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="text-xs font-medium">{error}</div>
            </div>
          ) : calculatedRate ? (
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Selling Price</span>
                <span className="text-lg font-bold text-slate-900">{calculatedRate.summary.currency} {calculatedRate.summary.totalSellingPrice.toLocaleString()}</span>
              </div>
              
              {/* Optional: Show internal cost if user has permission. The backend automatically strips it if they don't, 
                  so we just check if it exists in the payload. */}
              {calculatedRate.summary.totalSupplierCost && (
                <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2 mt-2">
                  <span className="font-bold text-slate-400">Supplier Cost (Protected)</span>
                  <span className="font-bold text-rose-600">{calculatedRate.summary.currency} {calculatedRate.summary.totalSupplierCost.toLocaleString()}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSelect}
                className="w-full mt-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors text-sm"
              >
                Use this Rate
              </button>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500 py-2">Select options to calculate rate.</div>
          )}
        </div>
      </div>
    </div>
  );
};

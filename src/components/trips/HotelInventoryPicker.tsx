import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Building2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { MealPlanType } from '../../types';

interface HotelInventoryPickerProps {
  checkInDate: string;
  nights: number;
  adults: number;
  childrenCount: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  onConfirm: (metadata: {
    propertyId: string;
    propertyName: string;
    roomCategoryId: string;
    roomCategoryName: string;
    mealPlan: MealPlanType;
    checkInDate: string;
    nights: number;
    adults: number;
    children: number;
    childrenWithBed: number;
    childrenWithoutBed: number;
    needsConfirmation: boolean;
    taxDescription: string;
  }) => void;
  onCancel: () => void;
}

export const HotelInventoryPicker: React.FC<HotelInventoryPickerProps> = ({ 
  checkInDate, 
  nights, 
  adults, 
  childrenCount, 
  childrenWithBed, 
  childrenWithoutBed, 
  onConfirm,
  onCancel
}) => {
  const { accommodationProperties, roomCategories } = useData();
  const { currentUser } = useAuth();
  
  const [destinationFilter, setDestinationFilter] = useState<string>('');
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedMealPlan, setSelectedMealPlan] = useState<MealPlanType>('MAP');
  
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProperties = useMemo(
    () => accommodationProperties.filter(p =>
      p.status === 'ACTIVE' &&
      (destinationFilter ? p.location === destinationFilter || p.city === destinationFilter : true)
    ),
    [accommodationProperties, destinationFilter]
  );

  const availableRooms = useMemo(
    () => roomCategories.filter(r => r.propertyId === selectedPropertyId && r.active),
    [roomCategories, selectedPropertyId]
  );

  const destinations = useMemo(
    () => Array.from(new Set(accommodationProperties.filter(p => p.status === 'ACTIVE').map(p => p.city))),
    [accommodationProperties]
  );

  useEffect(() => {
    if (activeProperties.length > 0 && !selectedPropertyId) {
      setSelectedPropertyId(activeProperties[0].id);
    }
  }, [activeProperties, selectedPropertyId]);

  useEffect(() => {
    if (availableRooms.length > 0) {
      setSelectedRoomId(availableRooms[0].id);
    } else {
      setSelectedRoomId('');
    }
  }, [selectedPropertyId, availableRooms]);

  const calculateRate = useCallback(async () => {
    if (!selectedPropertyId || !selectedRoomId || !checkInDate || nights < 1) return;
    
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    try {
      const res = await fetch('/api/accommodation/calculate-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          roomCategoryId: selectedRoomId,
          checkInDate,
          nights,
          adults,
          children: childrenCount,
          childrenWithBed,
          childrenWithoutBed,
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
  }, [selectedPropertyId, selectedRoomId, selectedMealPlan, checkInDate, nights, adults, childrenCount, childrenWithBed, childrenWithoutBed, currentUser.id]);

  useEffect(() => {
    if (selectedPropertyId && selectedRoomId) {
      calculateRate();
    }
  }, [calculateRate]);

  const handleSelect = () => {
    if (!calculatedRate || !calculatedRate.available || !selectedPropertyId || !selectedRoomId) return;
    
    onConfirm({
      propertyId: selectedPropertyId,
      propertyName: calculatedRate.propertyName || 'Unknown Property',
      roomCategoryId: selectedRoomId,
      roomCategoryName: calculatedRate.roomCategoryName || 'Unknown Room',
      mealPlan: selectedMealPlan,
      checkInDate,
      nights,
      adults,
      children: childrenCount,
      childrenWithBed,
      childrenWithoutBed,
      needsConfirmation: !!calculatedRate.needsConfirmation,
      taxDescription: calculatedRate.taxDescription || 'Taxes Extra'
    });
  };

  if (activeProperties.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#7056EE]" />
            Accommodation Inventory Selection
          </h3>
          <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 font-medium">Cancel</button>
        </div>
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">No Active Properties Found</p>
            <p className="text-xs text-amber-700 mt-1">Add active accommodation properties in the Inventory section before selecting hotels for a trip.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#7056EE]" />
          Accommodation Inventory Selection
        </h3>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-800 font-medium">Cancel</button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
           <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Destination</label>
            <select
              value={destinationFilter}
              onChange={(e) => {
                setDestinationFilter(e.target.value);
                setSelectedPropertyId('');
              }}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
            >
              <option value="">All Destinations</option>
              {destinations.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

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

        {/* Occupancy Info (Read-only as it's passed from Trip) */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-4 gap-2">
           <div><span className="block text-[10px] text-slate-500 uppercase font-bold">Check-In</span><span className="text-xs font-semibold">{checkInDate}</span></div>
           <div><span className="block text-[10px] text-slate-500 uppercase font-bold">Nights</span><span className="text-xs font-semibold">{nights}</span></div>
           <div><span className="block text-[10px] text-slate-500 uppercase font-bold">Adults</span><span className="text-xs font-semibold">{adults}</span></div>
           <div><span className="block text-[10px] text-slate-500 uppercase font-bold">Children</span><span className="text-xs font-semibold">{childrenCount} (CWB: {childrenWithBed}, CNB: {childrenWithoutBed})</span></div>
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
              {calculatedRate.available === false ? (
                 <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2 text-rose-600 bg-rose-50 p-3 rounded border border-rose-100">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold">Rate Not Available</div>
                        <div className="text-[11px] mt-0.5">{calculatedRate.reason || 'No valid rate could be calculated for these dates and occupancy.'}</div>
                      </div>
                    </div>
                    <button disabled className="w-full mt-2 py-2 bg-slate-200 text-slate-400 font-bold rounded-lg text-sm cursor-not-allowed">
                       Unavailable
                    </button>
                 </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Availability</span>
                    {calculatedRate.needsConfirmation ? (
                      <span className="px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> NEEDS CONFIRMATION
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md">
                        AVAILABLE
                      </span>
                    )}
                  </div>

                  {/* Price summary */}
                  <div className={`p-3 rounded-lg border ${
                    calculatedRate.needsConfirmation
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200'
                  }`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600">Total ({nights} night{nights !== 1 ? 's' : ''})</span>
                      <span className={`text-base font-black ${
                        calculatedRate.needsConfirmation ? 'text-amber-800' : 'text-emerald-800'
                      }`}>
                        ₹{(calculatedRate.totalAmount ?? calculatedRate.sellingPrice ?? 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    {calculatedRate.breakdown && (
                      <p className="text-[10px] text-slate-500 mt-1">{calculatedRate.breakdown}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">{calculatedRate.taxDescription || 'Taxes extra'}</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelect}
                    className="w-full mt-4 py-2.5 bg-[#7056EE] hover:bg-[#5e43dc] text-white font-bold rounded-lg transition-colors text-sm shadow-sm"
                  >
                    Confirm & Add to Trip
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500 py-2">Select options to check availability.</div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Compass, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ActivityPricingModel } from '../../types/activity';

interface ActivityInventoryPickerProps {
  date: string;
  defaultAdults: number;
  defaultChildren: number;
  onConfirm: (metadata: any) => void;
  onCancel: () => void;
}

export const ActivityInventoryPicker: React.FC<ActivityInventoryPickerProps> = ({ 
  date,
  defaultAdults,
  defaultChildren,
  onConfirm,
  onCancel
}) => {
  const { activities } = useData();
  const { currentUser } = useAuth();
  
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [pricingModel, setPricingModel] = useState<ActivityPricingModel>('PER_PERSON');
  
  // Specific params based on pricing model
  const [adults, setAdults] = useState(defaultAdults || 2);
  const [children, setChildren] = useState(defaultChildren || 0);
  const [infants, setInfants] = useState(0);
  const [vehicles, setVehicles] = useState(1);
  const [groups, setGroups] = useState(1);
  const [tickets, setTickets] = useState(1);
  const [hours, setHours] = useState(1);
  const [days, setDays] = useState(1);
  const [sessions, setSessions] = useState(1);

  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const activeActivities = activities.filter(a => a.active);

  useEffect(() => {
    if (activeActivities.length > 0 && !selectedActivityId) {
      setSelectedActivityId(activeActivities[0].id);
    }
  }, [activeActivities]);

  // When activity changes, we don't automatically know its pricing model unless we fetch the rate period first,
  // but for the picker UX, we can let the user pick the expected model or default to PER_PERSON.
  // Ideally the activity master might hint at the pricing model, but for now we let the user define it if it's dynamic.

  useEffect(() => {
    if (selectedActivityId) {
      calculateRate();
    }
  }, [selectedActivityId, pricingModel, date, adults, children, infants, vehicles, groups, tickets, hours, days, sessions]);

  const calculateRate = async () => {
    if (!selectedActivityId || !date) return;
    
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    
    try {
      const res = await fetch('/api/activities/calculate-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify({
          activityId: selectedActivityId,
          date,
          // We pass all params; the engine will use what it needs based on the active rate period's pricingModel
          adults,
          children,
          infants,
          vehicles,
          groups,
          tickets,
          hours,
          days,
          sessions
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch rate');
      if (!data.success) throw new Error(data.error || 'Failed to calculate rate');
      if (data.data.available === false) throw new Error(data.data.error || 'Rate unavailable');
      
      setCalculatedRate(data.data);
      // Update UI to match the actual pricing model used by the rate
      if (data.data.pricingModel) {
        setPricingModel(data.data.pricingModel);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfirm = () => {
    if (!calculatedRate) return;

    const activity = activities.find(a => a.id === selectedActivityId);

    onConfirm({
      activityId: selectedActivityId,
      activityName: activity?.name || 'Activity',
      pricingModel: calculatedRate.pricingModel,
      date,
      needsConfirmation: calculatedRate.needsConfirmation,
      taxDescription: calculatedRate.taxDescription
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden flex flex-col max-h-[90vh]">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#F0A608]" /> Add Activity
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Step 1: Selection */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">1. Select Activity</h4>
          
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Activity / Excursion</label>
            <select
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F0A608]/20 focus:border-[#F0A608]"
            >
              {activeActivities.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.destination})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 2: Param configuration based on model */}
        {calculatedRate && !error && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>2. Quantity & Units</span>
              <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 font-mono">{pricingModel}</span>
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              {(pricingModel === 'PER_PERSON' || pricingModel === 'PER_ADULT_CHILD' || pricingModel === 'TIERED_GROUP_SIZE') && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Adults</label>
                    <input
                      type="number"
                      min="1"
                      value={adults}
                      onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Children</label>
                    <input
                      type="number"
                      min="0"
                      value={children}
                      onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </>
              )}

              {(pricingModel === 'PER_VEHICLE' || pricingModel === 'PER_VEHICLE_TYPE') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Vehicles</label>
                  <input
                    type="number"
                    min="1"
                    value={vehicles}
                    onChange={(e) => setVehicles(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {pricingModel === 'PER_TICKET' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Tickets</label>
                  <input
                    type="number"
                    min="1"
                    value={tickets}
                    onChange={(e) => setTickets(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}

              {(pricingModel === 'PER_HOUR' || pricingModel === 'PER_PERSON_PER_HOUR') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Hours</label>
                  <input
                    type="number"
                    min="1"
                    value={hours}
                    onChange={(e) => setHours(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Calculation Result */}
        <div className="pt-4 border-t border-slate-100">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">3. Availability & Cost</h4>
          
          {isCalculating ? (
            <div className="p-6 text-center text-slate-500 animate-pulse bg-slate-50 rounded-xl border border-slate-100">
              Calculating exact supplier rates...
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-sm font-bold text-rose-800">Rate Unavailable</h5>
                <p className="text-xs text-rose-600 mt-1">{error}</p>
                <p className="text-xs font-bold text-rose-700 mt-2">To proceed, choose a different activity or contact procurement.</p>
              </div>
            </div>
          ) : calculatedRate ? (
            <div className={`p-4 rounded-xl border ${calculatedRate.needsConfirmation ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h5 className={`text-sm font-bold ${calculatedRate.needsConfirmation ? 'text-amber-800' : 'text-emerald-800'} flex items-center gap-2`}>
                    {calculatedRate.needsConfirmation ? <ShieldAlert className="w-4 h-4" /> : null}
                    {calculatedRate.needsConfirmation ? 'Confirmation Required' : 'Available instantly'}
                  </h5>
                  <p className={`text-xs ${calculatedRate.needsConfirmation ? 'text-amber-700' : 'text-emerald-700'} mt-1`}>
                    Selling Price: <span className="font-bold text-base">₹{calculatedRate.sellingPrice.toLocaleString('en-IN')}</span> 
                    <span className="text-[10px] ml-1 uppercase">{calculatedRate.taxDescription}</span>
                  </p>
                </div>
              </div>
              
              {/* Only show Cost Breakdown to authorized roles */}
              {calculatedRate.supplierCost !== undefined && (
                <div className="mt-4 pt-3 border-t border-emerald-200/50">
                  <div className="flex justify-between text-xs font-bold text-emerald-900 pt-1 mt-1">
                    <span>Total Supplier Cost</span>
                    <span>₹{calculatedRate.supplierCost.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-100 text-sm">
              Waiting for input...
            </div>
          )}
        </div>
      </div>

      <div className="p-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
        <button 
          onClick={onCancel}
          className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!calculatedRate || !!error || isCalculating}
          className="px-6 py-2 text-sm font-bold text-white bg-[#F0A608] hover:bg-[#d69306] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Add to Trip
        </button>
      </div>
    </div>
  );
};

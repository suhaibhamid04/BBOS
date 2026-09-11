import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Car, AlertTriangle, ShieldAlert } from 'lucide-react';
import { TransportServiceType } from '../../types/transport';

interface TransportInventoryPickerProps {
  startDate: string;
  onConfirm: (metadata: any) => void;
  onCancel: () => void;
}

export const TransportInventoryPicker: React.FC<TransportInventoryPickerProps> = ({ 
  startDate, 
  onConfirm,
  onCancel
}) => {
  const { vehicleCategories, transportRoutes, destinations } = useData();
  const { currentUser } = useAuth();
  
  const [serviceType, setServiceType] = useState<TransportServiceType>('MULTI_DAY_JOURNEY');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  
  // Specific params based on service type
  const [vehicleDays, setVehicleDays] = useState(1);
  const [nightHalts, setNightHalts] = useState(0);
  const [occurrences, setOccurrences] = useState(1);
  const [distanceKm, setDistanceKm] = useState(0);
  const [hours, setHours] = useState(0);

  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');

  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const activeVehicles = vehicleCategories.filter(v => v.active);

  useEffect(() => {
    if (activeVehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(activeVehicles[0].id);
    }
  }, [activeVehicles]);

  useEffect(() => {
    if (selectedVehicleId && serviceType) {
      calculateRate();
    }
  }, [selectedVehicleId, serviceType, startDate, vehicleDays, nightHalts, occurrences, distanceKm, hours]);

  const calculateRate = async () => {
    if (!selectedVehicleId || !serviceType || !startDate) return;
    
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    
    try {
      const res = await fetch('/api/transport/calculate-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-User-Id': currentUser.id
        },
        body: JSON.stringify({
          vehicleCategoryId: selectedVehicleId,
          startDate,
          serviceType,
          vehicleDays,
          nightHalts,
          occurrences,
          distanceKm,
          hours
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch rate');
      if (!data.success) throw new Error(data.error || 'Failed to calculate rate');
      if (data.data.available === false) throw new Error(data.data.error || 'Rate unavailable');
      
      setCalculatedRate(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleConfirm = () => {
    if (!calculatedRate) return;

    const vehicle = vehicleCategories.find(v => v.id === selectedVehicleId);
    let routeName = '';
    
    if (serviceType === 'POINT_TO_POINT_TRANSFER' || serviceType === 'SIGHTSEEING_DAY_TRIP') {
       if (selectedRouteId) {
         const r = transportRoutes.find(rt => rt.id === selectedRouteId);
         routeName = r ? r.name : '';
       } else {
         routeName = `${pickupLocation} to ${dropoffLocation}`;
       }
    } else {
      routeName = `${vehicleDays} Days Journey`;
    }

    onConfirm({
      vehicleCategoryId: selectedVehicleId,
      vehicleName: vehicle?.displayName || 'Vehicle',
      serviceType,
      routeName,
      startDate,
      vehicleDays,
      nightHalts,
      needsConfirmation: calculatedRate.needsConfirmation,
      taxDescription: calculatedRate.taxDescription
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden flex flex-col max-h-[90vh]">
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Car className="w-5 h-5 text-[#7056EE]" /> Add Transport
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Step 1: Basic Info */}
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">1. Service Details</h4>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service Type</label>
              <select
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as TransportServiceType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
              >
                <option value="MULTI_DAY_JOURNEY">Multi-Day Journey</option>
                <option value="POINT_TO_POINT_TRANSFER">Point-to-Point Transfer</option>
                <option value="SIGHTSEEING_DAY_TRIP">Sightseeing Day Trip</option>
                <option value="HOURLY_DISPOSAL">Hourly Disposal</option>
                <option value="KM_BASED">KM Based</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Category</label>
              <select
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
              >
                {activeVehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.displayName} ({v.passengerCapacity} Pax)</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Specific Params based on Service Type */}
        <div className="space-y-4 pt-4 border-t border-slate-100">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">2. Configuration</h4>
          
          {serviceType === 'MULTI_DAY_JOURNEY' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Chargeable Vehicle Days</label>
                <input
                  type="number"
                  min="1"
                  value={vehicleDays}
                  onChange={(e) => setVehicleDays(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Night Halts</label>
                <input
                  type="number"
                  min="0"
                  value={nightHalts}
                  onChange={(e) => setNightHalts(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {(serviceType === 'POINT_TO_POINT_TRANSFER' || serviceType === 'SIGHTSEEING_DAY_TRIP') && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Route</label>
                <select
                  value={selectedRouteId}
                  onChange={(e) => setSelectedRouteId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg mb-2"
                >
                  <option value="">Custom Route...</option>
                  {transportRoutes.map(tr => (
                    <option key={tr.id} value={tr.id}>{tr.name}</option>
                  ))}
                </select>
              </div>
              
              {!selectedRouteId && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Pickup Location</label>
                    <input
                      type="text"
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="e.g. Airport"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Drop-off Location</label>
                    <input
                      type="text"
                      value={dropoffLocation}
                      onChange={(e) => setDropoffLocation(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      placeholder="e.g. Hotel"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {serviceType === 'HOURLY_DISPOSAL' && (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Chargeable Hours</label>
                <input
                  type="number"
                  min="1"
                  value={hours}
                  onChange={(e) => setHours(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}

          {serviceType === 'KM_BASED' && (
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estimated Distance (KM)</label>
                <input
                  type="number"
                  min="1"
                  value={distanceKm}
                  onChange={(e) => setDistanceKm(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          )}
        </div>

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
                <p className="text-xs font-bold text-rose-700 mt-2">To proceed, choose a different vehicle, service type, or contact procurement to add rates for this date.</p>
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
              
              {/* Only show Cost Breakdown to authorized roles. This comes sanitized from backend */}
              {calculatedRate.supplierCost !== undefined && (
                <div className="mt-4 pt-3 border-t border-emerald-200/50">
                  <div className="flex justify-between text-xs font-medium text-emerald-800 mb-1">
                    <span>Base Supplier Cost</span>
                    <span>₹{calculatedRate.baseSupplierCost.toLocaleString('en-IN')}</span>
                  </div>
                  {calculatedRate.supplementCost > 0 && (
                    <div className="flex justify-between text-xs font-medium text-emerald-800 mb-1">
                      <span>Supplements (Toll/Tax/Halt)</span>
                      <span>₹{calculatedRate.supplementCost.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-bold text-emerald-900 pt-1 mt-1 border-t border-emerald-200/50">
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
          className="px-6 py-2 text-sm font-bold text-white bg-[#7056EE] hover:bg-[#5b43d6] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Add to Trip
        </button>
      </div>
    </div>
  );
};

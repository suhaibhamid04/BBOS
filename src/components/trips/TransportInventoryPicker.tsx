import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Car, AlertTriangle, ShieldAlert } from 'lucide-react';
import { TransportServiceType, type TransportServiceDay } from '../../types/transport';
import { TransportItineraryMetadata } from '../../types';
import type { PackageSupplierRateInput, TaxTreatment } from '../../types/accommodation';
import { authenticatedMutationHeaders } from '../../services/auth/authenticatedApi';

interface TransportInventoryPickerProps {
  tripId: string;
  startDate: string;
  initialMetadata?: TransportItineraryMetadata;
  onConfirm: (metadata: TransportItineraryMetadata) => void;
  onCancel: () => void;
}

const DAY_SERVICE_OPTIONS: Array<{ value: TransportServiceType; label: string }> = [
  { value: 'AIRPORT_PICKUP', label: 'Airport Pickup' },
  { value: 'AIRPORT_DROP', label: 'Airport Drop' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'DAY_EXCURSION', label: 'Day Excursion' },
  { value: 'LOCAL_SIGHTSEEING', label: 'Local Sightseeing' },
  { value: 'INTERCITY_TRANSFER', label: 'Intercity Transfer' },
  { value: 'OTHER', label: 'Other' },
];

function dateAtOffset(startDate: string, offset: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function newServiceDay(startDate: string, index: number): TransportServiceDay {
  return {
    dayNumber: index + 1,
    date: dateAtOffset(startDate, index),
    serviceType: index === 0 ? 'AIRPORT_PICKUP' : 'DAY_EXCURSION',
    title: index === 0 ? 'Airport Pickup' : `Transport Day ${index + 1}`,
    chargeableTransportDay: true,
  };
}

export const TransportInventoryPicker: React.FC<TransportInventoryPickerProps> = ({ 
  tripId,
  startDate, 
  initialMetadata,
  onConfirm,
  onCancel
}) => {
  const { vehicleCategories, transportRoutes, destinations, dataLoadErrors, isLoading } = useData();
  const { currentUser } = useAuth();
  
  const [serviceType, setServiceType] = useState<TransportServiceType>((initialMetadata?.serviceType as TransportServiceType) || 'MULTI_DAY_JOURNEY');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialMetadata?.vehicleCategoryId || '');
  
  // Specific params based on service type
  const [serviceDays, setServiceDays] = useState<TransportServiceDay[]>(() =>
    initialMetadata?.serviceDays?.length
      ? initialMetadata.serviceDays.map(day => ({ ...day, places: day.places ? [...day.places] : undefined }))
      : Array.from({ length: initialMetadata?.chargeableDays || initialMetadata?.vehicleDays || 1 }, (_, index) => newServiceDay(startDate, index))
  );
  const [vehicleCount, setVehicleCount] = useState(initialMetadata?.vehicleCount || 1);
  const [nightHalts, setNightHalts] = useState(initialMetadata?.nightHalts || 0);
  const [occurrences, setOccurrences] = useState(initialMetadata?.occurrences || 1);
  const [distanceKm, setDistanceKm] = useState(initialMetadata?.distanceKm || 0);
  const [hours, setHours] = useState(initialMetadata?.hours || 0);

  const [pickupLocation, setPickupLocation] = useState(initialMetadata?.serviceDays?.[0]?.from || '');
  const [dropoffLocation, setDropoffLocation] = useState(initialMetadata?.serviceDays?.[0]?.to || '');
  const [selectedRouteId, setSelectedRouteId] = useState(initialMetadata?.routeId || '');

  const [isCalculating, setIsCalculating] = useState(false);
  const calculationRequestId = useRef(0);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const initialPackageRate = initialMetadata?.packageSupplierRate;
  const [rateMode, setRateMode] = useState<'CONTRACTED' | 'PER_VEHICLE_DAY' | 'TOTAL_SERVICE'>(initialPackageRate?.entryMode === 'PER_VEHICLE_DAY' || initialPackageRate?.entryMode === 'TOTAL_SERVICE' ? initialPackageRate.entryMode : 'CONTRACTED');
  const [packageRateAmount, setPackageRateAmount] = useState(initialPackageRate ? String(initialPackageRate.amount) : '');
  const [packageTaxTreatment, setPackageTaxTreatment] = useState<TaxTreatment>(initialPackageRate?.taxTreatment || 'NET');
  const [supplierReference, setSupplierReference] = useState(initialPackageRate?.supplierQuoteReference || '');
  const packageRate: PackageSupplierRateInput | undefined = rateMode === 'CONTRACTED' || !Number.isFinite(Number(packageRateAmount)) || Number(packageRateAmount) <= 0 ? undefined : {
    entryMode: rateMode, amount: Number(packageRateAmount), taxTreatment: packageTaxTreatment,
    ...(supplierReference.trim() ? { supplierQuoteReference: supplierReference.trim() } : {}),
  };
  const chargeableDays = useMemo(
    () => new Set(serviceDays.filter(day => day.chargeableTransportDay).map(day => day.date)).size,
    [serviceDays],
  );
  const vehicleDays = serviceDays.length;

  const resizeServiceDays = (count: number) => {
    const nextCount = Math.max(1, Math.min(120, count || 1));
    setServiceDays(current => Array.from({ length: nextCount }, (_, index) => current[index] || newServiceDay(startDate, index)));
  };

  const updateServiceDay = (index: number, patch: Partial<TransportServiceDay>) => {
    setServiceDays(current => current.map((day, dayIndex) => dayIndex === index ? { ...day, ...patch } : day));
  };

  const addServiceAction = () => {
    setServiceDays(current => {
      const last = current[current.length - 1];
      return [...current, {
        ...newServiceDay(startDate, current.length),
        dayNumber: last?.dayNumber || current.length + 1,
        date: last?.date || dateAtOffset(startDate, current.length),
        chargeableTransportDay: false,
      }];
    });
  };

  const activeVehicles = useMemo(
    () => vehicleCategories.filter(v => v.active),
    [vehicleCategories]
  );

  useEffect(() => {
    if (activeVehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(activeVehicles[0].id);
    }
  }, [activeVehicles, selectedVehicleId]);

  const calculateRate = useCallback(async () => {
    if (!selectedVehicleId || !serviceType || !startDate) return;
    const requestId = ++calculationRequestId.current;
    
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    
    try {
      const res = await fetch('/api/transport/calculate-rate', {
        method: 'POST',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify({
          tripId,
          vehicleCategoryId: selectedVehicleId,
          startDate,
          serviceType,
          vehicleDays,
          vehicleCount,
          chargeableDays,
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
      
      if (requestId !== calculationRequestId.current) return;
      setCalculatedRate(data.data);
    } catch (err: any) {
      if (requestId !== calculationRequestId.current) return;
      if (packageRate) {
        const supplierCost = rateMode === 'TOTAL_SERVICE' ? packageRate.amount : packageRate.amount * vehicleCount * Math.max(1, chargeableDays);
        setCalculatedRate({ available: true, needsConfirmation: true, pricingUnit: 'PER_DAY', taxDescription: packageTaxTreatment, supplierCost, baseSupplierCost: supplierCost, supplementCost: 0 });
      }
      else setError(err.message);
    } finally {
      if (requestId === calculationRequestId.current) setIsCalculating(false);
    }
  }, [tripId, selectedVehicleId, serviceType, startDate, vehicleDays, vehicleCount, chargeableDays, nightHalts, occurrences, distanceKm, hours, currentUser.employeeId, rateMode, packageRateAmount, packageTaxTreatment, supplierReference]);

  useEffect(() => {
    if (selectedVehicleId && serviceType) {
      calculateRate();
    }
  }, [calculateRate]);

  const handleConfirm = () => {
    if (!calculatedRate?.available || (!calculatedRate.rateId && !packageRate)) return;

    const vehicle = vehicleCategories.find(v => v.id === selectedVehicleId);
    let routeName = '';
    
    if (serviceType !== 'MULTI_DAY_JOURNEY') {
       if (selectedRouteId) {
         const r = transportRoutes.find(rt => rt.id === selectedRouteId);
         routeName = r ? r.name : '';
       } else {
         routeName = `${pickupLocation} to ${dropoffLocation}`;
       }
    } else {
      routeName = serviceDays.find(day => day.route)?.route || `${chargeableDays} Chargeable Day${chargeableDays === 1 ? '' : 's'}`;
    }
    onConfirm({
      inventoryType: 'TRANSPORT',
      vehicleCategoryId: selectedVehicleId,
      vehicleName: vehicle?.displayName || 'Vehicle',
      ...(calculatedRate.rateId ? { rateId: calculatedRate.rateId } : {}),
      ...(calculatedRate.supplierId ? { supplierId: calculatedRate.supplierId } : {}),
      supplierName: calculatedRate.supplierName,
      serviceType,
      pricingUnit: calculatedRate.pricingUnit,
      ...(selectedRouteId ? { routeId: selectedRouteId } : {}),
      routeName,
      startDate,
      vehicleDays: chargeableDays,
      vehicleCount,
      chargeableDays,
      packagePricingBasis: 'PER_VEHICLE_PER_DAY',
      serviceDays,
      nightHalts,
      occurrences,
      distanceKm,
      hours,
      needsConfirmation: calculatedRate.needsConfirmation,
      taxDescription: calculatedRate.taxDescription,
      ...(packageRate ? { packageRateRequest: packageRate } : {}),
    });
  };

  if (isLoading && vehicleCategories.length === 0) {
    return <div data-testid="transport-inventory-picker" className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">Loading transport inventory…</div>;
  }

  if (dataLoadErrors.transport) {
    return (
      <div data-testid="transport-inventory-picker" className="bg-white border border-rose-200 rounded-xl p-6">
        <p className="text-sm font-bold text-rose-800">Transport inventory could not be loaded</p>
        <p className="text-xs text-rose-700 mt-1">{dataLoadErrors.transport}</p>
        <button onClick={onCancel} className="mt-4 text-xs font-bold text-slate-600">Cancel</button>
      </div>
    );
  }

  if (activeVehicles.length === 0) {
    return (
      <div data-testid="transport-inventory-picker" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Car className="w-5 h-5 text-[#7056EE]" /> Add Transport
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">No transport inventory configured</p>
              <p className="text-xs text-amber-700 mt-1">Add active vehicle categories in the Inventory section before adding transport to a trip.</p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="transport-inventory-picker" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden flex flex-col max-h-[90vh]">
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
                data-testid="trip-transport-service-type"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value as TransportServiceType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]/20 focus:border-[#7056EE]"
              >
                <option value="MULTI_DAY_JOURNEY">Multi-Day Journey</option>
                <option value="AIRPORT_TRANSFER">Airport Transfer</option>
                <option value="LOCAL_SIGHTSEEING">Local Sightseeing</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Category</label>
              <select
                data-testid="trip-transport-vehicle"
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
                  data-testid="trip-transport-chargeable-days"
                  type="number"
                  min="1"
                  value={vehicleDays}
                  onChange={(e) => resizeServiceDays(parseInt(e.target.value) || 1)}
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

          {serviceType !== 'MULTI_DAY_JOURNEY' && (
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

        </div>

        {serviceType === 'MULTI_DAY_JOURNEY' && (
          <section className="space-y-3 border-t border-slate-100 pt-4" data-testid="transport-day-services">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-800">Day Services</h4>
                <p className="mt-1 text-xs text-slate-500">Describe the itinerary separately from supplier charging. Repeated actions on the same date count once.</p>
              </div>
              <button type="button" data-testid="add-transport-service-action" onClick={addServiceAction} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700">Add service action</button>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700" data-testid="transport-chargeable-day-summary">
              {chargeableDays} distinct chargeable day{chargeableDays === 1 ? '' : 's'}
            </div>
            {serviceDays.map((day, index) => (
              <div key={`${index}-${day.date}`} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" data-testid={`transport-service-day-${index}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">Day service {index + 1}</span>
                  {serviceDays.length > 1 && <button type="button" onClick={() => setServiceDays(current => current.filter((_, dayIndex) => dayIndex !== index))} className="text-xs font-bold text-rose-600">Remove</button>}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-slate-700">Trip day<input data-testid={`transport-service-day-number-${index}`} type="number" min="1" value={day.dayNumber} onChange={event => updateServiceDay(index, { dayNumber: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700">Date<input data-testid={`transport-service-date-${index}`} type="date" value={day.date} onChange={event => updateServiceDay(index, { date: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700">Service<select data-testid={`transport-service-type-${index}`} value={day.serviceType} onChange={event => updateServiceDay(index, { serviceType: event.target.value as TransportServiceType })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{DAY_SERVICE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Customer-facing title<input data-testid={`transport-service-title-${index}`} value={day.title || ''} onChange={event => updateServiceDay(index, { title: event.target.value || undefined })} placeholder="Gulmarg Day Excursion" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="flex items-end gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"><input data-testid={`transport-service-chargeable-${index}`} type="checkbox" checked={day.chargeableTransportDay} onChange={event => updateServiceDay(index, { chargeableTransportDay: event.target.checked })} />Chargeable cab day</label>
                  <label className="text-xs font-semibold text-slate-700">From<input value={day.from || ''} onChange={event => updateServiceDay(index, { from: event.target.value || undefined })} placeholder="Srinagar" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700">To<input value={day.to || ''} onChange={event => updateServiceDay(index, { to: event.target.value || undefined })} placeholder="Gulmarg" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700">Overnight<input value={day.overnightLocation || ''} onChange={event => updateServiceDay(index, { overnightLocation: event.target.value || undefined })} placeholder="Srinagar" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Route<input data-testid={`transport-service-route-${index}`} value={day.route || ''} onChange={event => updateServiceDay(index, { route: event.target.value || undefined })} placeholder="Srinagar → Gulmarg → Srinagar" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700">Places covered<input value={(day.places || []).join(', ')} onChange={event => updateServiceDay(index, { places: event.target.value.split(',').map(value => value.trim()).filter(Boolean) })} placeholder="Gulmarg" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                  <label className="text-xs font-semibold text-slate-700 sm:col-span-3">Notes<textarea value={day.notes || ''} onChange={event => updateServiceDay(index, { notes: event.target.value || undefined })} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4" data-testid="transport-package-rate">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-700">Number of vehicles<input data-testid="trip-transport-vehicle-count" type="number" min="1" value={vehicleCount} onChange={event => setVehicleCount(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
            <div className="text-xs text-slate-600"><span className="block font-semibold text-slate-700">Package pricing basis</span><span className="mt-1 block rounded-lg border border-violet-100 bg-white px-3 py-2">Per vehicle per chargeable day</span></div>
          </div>
          <p className="text-[11px] text-slate-600">The master transport rate is never changed. Multiple services described on one date count as one chargeable transport day.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setRateMode('CONTRACTED')} className={`rounded-lg border bg-white px-3 py-2 text-xs font-bold ${rateMode === 'CONTRACTED' ? 'border-violet-600 text-violet-700' : 'border-slate-200 text-slate-600'}`}>Use contracted rate</button>
            <button data-testid="transport-package-per-day" type="button" onClick={() => setRateMode('PER_VEHICLE_DAY')} className={`rounded-lg border bg-white px-3 py-2 text-xs font-bold ${rateMode === 'PER_VEHICLE_DAY' ? 'border-violet-600 text-violet-700' : 'border-slate-200 text-slate-600'}`}>Package rate / vehicle / day</button>
            <button data-testid="transport-package-total" type="button" onClick={() => setRateMode('TOTAL_SERVICE')} className={`rounded-lg border bg-white px-3 py-2 text-xs font-bold ${rateMode === 'TOTAL_SERVICE' ? 'border-violet-600 text-violet-700' : 'border-slate-200 text-slate-600'}`}>Total transport quote</button>
          </div>
          {rateMode !== 'CONTRACTED' && <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-700">Supplier amount<input data-testid="transport-package-rate-amount" type="number" min="1" value={packageRateAmount} onChange={event => setPackageRateAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label><label className="text-xs font-semibold text-slate-700">Tax treatment<select value={packageTaxTreatment} onChange={event => setPackageTaxTreatment(event.target.value as TaxTreatment)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="NET">Net / taxes extra</option><option value="INCLUSIVE">Taxes included</option><option value="GST_5">Add 5% GST</option><option value="GST_18">Add 18% GST</option></select></label><label className="col-span-2 text-xs font-semibold text-slate-700">Supplier reference (optional)<input value={supplierReference} onChange={event => setSupplierReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label></div>}
        </section>

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
                <p className="text-xs font-bold text-rose-700 mt-2">No contracted transport rate is available. Enter a package supplier rate above, or choose another vehicle.</p>
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
                    <span className="font-bold text-base">{calculatedRate.supplierCost === undefined ? 'Authoritative rate found' : `₹${calculatedRate.supplierCost.toLocaleString('en-IN')}`}</span>
                    <span className="text-[10px] ml-1 uppercase">{calculatedRate.taxDescription}</span>
                    {calculatedRate.supplierName ? <span className="block mt-1">{calculatedRate.supplierName} · {calculatedRate.pricingUnit}</span> : null}
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
          data-testid="confirm-trip-transport"
          onClick={handleConfirm}
          disabled={!calculatedRate || !!error || isCalculating || chargeableDays < 1}
          className="px-6 py-2 text-sm font-bold text-white bg-[#7056EE] hover:bg-[#5b43d6] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          Add to Trip
        </button>
      </div>
    </div>
  );
};

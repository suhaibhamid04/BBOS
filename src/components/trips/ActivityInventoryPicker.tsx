import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Compass, AlertTriangle, ShieldAlert } from 'lucide-react';
import { ActivityPricingModel, type ActivityInclusionStatus } from '../../types/activity';
import { ActivityItineraryMetadata } from '../../types';
import type { PackageRateEntryMode, PackageSupplierRateInput, TaxTreatment } from '../../types/accommodation';
import { authenticatedMutationHeaders } from '../../services/auth/authenticatedApi';

interface ActivityInventoryPickerProps {
  tripId: string;
  date: string;
  defaultAdults: number;
  defaultChildren: number;
  initialMetadata?: ActivityItineraryMetadata;
  onConfirm: (metadata: ActivityItineraryMetadata) => void;
  onCancel: () => void;
}

export const ActivityInventoryPicker: React.FC<ActivityInventoryPickerProps> = ({ 
  tripId,
  date,
  defaultAdults,
  defaultChildren,
  initialMetadata,
  onConfirm,
  onCancel
}) => {
  const { activityMasters, dataLoadErrors, isLoading } = useData();
  const { currentUser } = useAuth();
  
  const [selectedActivityId, setSelectedActivityId] = useState<string>(initialMetadata?.activityId || '');
  const [pricingModel, setPricingModel] = useState<ActivityPricingModel>((initialMetadata?.pricingModel as ActivityPricingModel) || 'PER_PERSON');
  
  // Specific params based on pricing model
  const [adults, setAdults] = useState(initialMetadata?.adults ?? defaultAdults ?? 2);
  const [children, setChildren] = useState(initialMetadata?.children ?? defaultChildren ?? 0);
  const [infants, setInfants] = useState(initialMetadata?.infants || 0);
  const [vehicles, setVehicles] = useState(initialMetadata?.vehicles || 1);
  const [groups, setGroups] = useState(initialMetadata?.groups || 1);
  const [tickets, setTickets] = useState(initialMetadata?.tickets || 1);
  const [hours, setHours] = useState(initialMetadata?.hours || 1);
  const [days, setDays] = useState(initialMetadata?.days || 1);
  const [sessions, setSessions] = useState(initialMetadata?.sessions || 1);
  const [units, setUnits] = useState(initialMetadata?.units || 1);
  const [inclusionStatus, setInclusionStatus] = useState<ActivityInclusionStatus>(initialMetadata?.inclusionStatus || 'INCLUDED');

  const [isCalculating, setIsCalculating] = useState(false);
  const calculationRequestId = useRef(0);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const initialPackageRate = initialMetadata?.packageSupplierRate;
  const initialActivityRateMode = initialPackageRate && ['PER_PERSON', 'PER_CHILD', 'PER_GROUP', 'PER_UNIT', 'FLAT_TOTAL'].includes(initialPackageRate.entryMode) ? initialPackageRate.entryMode : 'CONTRACTED';
  const [rateMode, setRateMode] = useState<'CONTRACTED' | PackageRateEntryMode>(initialActivityRateMode);
  const [packageRateAmount, setPackageRateAmount] = useState(initialPackageRate ? String(initialPackageRate.amount) : '');
  const [packageChildAmount, setPackageChildAmount] = useState(initialPackageRate?.childAmount === undefined ? '' : String(initialPackageRate.childAmount));
  const [packageTaxTreatment, setPackageTaxTreatment] = useState<TaxTreatment>(initialPackageRate?.taxTreatment || 'NET');
  const [supplierReference, setSupplierReference] = useState(initialPackageRate?.supplierQuoteReference || '');
  const packageRate: PackageSupplierRateInput | undefined = rateMode === 'CONTRACTED' || !Number.isFinite(Number(packageRateAmount)) || Number(packageRateAmount) <= 0 ? undefined : {
    entryMode: rateMode, amount: Number(packageRateAmount), taxTreatment: packageTaxTreatment,
    ...(rateMode === 'PER_PERSON' && packageChildAmount !== '' ? { childAmount: Number(packageChildAmount) } : {}),
    ...(supplierReference.trim() ? { supplierQuoteReference: supplierReference.trim() } : {}),
  };

  const activeActivities = useMemo(
    () => activityMasters.filter(a => a.active),
    [activityMasters]
  );

  useEffect(() => {
    if (activeActivities.length > 0 && !selectedActivityId) {
      setSelectedActivityId(activeActivities[0].id);
    }
  }, [activeActivities, selectedActivityId]);

  const calculateRate = useCallback(async () => {
    if (!selectedActivityId || !date) return;
    const requestId = ++calculationRequestId.current;
    
    setIsCalculating(true);
    setError(null);
    setCalculatedRate(null);
    
    try {
      const res = await fetch('/api/activities/calculate-rate', {
        method: 'POST',
        headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify({
          tripId,
          activityId: selectedActivityId,
          date,
          adults,
          children,
          infants,
          vehicles,
          groups,
          tickets,
          hours,
          days,
          sessions,
          units
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to fetch rate');
      if (!data.success) throw new Error(data.error || 'Failed to calculate rate');
      if (data.data.available === false) throw new Error(data.data.error || 'Rate unavailable');
      
      if (requestId !== calculationRequestId.current) return;
      const effectivePricingModel = rateMode === 'CONTRACTED' ? data.data.pricingModel : rateMode;
      setCalculatedRate({ ...data.data, pricingModel: effectivePricingModel });
      if (effectivePricingModel) {
        setPricingModel(effectivePricingModel);
      }
    } catch (err: any) {
      if (requestId !== calculationRequestId.current) return;
      if (packageRate) setCalculatedRate({ available: true, needsConfirmation: true, pricingModel: rateMode, taxDescription: packageTaxTreatment, supplierCost: packageRate.amount });
      else setError(err.message);
    } finally {
      if (requestId === calculationRequestId.current) setIsCalculating(false);
    }
  }, [tripId, selectedActivityId, date, adults, children, infants, vehicles, groups, tickets, hours, days, sessions, units, currentUser.employeeId, rateMode, packageRateAmount, packageChildAmount, packageTaxTreatment, supplierReference]);

  useEffect(() => {
    if (selectedActivityId) {
      calculateRate();
    }
  }, [calculateRate]);

  const handleConfirm = () => {
    if (!calculatedRate?.available || (!calculatedRate.rateId && !packageRate)) return;

    const activity = activityMasters.find(a => a.id === selectedActivityId);

    onConfirm({
      inventoryType: 'ACTIVITY',
      activityId: selectedActivityId,
      activityName: activity?.name || 'Activity',
      ...(calculatedRate.rateId ? { rateId: calculatedRate.rateId } : {}),
      ...(calculatedRate.supplierId ? { supplierId: calculatedRate.supplierId } : {}),
      supplierName: calculatedRate.supplierName,
      pricingModel: calculatedRate.pricingModel,
      date,
      adults,
      children,
      infants,
      vehicles,
      groups,
      tickets,
      hours,
      days,
      sessions,
      units,
      inclusionStatus,
      duration: activity?.duration,
      needsConfirmation: calculatedRate.needsConfirmation,
      taxDescription: calculatedRate.taxDescription,
      ...(packageRate ? { packageRateRequest: packageRate } : {}),
    });
  };

  if (isLoading && activityMasters.length === 0) {
    return <div data-testid="activity-inventory-picker" className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">Loading activity inventory…</div>;
  }

  if (dataLoadErrors.activities) {
    return (
      <div data-testid="activity-inventory-picker" className="bg-white border border-rose-200 rounded-xl p-6">
        <p className="text-sm font-bold text-rose-800">Activity inventory could not be loaded</p>
        <p className="text-xs text-rose-700 mt-1">{dataLoadErrors.activities}</p>
        <button onClick={onCancel} className="mt-4 text-xs font-bold text-slate-600">Cancel</button>
      </div>
    );
  }

  if (activeActivities.length === 0) {
    return (
      <div data-testid="activity-inventory-picker" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-[#F0A608]" /> Add Activity
          </h3>
        </div>
        <div className="p-6">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-800">No activity inventory configured</p>
              <p className="text-xs text-amber-700 mt-1">Add active activity masters in the Inventory section before adding activities to a trip.</p>
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
    <div data-testid="activity-inventory-picker" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full overflow-hidden flex flex-col max-h-[90vh]">
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
              data-testid="trip-activity-master"
              value={selectedActivityId}
              onChange={(e) => setSelectedActivityId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#F0A608]/20 focus:border-[#F0A608]"
            >
              {activeActivities.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.destinationId})</option>
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
              {(pricingModel === 'PER_PERSON' || pricingModel === 'PER_ADULT_CHILD') && (
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

              {pricingModel === 'PER_CHILD' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Children</label>
                  <input data-testid="activity-child-count" type="number" min="1" value={children} onChange={(e) => setChildren(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              )}

              {pricingModel === 'PER_GROUP' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Number of Groups</label>
                  <input data-testid="activity-group-count" type="number" min="1" value={groups} onChange={(e) => setGroups(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                </div>
              )}

              {pricingModel === 'PER_VEHICLE' && (
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

              {pricingModel === 'PER_HOUR' && (
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

        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4" data-testid="activity-package-controls">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">Customer package treatment<select data-testid="activity-inclusion-status" value={inclusionStatus} onChange={event => setInclusionStatus(event.target.value as ActivityInclusionStatus)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="INCLUDED">Included in package</option><option value="OPTIONAL">Optional add-on</option><option value="NOT_INCLUDED">Not included</option></select></label>
            <label className="text-xs font-semibold text-slate-700">Unit quantity<input data-testid="activity-unit-count" type="number" min="1" value={units} onChange={event => setUnits(Math.max(1, Number(event.target.value) || 1))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
          </div>
          <p className="text-[11px] text-slate-600">Optional and not-included activities remain visible as choices but are excluded from authoritative package supplier cost.</p>
          <label className="block text-xs font-semibold text-slate-700">Supplier rate for this package<select data-testid="activity-package-rate-mode" value={rateMode} onChange={event => { const next = event.target.value as typeof rateMode; setRateMode(next); if (next !== 'CONTRACTED') setPricingModel(next as ActivityPricingModel); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="CONTRACTED">Use contracted rate</option><option value="PER_PERSON">Per person</option><option value="PER_CHILD">Per child</option><option value="PER_GROUP">Per group</option><option value="PER_UNIT">Per unit</option><option value="FLAT_TOTAL">Flat total</option></select></label>
          {rateMode !== 'CONTRACTED' && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">Supplier amount<input data-testid="activity-package-rate-amount" type="number" min="1" value={packageRateAmount} onChange={event => setPackageRateAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>{rateMode === 'PER_PERSON' && <label className="text-xs font-semibold text-slate-700">Child amount (optional)<input type="number" min="0" value={packageChildAmount} onChange={event => setPackageChildAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>}<label className="text-xs font-semibold text-slate-700">Tax treatment<select value={packageTaxTreatment} onChange={event => setPackageTaxTreatment(event.target.value as TaxTreatment)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="NET">Net / taxes extra</option><option value="INCLUSIVE">Taxes included</option><option value="GST_5">Add 5% GST</option><option value="GST_18">Add 18% GST</option></select></label><label className="text-xs font-semibold text-slate-700">Supplier reference<input value={supplierReference} onChange={event => setSupplierReference(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label></div>}
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
                <p className="text-xs font-bold text-rose-700 mt-2">No contracted activity rate is available. Enter a package supplier rate above, or choose another activity.</p>
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
                    {calculatedRate.supplierName ? <span className="block mt-1">{calculatedRate.supplierName}</span> : null}
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
          data-testid="confirm-trip-activity"
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

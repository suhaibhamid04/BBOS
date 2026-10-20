import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Minus, Plus } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type { AccommodationItineraryMetadata, MealPlanType, RoomAllocation } from '../../types';
import type { PackageRateEntryMode, PackageSupplierRateInput, TaxTreatment } from '../../types/accommodation';
import { deriveChildTreatments, distributeGuestsAcrossRooms, resolveRoomOccupancyRules, suggestRoomCount } from '../../services/accommodationEngine';
import { authenticatedMutationHeaders } from '../../services/auth/authenticatedApi';

interface HotelInventoryPickerProps {
  tripId: string;
  customerName?: string;
  destination: string;
  checkInDate: string;
  nights: number;
  adults: number;
  childrenCount: number;
  childAges: number[];
  initialMetadata?: AccommodationItineraryMetadata;
  onConfirm: (metadata: AccommodationItineraryMetadata) => void | Promise<void>;
  onCancel: () => void;
}

export const HotelInventoryPicker: React.FC<HotelInventoryPickerProps> = ({ tripId, customerName, destination, checkInDate, nights, adults, childrenCount, childAges, initialMetadata, onConfirm, onCancel }) => {
  const { accommodationProperties, roomCategories, dataLoadErrors, isLoading } = useData();
  const { currentUser } = useAuth();
  const [destinationFilter, setDestinationFilter] = useState(destination || '');
  const [selectedPropertyId, setSelectedPropertyId] = useState(initialMetadata?.propertyId || '');
  const [selectedRoomId, setSelectedRoomId] = useState(initialMetadata?.roomCategoryId || '');
  const [selectedMealPlan, setSelectedMealPlan] = useState<MealPlanType>(initialMetadata?.mealPlan || 'MAP');
  const [selectedRateId, setSelectedRateId] = useState(initialMetadata?.rateId || '');
  const [roomCount, setRoomCount] = useState(initialMetadata?.roomAllocations?.length || initialMetadata?.rooms || 1);
  const [roomAllocations, setRoomAllocations] = useState<RoomAllocation[]>(initialMetadata?.roomAllocations || []);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculatedRate, setCalculatedRate] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const initialPackageRate = initialMetadata?.packageSupplierRate;
  const [rateMode, setRateMode] = useState<'CONTRACTED' | PackageRateEntryMode>(initialPackageRate?.entryMode || 'CONTRACTED');
  const [packageRateAmount, setPackageRateAmount] = useState(initialPackageRate ? String(initialPackageRate.amount) : '');
  const [packageTaxTreatment, setPackageTaxTreatment] = useState<TaxTreatment>(initialPackageRate?.taxTreatment || 'NET');
  const [supplierReference, setSupplierReference] = useState(initialPackageRate?.supplierQuoteReference || '');
  const [overrideReason, setOverrideReason] = useState(initialPackageRate?.overrideReason || '');

  const missingChildAges = childrenCount > 0 && childAges.length !== childrenCount;
  const activeProperties = useMemo(() => accommodationProperties.filter(property => property.status === 'ACTIVE' && (!destinationFilter || property.location === destinationFilter || property.city === destinationFilter)), [accommodationProperties, destinationFilter]);
  const availableRooms = useMemo(() => roomCategories.filter(room => room.propertyId === selectedPropertyId && room.active), [roomCategories, selectedPropertyId]);
  const selectedRoom = availableRooms.find(room => room.id === selectedRoomId);
  const destinations = useMemo(() => Array.from(new Set(accommodationProperties.filter(property => property.status === 'ACTIVE').flatMap(property => [property.location, property.city]).filter(Boolean))), [accommodationProperties]);
  const packageRate: PackageSupplierRateInput | undefined = rateMode === 'CONTRACTED' || !Number.isFinite(Number(packageRateAmount)) || Number(packageRateAmount) <= 0 ? undefined : {
    entryMode: rateMode,
    amount: Number(packageRateAmount),
    taxTreatment: packageTaxTreatment,
    ...(supplierReference.trim() ? { supplierQuoteReference: supplierReference.trim() } : {}),
    ...(overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}),
  };
  const clearPackageRate = () => { setRateMode('CONTRACTED'); setPackageRateAmount(''); setPackageTaxTreatment('NET'); setSupplierReference(''); setOverrideReason(''); setSelectedRateId(''); };

  useEffect(() => { if (!selectedPropertyId && activeProperties.length > 0) setSelectedPropertyId(activeProperties[0].id); }, [activeProperties, selectedPropertyId]);
  useEffect(() => {
    if (availableRooms.length > 0 && !availableRooms.some(room => room.id === selectedRoomId)) setSelectedRoomId(availableRooms[0].id);
    else if (availableRooms.length === 0) setSelectedRoomId('');
  }, [availableRooms, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoom) return;
    const canPreserve = initialMetadata?.roomCategoryId === selectedRoom.id && initialMetadata.roomAllocations?.length;
    if (canPreserve) {
      setRoomCount(initialMetadata.roomAllocations!.length);
      setRoomAllocations(initialMetadata.roomAllocations!);
      return;
    }
    const suggested = suggestRoomCount(selectedRoom, adults, childAges);
    setRoomCount(suggested);
    try { setRoomAllocations(distributeGuestsAcrossRooms(selectedRoom.id, adults, childAges, suggested)); }
    catch { setRoomAllocations([]); }
  }, [selectedRoom?.id, adults, childAges.join(',')]);

  const resizeRooms = (nextCount: number) => {
    if (!selectedRoomId) return;
    const safeCount = Math.max(1, Math.floor(nextCount || 1));
    setRoomCount(safeCount);
    try { setRoomAllocations(distributeGuestsAcrossRooms(selectedRoomId, adults, childAges, safeCount)); setError(null); }
    catch (distributionError) { setRoomAllocations([]); setError(distributionError instanceof Error ? distributionError.message : 'The room count cannot be used for this party.'); }
  };

  const setRoomAdults = (roomIndex: number, value: number) => setRoomAllocations(previous => previous.map(room => room.roomIndex === roomIndex ? { ...room, adults: Math.max(0, Math.floor(value || 0)) } : room));
  const setRoomCategory = (roomIndex: number, roomCategoryId: string) => {
    clearPackageRate();
    setRoomAllocations(previous => previous.map(room => room.roomIndex === roomIndex ? { ...room, roomCategoryId, rateId: undefined } : room));
  };
  const assignedRoomForChild = (ageIndex: number) => {
    const age = childAges[ageIndex];
    const targetOccurrence = childAges.slice(0, ageIndex).filter(value => value === age).length;
    let occurrence = 0;
    for (const room of [...roomAllocations].sort((left, right) => left.roomIndex - right.roomIndex)) {
      for (const assignedAge of room.childAges) {
        if (assignedAge !== age) continue;
        if (occurrence === targetOccurrence) return room;
        occurrence += 1;
      }
    }
    return undefined;
  };
  const moveChild = (ageIndex: number, nextRoomIndex: number) => {
    const age = childAges[ageIndex];
    const targetOccurrence = childAges.slice(0, ageIndex).filter(value => value === age).length;
    setRoomAllocations(previous => {
      let occurrence = 0;
      const withoutAge = previous.map(room => {
        const ages = room.childAges.filter(assignedAge => {
          if (assignedAge !== age) return true;
          const keep = occurrence !== targetOccurrence;
          occurrence += 1;
          return keep;
        });
        return { ...room, childAges: ages, children: ages.length };
      });
      return withoutAge.map(room => room.roomIndex === nextRoomIndex ? { ...room, childAges: [...room.childAges, age], children: room.childAges.length + 1 } : room);
    });
  };

  const calculateRate = useCallback(async () => {
    if (!selectedPropertyId || !selectedRoomId || !checkInDate || nights < 1 || roomAllocations.length === 0 || missingChildAges) return;
    setIsCalculating(true); setError(null); setCalculatedRate(null);
    try {
      const response = await fetch('/api/accommodation/calculate-rate', {
        method: 'POST', headers: await authenticatedMutationHeaders(currentUser.employeeId),
        body: JSON.stringify({ tripId, propertyId: selectedPropertyId, roomCategoryId: selectedRoomId, checkInDate, nights, adults, children: childrenCount, childAges, roomAllocations, mealPlan: selectedMealPlan, ...(rateMode === 'CONTRACTED' && selectedRateId ? { rateId: selectedRateId } : {}), ...(packageRate ? { packageRate } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to calculate the accommodation rate.');
      setCalculatedRate(body.data);
      if (body.data?.rateId && body.data.rateId !== selectedRateId) setSelectedRateId(body.data.rateId);
    } catch (calculationError) { setError(calculationError instanceof Error ? calculationError.message : 'Unable to validate this stay.'); }
    finally { setIsCalculating(false); }
  }, [selectedPropertyId, selectedRoomId, selectedMealPlan, selectedRateId, checkInDate, nights, adults, childrenCount, childAges.join(','), roomAllocations, missingChildAges, tripId, currentUser.employeeId, rateMode, packageRateAmount, packageTaxTreatment, supplierReference, overrideReason]);

  useEffect(() => { void calculateRate(); }, [calculateRate]);

  const rateSegments = useMemo(() => {
    const rows = Array.isArray(calculatedRate?.nightlyRateBreakdown)
      ? calculatedRate.nightlyRateBreakdown.filter((row: any) => row.roomIndex === 1)
      : [];
    return rows.reduce((segments: Array<{ from: string; to: string; baseRate: number; rateId: string }>, row: any) => {
      const last = segments[segments.length - 1];
      if (last && last.rateId === row.rateId && last.baseRate === row.baseRate) last.to = row.date;
      else segments.push({ from: row.date, to: row.date, baseRate: row.baseRate, rateId: row.rateId });
      return segments;
    }, []);
  }, [calculatedRate]);
  const hasMixedCategories = new Set(roomAllocations.map(room => room.roomCategoryId)).size > 1;

  const handleSelect = async () => {
    if (!calculatedRate?.available || (!calculatedRate.rateId && !packageRate) || !selectedPropertyId || !selectedRoomId) return;
    const checkOut = new Date(`${checkInDate}T00:00:00Z`); checkOut.setUTCDate(checkOut.getUTCDate() + nights);
    const authoritativeAllocations = Array.isArray(calculatedRate.roomAllocations) ? calculatedRate.roomAllocations as RoomAllocation[] : roomAllocations;
    const primaryRoom = availableRooms.find(room => room.id === authoritativeAllocations[0]?.roomCategoryId) || selectedRoom;
    const treatments = Array.isArray(calculatedRate.childTreatments)
      ? calculatedRate.childTreatments
      : authoritativeAllocations.flatMap(allocation => deriveChildTreatments(allocation.childAges, availableRooms.find(room => room.id === allocation.roomCategoryId)));
    try {
      setError(null);
      await onConfirm({
        inventoryType: 'ACCOMMODATION', propertyId: selectedPropertyId, propertyName: calculatedRate.propertyName || 'Unknown Property',
        roomCategoryId: primaryRoom.id, roomCategoryName: primaryRoom.name, rateId: authoritativeAllocations[0]?.rateId || calculatedRate.rateId,
        supplierId: calculatedRate.supplierId, supplierName: calculatedRate.supplierName, mealPlan: selectedMealPlan,
        checkInDate, checkOutDate: checkOut.toISOString().slice(0, 10), nights, rooms: roomAllocations.length,
        adults, children: childrenCount,
        childrenWithBed: treatments.filter(item => item.category === 'CHILD_SUPPLEMENT').length,
        childrenWithoutBed: treatments.filter(item => item.category === 'COMPLIMENTARY_NO_BED').length,
        roomAllocations: authoritativeAllocations, childTreatments: treatments,
        needsConfirmation: Boolean(calculatedRate.needsConfirmation), taxDescription: calculatedRate.taxDescription || 'Taxes extra',
        ...(packageRate ? { packageRateRequest: packageRate } : {}),
      });
    } catch (selectionError) { setError(selectionError instanceof Error ? selectionError.message : 'The hotel change could not be saved.'); }
  };

  if (isLoading && accommodationProperties.length === 0) return <div data-testid="hotel-inventory-picker" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Loading accommodation inventory…</div>;
  if (dataLoadErrors.accommodation || activeProperties.length === 0) return <div data-testid="hotel-inventory-picker" className="mx-auto max-w-3xl rounded-xl border border-amber-200 bg-white p-6"><p className="text-sm font-bold text-amber-800">{dataLoadErrors.accommodation ? 'Accommodation inventory could not be loaded' : 'No accommodation inventory configured'}</p><p className="mt-1 text-xs text-amber-700">{dataLoadErrors.accommodation || 'Add active accommodation inventory before selecting a hotel.'}</p><button onClick={onCancel} className="mt-4 text-xs font-bold text-slate-600">Cancel</button></div>;

  return <div data-testid="hotel-inventory-picker" className="mx-auto max-h-[90vh] max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Building2 className="h-4 w-4 text-[#7056EE]" />Accommodation</h3><button onClick={onCancel} className="text-xs font-medium text-slate-500">Cancel</button></div>
    <section data-testid="hotel-trip-context" className="mb-4 grid gap-2 rounded-xl border border-purple-100 bg-purple-50 p-3 text-xs text-slate-700 sm:grid-cols-3">
      {customerName && <div><span className="block text-[10px] font-bold uppercase text-slate-500">Customer</span>{customerName}</div>}
      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Party</span>{adults} adults · {childrenCount} children{childAges.length ? ` (ages ${childAges.join(', ')})` : ''}</div>
      <div><span className="block text-[10px] font-bold uppercase text-slate-500">Stay</span>{destination} · {checkInDate} · {nights} night{nights === 1 ? '' : 's'}</div>
    </section>
    {missingChildAges && <div data-testid="missing-child-ages-warning" className="mb-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><div><p className="font-bold">Add every child age before costing this hotel.</p><p className="mt-1">Return to the Lead or Trip, correct the traveler details, then reopen Accommodation.</p></div></div>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-700">Destination<select value={destinationFilter} onChange={event => { setDestinationFilter(event.target.value); setSelectedPropertyId(''); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">All destinations</option>{destinations.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Property<select data-testid="trip-hotel-property" value={selectedPropertyId} onChange={event => { setSelectedPropertyId(event.target.value); setSelectedRoomId(''); clearPackageRate(); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="" disabled>Select property</option>{activeProperties.map(property => <option key={property.id} value={property.id}>{property.name} — {property.city}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-700">Default room category<select data-testid="trip-hotel-room" value={selectedRoomId} onChange={event => { setSelectedRoomId(event.target.value); clearPackageRate(); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{availableRooms.map(room => { const rules = resolveRoomOccupancyRules(room); return <option key={room.id} value={room.id}>{room.name} · standard {rules.baseAdults} adults</option>; })}</select></label>
      <label className="text-xs font-semibold text-slate-700">Meal plan<select data-testid="trip-hotel-meal-plan" value={selectedMealPlan} onChange={event => { setSelectedMealPlan(event.target.value as MealPlanType); clearPackageRate(); }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="EP">Room only</option><option value="CP">Breakfast</option><option value="MAP">Breakfast + dinner</option><option value="AP">All meals</option></select></label>
    </div>
    {selectedRoom && <section className="mt-5 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p data-testid="rooms-suggested" className="text-sm font-black text-slate-900">Rooms suggested: {suggestRoomCount(selectedRoom, adults, childAges)}</p><p className="text-[11px] text-slate-500">Adjust rooms or guests when this category supports a different arrangement.</p></div><div className="flex items-center gap-2"><button type="button" aria-label="Remove room" onClick={() => resizeRooms(roomCount - 1)} className="rounded border bg-white p-1"><Minus className="h-3.5 w-3.5" /></button><input data-testid="trip-hotel-rooms" aria-label="Room count" type="number" min="1" value={roomCount} onChange={event => resizeRooms(Number(event.target.value))} className="w-14 rounded border border-slate-300 bg-white px-2 py-1 text-center text-sm font-bold" /><button type="button" aria-label="Add room" onClick={() => resizeRooms(roomCount + 1)} className="rounded border bg-white p-1"><Plus className="h-3.5 w-3.5" /></button></div></div>
      <div className="grid gap-3 sm:grid-cols-2">{roomAllocations.map(room => { const roomCategory = availableRooms.find(category => category.id === room.roomCategoryId) || selectedRoom; const rules = resolveRoomOccupancyRules(roomCategory); return <div key={room.roomIndex} data-testid={`room-${room.roomIndex}-allocation`} className="rounded-xl border border-slate-200 bg-white p-3"><p className="mb-2 text-xs font-black text-slate-900">Room {room.roomIndex}</p><label className="text-[11px] font-semibold text-slate-600">Room category<select data-testid={`room-${room.roomIndex}-category`} value={room.roomCategoryId} onChange={event => setRoomCategory(room.roomIndex, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs">{availableRooms.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><p className="mt-2 text-[11px] text-slate-500">Standard occupancy: {rules.baseAdults} adult{rules.baseAdults === 1 ? '' : 's'}</p><p className="text-[11px] text-slate-500">{rules.maxExtraAdults ? `${rules.maxExtraAdults} extra bed${rules.maxExtraAdults === 1 ? '' : 's'} allowed` : 'No extra adult bed allowed'}</p><p className="text-[11px] text-slate-500">{rules.maxChildrenWithoutBed ? `${rules.maxChildrenWithoutBed} child${rules.maxChildrenWithoutBed === 1 ? '' : 'ren'} without bed allowed` : 'No child without bed allowed'}</p><label className="mt-2 block text-[11px] font-semibold text-slate-600">Adults<input data-testid={`room-${room.roomIndex}-adults`} type="number" min="0" value={room.adults} onChange={event => setRoomAdults(room.roomIndex, Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs" /></label><div className="mt-2 space-y-1">{room.childAges.map((age, index) => <p key={`${age}-${index}`} className="text-[11px] text-slate-600">{deriveChildTreatments([age], roomCategory)[0].label}</p>)}</div></div>; })}</div>
      {childAges.length > 0 && <div data-testid="child-room-assignment" className="space-y-2 border-t border-slate-200 pt-3"><p className="text-xs font-bold text-slate-700">Child room assignment</p>{childAges.map((age, index) => { const assigned = assignedRoomForChild(index); const treatment = deriveChildTreatments([age], selectedRoom)[0]; return <div key={`${age}-${index}`} className="flex items-center justify-between gap-3 text-[11px]"><span>{treatment.label}</span><select data-testid={`child-${index}-room`} value={assigned?.roomIndex || 1} onChange={event => moveChild(index, Number(event.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1">{roomAllocations.map(room => <option key={room.roomIndex} value={room.roomIndex}>Room {room.roomIndex}</option>)}</select></div>; })}</div>}
    </section>}
    {(calculatedRate?.rateOptions?.length || 0) > 0 && <label className="mt-4 block text-xs font-semibold text-slate-700">Contracted rate<select data-testid="trip-hotel-rate" value={selectedRateId} onChange={event => setSelectedRateId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">{calculatedRate.rateOptions.map((option: any) => <option key={option.id} value={option.id}>{option.label}{option.totalSupplierCost === undefined ? '' : ` · ₹${option.totalSupplierCost.toLocaleString('en-IN')}`}</option>)}</select></label>}
    <section data-testid="package-supplier-rate" className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="text-xs font-black text-slate-900">Supplier rate for this package</p>
      <p className="mt-1 text-[11px] text-slate-600">This rate applies only to this package. Your master hotel rate will not be changed.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={() => { setRateMode('CONTRACTED'); setPackageRateAmount(''); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${rateMode === 'CONTRACTED' ? 'border-violet-600 bg-white text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>Use contracted rate</button>
        <button data-testid="use-package-per-night" type="button" disabled={hasMixedCategories} onClick={() => setRateMode('PER_ROOM_NIGHT')} className={`rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${rateMode === 'PER_ROOM_NIGHT' ? 'border-violet-600 bg-white text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>Package ₹ / room / night</button>
        <button data-testid="use-package-total" type="button" onClick={() => setRateMode('TOTAL_STAY')} className={`rounded-lg border px-3 py-2 text-xs font-bold ${rateMode === 'TOTAL_STAY' ? 'border-violet-600 bg-white text-violet-700' : 'border-slate-200 bg-white text-slate-600'}`}>Total stay quote</button>
      </div>
      {hasMixedCategories && <p className="mt-2 text-[11px] text-slate-600">Different room categories use independent contracted rates. Use a total-stay quote for a package-specific price.</p>}
      {rateMode !== 'CONTRACTED' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-700">{rateMode === 'PER_ROOM_NIGHT' ? 'Package rate / room / night' : 'Total supplier cost for stay'}<input data-testid="package-rate-amount" type="number" min="1" max="100000000" value={packageRateAmount} onChange={event => setPackageRateAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
        <label className="text-xs font-semibold text-slate-700">Tax treatment<select data-testid="package-rate-tax-treatment" value={packageTaxTreatment} onChange={event => setPackageTaxTreatment(event.target.value as TaxTreatment)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="NET">Net / taxes extra</option><option value="INCLUSIVE">Taxes included</option><option value="GST_5">Add 5% GST</option><option value="GST_18">Add 18% GST</option><option value="NEEDS_CONFIRMATION">Tax needs confirmation</option></select></label>
        <label className="text-xs font-semibold text-slate-700">Reference (optional)<input data-testid="package-rate-reference" value={supplierReference} onChange={event => setSupplierReference(event.target.value)} placeholder="WhatsApp — hotel contact" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
        <label className="text-xs font-semibold text-slate-700">Reason (optional)<input value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Special group rate" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /></label>
      </div>}
    </section>
    {rateSegments.length > 1 && <section data-testid="rate-boundary-breakdown" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900"><p className="font-black">Rate changes during this stay</p>{rateSegments.map(segment => <p key={`${segment.from}-${segment.rateId}`} className="mt-1">{segment.from === segment.to ? segment.from : `${segment.from} – ${segment.to}`}: ₹{segment.baseRate.toLocaleString('en-IN')} / room / night</p>)}</section>}
    <div className="mt-4 rounded-xl border border-slate-200 p-4">
      {isCalculating ? <p className="text-center text-xs text-slate-500">Validating each room…</p> : error ? <div className="flex gap-2 text-xs text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{error}</span></div> : calculatedRate?.available === false ? <div className="flex gap-2 text-xs text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{calculatedRate.reason || 'This room distribution is not available.'} {rateMode === 'CONTRACTED' ? 'Choose a package supplier rate above to continue.' : ''}</span></div> : calculatedRate ? <>
        {calculatedRate.contractedTotalSupplierCost !== undefined && <div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Contracted total</span><strong data-testid="contracted-rate-total" className="text-slate-800">₹{calculatedRate.contractedTotalSupplierCost.toLocaleString('en-IN')}</strong></div>}
        {calculatedRate.packageSupplierRate && <div className="mt-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Package rate</span><strong data-testid="package-rate-display" className="text-violet-700">₹{calculatedRate.packageSupplierRate.amount.toLocaleString('en-IN')}{calculatedRate.packageSupplierRate.entryMode === 'PER_ROOM_NIGHT' ? ' / room / night' : ' total'}</strong></div>}
        <div className="mt-2 flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Supplier cost for {roomAllocations.length} room{roomAllocations.length === 1 ? '' : 's'}</span><strong data-testid="hotel-supplier-cost" className="text-base text-emerald-800">{calculatedRate.totalSupplierCost === undefined ? 'Rate unavailable to this role' : `₹${calculatedRate.totalSupplierCost.toLocaleString('en-IN')}`}</strong></div>
        <button data-testid="confirm-trip-hotel" type="button" onClick={() => void handleSelect()} className="mt-4 w-full rounded-lg bg-[#7056EE] py-2.5 text-sm font-bold text-white">{initialMetadata ? 'Save Hotel Changes' : 'Confirm & Add to Trip'}</button>
      </> : <p className="text-center text-xs text-slate-500">Select a property and room category.</p>}
    </div>
  </div>;
};

import React, { useCallback, useEffect, useState } from 'react';
import { BedDouble, Building2, CalendarDays, Edit2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { inventoryApi } from '../../services/inventory/inventoryApi';
import type { AccommodationProperty, MealPlanType, RatePeriod, RoomCategory } from '../../types/accommodation';
import type { Supplier } from '../../types';

type ModalState = { type: 'property'; value?: AccommodationProperty } | { type: 'room'; value?: RoomCategory } | { type: 'rate'; value?: RatePeriod } | null;
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#7056EE] focus:outline-none';
const labelClass = 'space-y-1 text-xs font-bold text-slate-600';

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{title}</h3><button type="button" onClick={onClose} className="text-sm font-bold text-slate-500">Cancel</button></div>{children}</div></div>;
}

export const AccommodationInventoryView: React.FC = () => {
  const { currentUser } = useAuth();
  const canManage = currentUser.role === 'Founder' || currentUser.role === 'Admin';
  const canReadRates = ['Founder', 'Admin', 'Accounts', 'Reservations'].includes(currentUser.role);
  const [properties, setProperties] = useState<AccommodationProperty[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomCategory[]>([]);
  const [rates, setRates] = useState<RatePeriod[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selected = properties.find((item) => item.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const next = await inventoryApi.properties(currentUser.employeeId);
      setProperties(next);
      if (selectedId && !next.some((item) => item.id === selectedId)) setSelectedId(null);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load properties.'); }
    finally { setLoading(false); }
  }, [currentUser.employeeId, selectedId]);

  const loadPropertyData = useCallback(async (propertyId: string) => {
    setLoading(true); setError('');
    try {
      const [nextRooms, nextRates, nextSuppliers] = await Promise.all([
        inventoryApi.rooms(propertyId, currentUser.employeeId),
        canReadRates ? inventoryApi.accommodationRates(propertyId, currentUser.employeeId) : Promise.resolve([]),
        canReadRates ? inventoryApi.accommodationSuppliers(currentUser.employeeId) : Promise.resolve([]),
      ]);
      setRooms(nextRooms); setRates(nextRates); setSuppliers(nextSuppliers);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load property inventory.'); }
    finally { setLoading(false); }
  }, [canReadRates, currentUser.employeeId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selectedId) void loadPropertyData(selectedId); }, [loadPropertyData, selectedId]);

  const saveProperty = async (event: React.FormEvent<HTMLFormElement>, existing?: AccommodationProperty) => {
    event.preventDefault(); setSaving(true); setError(''); const data = new FormData(event.currentTarget);
    const payload = { name: data.get('name'), propertyType: data.get('propertyType'), city: data.get('city'), location: data.get('location'), description: data.get('description'), supplierId: data.get('supplierId') || undefined, status: data.get('status'), currency: 'INR', amenities: [], preferredProperty: false, availabilityStatus: 'NOT_CHECKED' };
    try { const saved = existing ? await inventoryApi.updateProperty(existing.id, payload as any, currentUser.employeeId) : await inventoryApi.createProperty(payload as any, currentUser.employeeId); setProperties((previous) => existing ? previous.map((item) => item.id === saved.id ? saved : item) : [saved, ...previous]); setModal(null); setSelectedId(saved.id); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save property.'); }
    finally { setSaving(false); }
  };

  const saveRoom = async (event: React.FormEvent<HTMLFormElement>, existing?: RoomCategory) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(''); const data = new FormData(event.currentTarget);
    const payload = { ...(existing ? {} : { propertyId: selected.id }), name: data.get('name'), description: data.get('description'), maxAdults: Number(data.get('maxAdults')), maxChildren: Number(data.get('maxChildren')), bedConfiguration: data.get('bedConfiguration'), amenities: [], active: data.get('active') === 'true', sortOrder: existing?.sortOrder || rooms.length + 1 };
    try { const saved = existing ? await inventoryApi.updateRoom(existing.id, payload as any, currentUser.employeeId) : await inventoryApi.createRoom(payload as any, currentUser.employeeId); setRooms((previous) => existing ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved]); setModal(null); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save room category.'); }
    finally { setSaving(false); }
  };

  const saveRate = async (event: React.FormEvent<HTMLFormElement>, existing?: RatePeriod) => {
    event.preventDefault(); if (!selected) return; setSaving(true); setError(''); const data = new FormData(event.currentTarget); const eb = Number(data.get('eb') || 0); const cwb = Number(data.get('cwb') || 0);
    const supplements = [
      ...(eb > 0 ? [{ type: 'EB', name: 'Extra Bed / Adult Supplement', amount: eb, unit: 'per_person_night', taxTreatment: 'INCLUSIVE' }] : []),
      ...(cwb > 0 ? [{ type: 'CWB', name: 'Child With Bed', amount: cwb, unit: 'per_child_night', taxTreatment: 'INCLUSIVE' }] : []),
    ];
    const payload = { ...(existing ? {} : { propertyId: selected.id, roomCategoryId: data.get('roomCategoryId') }), mealPlan: data.get('mealPlan'), baseRate: Number(data.get('baseRate')), validFrom: data.get('validFrom'), validTo: data.get('validTo') || null, currency: 'INR', taxTreatment: 'INCLUSIVE', confirmationStatus: 'CONFIRMED', status: data.get('status'), supplements, notes: data.get('notes') };
    try { const saved = existing ? await inventoryApi.updateAccommodationRate(existing.id, payload as any, currentUser.employeeId) : await inventoryApi.createAccommodationRate(payload as any, currentUser.employeeId); setRates((previous) => existing ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved]); setModal(null); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save contracted rate.'); }
    finally { setSaving(false); }
  };

  if (loading && !properties.length) return <div className="flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading accommodation inventory…</div>;

  return <div className="space-y-6" data-testid="accommodation-inventory">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><Building2 className="h-6 w-6 text-[#7056EE]" />Accommodation Inventory</h1><p className="text-sm text-slate-500">Authoritative properties, room categories, meal plans and supplier contracts.</p></div><div className="flex gap-2"><button type="button" onClick={() => void load()} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"><RefreshCw className="inline h-4 w-4" /></button>{canManage && <button data-testid="add-property" type="button" onClick={() => setModal({ type: 'property' })} className="rounded-lg bg-[#7056EE] px-4 py-2 text-sm font-bold text-white"><Plus className="mr-1 inline h-4 w-4" />Add Property</button>}</div></div>
    {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-4 md:grid-cols-3">{properties.map((property) => <button data-testid={`property-${property.name}`} key={property.id} type="button" onClick={() => setSelectedId(property.id)} className={`rounded-xl border bg-white p-4 text-left ${selectedId === property.id ? 'border-[#7056EE] ring-1 ring-[#7056EE]' : 'border-slate-200'}`}><div className="flex justify-between gap-2"><strong>{property.name}</strong><span className={`text-[10px] font-bold ${property.status === 'ACTIVE' ? 'text-emerald-700' : 'text-slate-500'}`}>{property.status}</span></div><p className="mt-1 text-xs text-slate-500">{property.city}, {property.location}</p></button>)}</div>

    {selected && <div className="space-y-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{selected.name}</h2><p className="text-xs text-slate-500">Stable ID: {selected.id}</p></div>{canManage && <div className="flex gap-2"><button data-testid="edit-property" type="button" onClick={() => setModal({ type: 'property', value: selected })} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold"><Edit2 className="mr-1 inline h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => void inventoryApi.updateProperty(selected.id, { status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }, currentUser.employeeId).then((saved) => setProperties((items) => items.map((item) => item.id === saved.id ? saved : item))).catch((e) => setError(e.message))} className="rounded-lg border bg-white px-3 py-2 text-xs font-bold">{selected.status === 'ACTIVE' ? 'Disable' : 'Enable'}</button></div>}</div>
      <section className="space-y-3"><div className="flex justify-between"><h3 className="flex items-center gap-2 font-bold"><BedDouble className="h-4 w-4" />Room Categories</h3>{canManage && <button data-testid="add-room" type="button" onClick={() => setModal({ type: 'room' })} className="text-xs font-bold text-[#7056EE]">+ Add Room</button>}</div><div className="grid gap-3 md:grid-cols-2">{rooms.map((room) => <div data-testid={`room-${room.name}`} key={room.id} className="rounded-xl border bg-white p-4"><div className="flex justify-between"><strong className="text-sm">{room.name}</strong>{canManage && <button type="button" onClick={() => setModal({ type: 'room', value: room })}><Edit2 className="h-4 w-4 text-slate-400" /></button>}</div><p className="mt-1 text-xs text-slate-500">Double occupancy base · {room.maxAdults} adults · {room.maxChildren} children</p><p className="mt-1 text-[10px] font-bold text-slate-400">{room.active ? 'ACTIVE' : 'INACTIVE'}</p></div>)}</div></section>
      {canReadRates && <section className="space-y-3"><div className="flex justify-between"><h3 className="flex items-center gap-2 font-bold"><CalendarDays className="h-4 w-4" />Contracted Rates</h3>{canManage && <button data-testid="add-accommodation-rate" type="button" disabled={!rooms.length} onClick={() => setModal({ type: 'rate' })} className="text-xs font-bold text-[#7056EE]">+ Add Rate</button>}</div><p className="text-xs text-slate-500">Default child policy: age ≤5 complimentary, 6–11 CWB, 12+ extra-bed/adult supplement.</p>{rates.map((rate) => <div data-testid={`accommodation-rate-${rate.id}`} key={rate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4"><div><strong>{rooms.find((room) => room.id === rate.roomCategoryId)?.name || rate.roomCategoryId} · {rate.mealPlan}</strong><p className="text-xs text-slate-500">{rate.validFrom} to {rate.validTo || 'open'} · {rate.status}</p></div><div className="flex items-center gap-3"><strong>{rate.currency} {rate.baseRate.toLocaleString()}</strong>{canManage && <button data-testid={`edit-accommodation-rate-${rate.id}`} type="button" onClick={() => setModal({ type: 'rate', value: rate })}><Edit2 className="h-4 w-4 text-slate-400" /></button>}</div></div>)}</section>}
    </div>}

    {modal?.type === 'property' && <Modal title={modal.value ? 'Edit Property' : 'Add Property'} onClose={() => setModal(null)}><form onSubmit={(event) => void saveProperty(event, modal.value)} className="grid gap-4 md:grid-cols-2"><label className={`${labelClass} md:col-span-2`}>Name<input data-testid="property-name" name="name" required defaultValue={modal.value?.name} className={inputClass} /></label><label className={labelClass}>Type<select name="propertyType" defaultValue={modal.value?.propertyType || 'HOTEL'} className={inputClass}><option>HOTEL</option><option>RESORT</option><option>HOUSEBOAT</option><option>HOMESTAY</option></select></label><label className={labelClass}>Supplier<select name="supplierId" defaultValue={modal.value?.supplierId || ''} className={inputClass}><option value="">No supplier link</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className={labelClass}>City<input data-testid="property-city" name="city" required defaultValue={modal.value?.city} className={inputClass} /></label><label className={labelClass}>Region<input data-testid="property-location" name="location" required defaultValue={modal.value?.location} className={inputClass} /></label><label className={`${labelClass} md:col-span-2`}>Description<textarea name="description" defaultValue={modal.value?.description} className={inputClass} /></label><label className={labelClass}>Status<select name="status" defaultValue={modal.value?.status || 'ACTIVE'} className={inputClass}><option>ACTIVE</option><option>INACTIVE</option></select></label><div className="md:col-span-2 flex justify-end"><button data-testid="save-property" disabled={saving} className="rounded-lg bg-[#7056EE] px-5 py-2 text-sm font-bold text-white">{saving ? 'Saving…' : 'Save'}</button></div></form></Modal>}
    {modal?.type === 'room' && <Modal title={modal.value ? 'Edit Room Category' : 'Add Room Category'} onClose={() => setModal(null)}><form onSubmit={(event) => void saveRoom(event, modal.value)} className="grid gap-4 md:grid-cols-2"><label className={`${labelClass} md:col-span-2`}>Name<input data-testid="room-name" name="name" required defaultValue={modal.value?.name} className={inputClass} /></label><label className={labelClass}>Max adults<input name="maxAdults" type="number" min="1" required defaultValue={modal.value?.maxAdults || 2} className={inputClass} /></label><label className={labelClass}>Max children<input name="maxChildren" type="number" min="0" required defaultValue={modal.value?.maxChildren ?? 1} className={inputClass} /></label><label className={labelClass}>Bed configuration<input name="bedConfiguration" defaultValue={modal.value?.bedConfiguration} className={inputClass} /></label><label className={labelClass}>Status<select name="active" defaultValue={String(modal.value?.active ?? true)} className={inputClass}><option value="true">ACTIVE</option><option value="false">INACTIVE</option></select></label><label className={`${labelClass} md:col-span-2`}>Description<textarea name="description" defaultValue={modal.value?.description} className={inputClass} /></label><div className="md:col-span-2 flex justify-end"><button data-testid="save-room" disabled={saving} className="rounded-lg bg-[#7056EE] px-5 py-2 text-sm font-bold text-white">Save</button></div></form></Modal>}
    {modal?.type === 'rate' && <Modal title={modal.value ? 'Edit Contracted Rate' : 'Add Contracted Rate'} onClose={() => setModal(null)}><form onSubmit={(event) => void saveRate(event, modal.value)} className="grid gap-4 md:grid-cols-2"><label className={labelClass}>Room<select data-testid="rate-room" name="roomCategoryId" disabled={Boolean(modal.value)} defaultValue={modal.value?.roomCategoryId || rooms[0]?.id} className={inputClass}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className={labelClass}>Meal plan<select data-testid="rate-meal-plan" name="mealPlan" defaultValue={modal.value?.mealPlan || 'CP'} className={inputClass}>{(['EP', 'CP', 'MAP', 'AP'] as MealPlanType[]).map((meal) => <option key={meal}>{meal}</option>)}</select></label><label className={labelClass}>Unit rate<input data-testid="rate-base" name="baseRate" type="number" min="0" step="0.01" required defaultValue={modal.value?.baseRate} className={inputClass} /></label><label className={labelClass}>Status<select name="status" defaultValue={modal.value?.status || 'ACTIVE'} className={inputClass}><option>ACTIVE</option><option>ARCHIVED</option></select></label><label className={labelClass}>Valid from<input data-testid="rate-from" name="validFrom" type="date" required defaultValue={modal.value?.validFrom?.slice(0, 10)} className={inputClass} /></label><label className={labelClass}>Valid to<input data-testid="rate-to" name="validTo" type="date" defaultValue={modal.value?.validTo?.slice(0, 10)} className={inputClass} /></label><label className={labelClass}>Extra bed / adult supplement<input name="eb" type="number" min="0" defaultValue={modal.value?.supplements.find((item) => item.type === 'EB')?.amount || 0} className={inputClass} /></label><label className={labelClass}>Child with bed supplement<input name="cwb" type="number" min="0" defaultValue={modal.value?.supplements.find((item) => item.type === 'CWB')?.amount || 0} className={inputClass} /></label><label className={`${labelClass} md:col-span-2`}>Notes<input name="notes" defaultValue={modal.value?.notes} className={inputClass} /></label><div className="md:col-span-2 flex justify-end"><button data-testid="save-accommodation-rate" disabled={saving} className="rounded-lg bg-[#7056EE] px-5 py-2 text-sm font-bold text-white">Save</button></div></form></Modal>}
  </div>;
};

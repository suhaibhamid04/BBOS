import React, { useCallback, useEffect, useState } from 'react';
import { Car, Edit2, Loader2, Plus, RefreshCw, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { inventoryApi } from '../../services/inventory/inventoryApi';
import type { Supplier } from '../../types';
import type { TransportRatePeriod, VehicleCategory } from '../../types/transport';

type Tab = 'vehicles' | 'suppliers' | 'rates';
type Modal = { type: 'vehicle'; value?: VehicleCategory } | { type: 'supplier'; value?: Supplier } | { type: 'rate'; value?: TransportRatePeriod } | null;
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#7056EE] focus:outline-none';
const labelClass = 'space-y-1 text-xs font-bold text-slate-600';

function Dialog({ title, children, close }: { title: string; children: React.ReactNode; close: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{title}</h3><button type="button" onClick={close} className="text-sm font-bold text-slate-500">Cancel</button></div>{children}</div></div>;
}

export const TransportInventoryView: React.FC = () => {
  const { currentUser } = useAuth();
  const canManage = ['Founder', 'Admin'].includes(currentUser.role);
  const canReadRates = ['Founder', 'Admin', 'Accounts', 'Reservations'].includes(currentUser.role);
  const [tab, setTab] = useState<Tab>('vehicles');
  const [vehicles, setVehicles] = useState<VehicleCategory[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rates, setRates] = useState<TransportRatePeriod[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [nextVehicles, nextSuppliers, nextRates] = await Promise.all([
        inventoryApi.vehicles(currentUser.employeeId),
        canReadRates ? inventoryApi.transportSuppliers(currentUser.employeeId) : Promise.resolve([]),
        canReadRates ? inventoryApi.transportRates(currentUser.employeeId) : Promise.resolve([]),
      ]);
      setVehicles(nextVehicles); setSuppliers(nextSuppliers); setRates(nextRates);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to load transport inventory.'); }
    finally { setLoading(false); }
  }, [canReadRates, currentUser.employeeId]);
  useEffect(() => { void load(); }, [load]);

  const act = async (task: () => Promise<unknown>) => {
    setSaving(true); setError('');
    try { await task(); setModal(null); await load(); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save inventory.'); }
    finally { setSaving(false); }
  };

  return <div className="flex h-full flex-col bg-slate-50">
    <header className="border-b border-slate-200 bg-white px-6 py-5"><div className="flex items-center justify-between"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Truck className="text-[#7056EE]"/>Transport Inventory</h1><p className="mt-1 text-sm text-slate-500">Authoritative vehicle, supplier and contracted-rate records.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-slate-200 p-2 text-slate-500" aria-label="Refresh"><RefreshCw className="h-4 w-4"/></button></div>
      <nav className="mt-6 flex gap-6">{(['vehicles', ...(canReadRates ? ['suppliers', 'rates'] : [])] as Tab[]).map((key) => <button type="button" key={key} data-testid={`transport-tab-${key}`} onClick={() => setTab(key)} className={`border-b-2 pb-3 text-sm font-bold capitalize ${tab === key ? 'border-[#7056EE] text-[#7056EE]' : 'border-transparent text-slate-500'}`}>{key}</button>)}</nav>
    </header>
    <main className="flex-1 overflow-auto p-6">{error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{loading ? <Loader2 className="mx-auto mt-16 animate-spin text-[#7056EE]"/> : <>
      {tab === 'vehicles' && <Section title="Vehicle categories" addLabel="Add vehicle" canAdd={canManage} testId="add-vehicle" add={() => setModal({ type: 'vehicle' })}>{vehicles.map((item) => <Card key={item.id} title={item.displayName} subtitle={`${item.category.replaceAll('_', ' ')} · ${item.passengerCapacity} passengers · ${item.operationalRegions.join(', ') || 'No region'}`} active={item.active} edit={canManage ? () => setModal({ type: 'vehicle', value: item }) : undefined}/>)}</Section>}
      {tab === 'suppliers' && canReadRates && <Section title="Transport suppliers" addLabel="Add supplier" canAdd={canManage} testId="add-transport-supplier" add={() => setModal({ type: 'supplier' })}>{suppliers.map((item) => <Card key={item.id} title={item.name} subtitle={`${item.contactPerson || 'No contact'} · ${item.city || 'No city'}`} active={item.active} edit={canManage ? () => setModal({ type: 'supplier', value: item }) : undefined}/>)}</Section>}
      {tab === 'rates' && canReadRates && <Section title="Contracted rates" addLabel="Add rate" canAdd={canManage} testId="add-transport-rate" add={() => setModal({ type: 'rate' })}>{rates.map((item) => <Card key={item.id} title={`${vehicles.find((v) => v.id === item.vehicleCategoryId)?.displayName || item.vehicleCategoryId} · ${item.serviceType.replaceAll('_', ' ')}`} subtitle={`₹${item.baseRate.toLocaleString()} ${item.pricingUnit.replaceAll('_', ' ')} · ${item.validFrom} to ${item.validTo || 'open ended'}`} active={item.status === 'ACTIVE'} editTestId={`edit-transport-rate-${item.id}`} edit={canManage ? () => setModal({ type: 'rate', value: item }) : undefined}/>)}</Section>}
    </>}</main>
    {modal?.type === 'vehicle' && <VehicleForm value={modal.value} saving={saving} close={() => setModal(null)} submit={(payload) => act(() => modal.value ? inventoryApi.updateVehicle(modal.value.id, payload, currentUser.employeeId) : inventoryApi.createVehicle(payload, currentUser.employeeId))}/>}
    {modal?.type === 'supplier' && <SupplierForm value={modal.value} saving={saving} close={() => setModal(null)} submit={(payload) => act(() => modal.value ? inventoryApi.updateTransportSupplier(modal.value.id, payload, currentUser.employeeId) : inventoryApi.createTransportSupplier(payload, currentUser.employeeId))}/>}
    {modal?.type === 'rate' && <RateForm value={modal.value} vehicles={vehicles.filter((v) => v.active)} suppliers={suppliers.filter((s) => s.active)} saving={saving} close={() => setModal(null)} submit={(payload) => act(() => modal.value ? inventoryApi.updateTransportRate(modal.value.id, payload, currentUser.employeeId) : inventoryApi.createTransportRate(payload, currentUser.employeeId))}/>}
  </div>;
};

function Section({ title, addLabel, canAdd, testId, add, children }: { title: string; addLabel: string; canAdd: boolean; testId: string; add: () => void; children: React.ReactNode }) {
  return <section><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{title}</h2>{canAdd && <button type="button" data-testid={testId} onClick={add} className="flex items-center gap-2 rounded-lg bg-[#7056EE] px-4 py-2 text-sm font-bold text-white"><Plus className="h-4 w-4"/>{addLabel}</button>}</div><div className="grid gap-3">{children}</div></section>;
}
function Card({ title, subtitle, active, edit, editTestId }: { key?: React.Key; title: string; subtitle: string; active: boolean; edit?: () => void; editTestId?: string }) {
  return <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4"><div><div className="flex items-center gap-2"><Car className="h-4 w-4 text-[#7056EE]"/><strong className="text-sm text-slate-900">{title}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span></div><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div>{edit && <button data-testid={editTestId} type="button" onClick={edit} aria-label={`Edit ${title}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Edit2 className="h-4 w-4"/></button>}</div>;
}

function VehicleForm({ value, saving, close, submit }: { value?: VehicleCategory; saving: boolean; close: () => void; submit: (value: Partial<VehicleCategory>) => void }) {
  const [form, setForm] = useState({ name: value?.name || '', displayName: value?.displayName || '', category: value?.category || 'SEDAN', seatingCapacity: value?.seatingCapacity || 4, passengerCapacity: value?.passengerCapacity || 3, operationalRegions: value?.operationalRegions.join(', ') || '', features: value?.features.join(', ') || '', active: value?.active ?? true });
  return <Dialog title={value ? 'Edit vehicle category' : 'Add vehicle category'} close={close}><form onSubmit={(event) => { event.preventDefault(); submit({ ...form, operationalRegions: form.operationalRegions.split(',').map((v) => v.trim()).filter(Boolean), features: form.features.split(',').map((v) => v.trim()).filter(Boolean) }); }} className="grid grid-cols-2 gap-4"><label className={`${labelClass} col-span-2`}>Name<input data-testid="vehicle-name" required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label><label className={`${labelClass} col-span-2`}>Display name<input required className={inputClass} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}/></label><label className={labelClass}>Category<select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as VehicleCategory['category'] })}>{['SEDAN','SUV','MUV','TEMPO_TRAVELLER','BUS','LUXURY','CUSTOM'].map((v) => <option key={v}>{v}</option>)}</select></label><label className={labelClass}>Passenger capacity<input required min="0" type="number" className={inputClass} value={form.passengerCapacity} onChange={(e) => setForm({ ...form, passengerCapacity: Number(e.target.value), seatingCapacity: Number(e.target.value) + 1 })}/></label><label className={`${labelClass} col-span-2`}>Regions (comma separated)<input className={inputClass} value={form.operationalRegions} onChange={(e) => setForm({ ...form, operationalRegions: e.target.value })}/></label><label className={`${labelClass} col-span-2`}>Features (comma separated)<input className={inputClass} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })}/></label>{value && <label className="col-span-2 flex gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/>Active</label>}<button data-testid="save-vehicle" disabled={saving} className="col-span-2 rounded-lg bg-[#7056EE] py-2.5 text-sm font-bold text-white">{saving ? 'Saving…' : 'Save vehicle'}</button></form></Dialog>;
}

function SupplierForm({ value, saving, close, submit }: { value?: Supplier; saving: boolean; close: () => void; submit: (value: Partial<Supplier>) => void }) {
  const [form, setForm] = useState({ name: value?.name || '', contactPerson: value?.contactPerson || '', phone: value?.phone || '', email: value?.email || '', city: value?.city || '', paymentTerms: value?.paymentTerms || '', active: value?.active ?? true });
  return <Dialog title={value ? 'Edit transport supplier' : 'Add transport supplier'} close={close}><form onSubmit={(event) => { event.preventDefault(); submit(form); }} className="grid grid-cols-2 gap-4"><label className={`${labelClass} col-span-2`}>Supplier name<input data-testid="transport-supplier-name" required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/></label>{(['contactPerson','phone','email','city','paymentTerms'] as const).map((key) => <label key={key} className={key === 'paymentTerms' ? `${labelClass} col-span-2` : labelClass}>{key.replace(/([A-Z])/g, ' $1')}<input className={inputClass} type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}/></label>)}{value && <label className="col-span-2 flex gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })}/>Active</label>}<button data-testid="save-transport-supplier" disabled={saving} className="col-span-2 rounded-lg bg-[#7056EE] py-2.5 text-sm font-bold text-white">Save supplier</button></form></Dialog>;
}

function RateForm({ value, vehicles, suppliers, saving, close, submit }: { value?: TransportRatePeriod; vehicles: VehicleCategory[]; suppliers: Supplier[]; saving: boolean; close: () => void; submit: (value: Partial<TransportRatePeriod>) => void }) {
  const [form, setForm] = useState({ vehicleCategoryId: value?.vehicleCategoryId || vehicles[0]?.id || '', supplierId: value?.supplierId || suppliers[0]?.id || '', serviceType: value?.serviceType || 'MULTI_DAY_JOURNEY', pricingUnit: value?.pricingUnit || 'PER_DAY', baseRate: value?.baseRate || 0, validFrom: value?.validFrom || '', validTo: value?.validTo || '', status: value?.status || 'ACTIVE' });
  return <Dialog title={value ? 'Edit transport rate' : 'Add transport rate'} close={close}><form onSubmit={(event) => { event.preventDefault(); const payload: Partial<TransportRatePeriod> = { ...form, validTo: form.validTo || null }; if (value) delete payload.vehicleCategoryId; submit(payload); }} className="grid grid-cols-2 gap-4"><label className={`${labelClass} col-span-2`}>Vehicle<select data-testid="transport-rate-vehicle" disabled={!!value} required className={inputClass} value={form.vehicleCategoryId} onChange={(e) => setForm({ ...form, vehicleCategoryId: e.target.value })}><option value="">Select</option>{vehicles.map((v) => <option value={v.id} key={v.id}>{v.displayName}</option>)}</select></label><label className={`${labelClass} col-span-2`}>Supplier<select required className={inputClass} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}><option value="">Select</option>{suppliers.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label className={labelClass}>Service<select className={inputClass} value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value as TransportRatePeriod['serviceType'] })}>{['MULTI_DAY_JOURNEY','AIRPORT_TRANSFER','LOCAL_SIGHTSEEING','DAY_TRIP','CUSTOM'].map((v) => <option key={v}>{v}</option>)}</select></label><label className={labelClass}>Pricing unit<select className={inputClass} value={form.pricingUnit} onChange={(e) => setForm({ ...form, pricingUnit: e.target.value as TransportRatePeriod['pricingUnit'] })}>{['PER_DAY','PER_TRIP','PER_TRANSFER','PER_ROUTE','PER_KM','PER_HOUR','PER_JOURNEY'].map((v) => <option key={v}>{v}</option>)}</select></label><label className={labelClass}>Base rate<input data-testid="transport-base-rate" required min="0" type="number" className={inputClass} value={form.baseRate} onChange={(e) => setForm({ ...form, baseRate: Number(e.target.value) })}/></label><span/><label className={labelClass}>Valid from<input required type="date" className={inputClass} value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })}/></label><label className={labelClass}>Valid to<input type="date" className={inputClass} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })}/></label>{value && <label className={`${labelClass} col-span-2`}>Status<select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'ACTIVE' | 'ARCHIVED' })}><option>ACTIVE</option><option>ARCHIVED</option></select></label>}<button data-testid="save-transport-rate" disabled={saving} className="col-span-2 rounded-lg bg-[#7056EE] py-2.5 text-sm font-bold text-white">Save rate</button></form></Dialog>;
}

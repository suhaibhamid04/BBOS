import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Bed, Car, Check, CheckCircle2, Compass, Eye, History,
  Plus, Search, ShieldCheck, Tag, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type { CustomerPackageDocument, Quote, QuoteBackupAccommodation, QuoteStatus, Trip } from '../../types';
import { CustomerPackagePreview } from './CustomerPackagePreview';

interface QuotesViewProps {
  initialQuoteId?: string;
  onNavigate?: (section: any, targetId?: string) => void;
}

const money = (value?: number) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const tomorrowPlus = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const QuotesView: React.FC<QuotesViewProps> = ({ initialQuoteId, onNavigate }) => {
  const {
    quotes, trips, customers, createQuote, updateQuote, convertQuoteToBooking,
    loadTripItinerary, getQuoteBackupAccommodationOptions, getCustomerPackage, shareQuotePackage,
  } = useData();
  const { currentUser } = useAuth();
  const [selectedQuoteId, setSelectedQuoteIdState] = useState<string | null>(() =>
    initialQuoteId || sessionStorage.getItem('bb_active_quote_id'),
  );
  const [editForm, setEditForm] = useState<Quote | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [toast, setToast] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTripId, setNewTripId] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState(0);
  const [newDiscount, setNewDiscount] = useState(0);
  const [newValidUntil, setNewValidUntil] = useState(tomorrowPlus(7));
  const [backupOptions, setBackupOptions] = useState<Record<string, QuoteBackupAccommodation[]>>({});
  const [loadingBackupsFor, setLoadingBackupsFor] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [customerPackage, setCustomerPackage] = useState<CustomerPackageDocument | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const canMutate = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(currentUser.role);
  const canSeeFinancials = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(currentUser.role);
  const costedTrips = trips.filter(trip => trip.costingStatus === 'CALCULATED');
  const selectedTrip = trips.find(trip => trip.id === newTripId);

  const setSelectedQuoteId = (id: string | null) => {
    setSelectedQuoteIdState(id);
    if (id) sessionStorage.setItem('bb_active_quote_id', id);
    else sessionStorage.removeItem('bb_active_quote_id');
  };

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (initialQuoteId) setSelectedQuoteId(initialQuoteId);
  }, [initialQuoteId]);

  useEffect(() => {
    const quote = quotes.find(item => item.id === selectedQuoteId);
    setEditForm(quote ? { ...quote } : null);
  }, [quotes, selectedQuoteId]);

  useEffect(() => {
    if (!selectedTrip) return;
    setNewSellingPrice(selectedTrip.totalSellingPrice || Math.max(selectedTrip.totalSupplierCost || 0, selectedTrip.budget || 0));
    setNewDiscount(0);
  }, [selectedTrip?.id]);

  const filtered = useMemo(() => quotes.filter(quote => {
    const query = search.toLowerCase();
    return (statusFilter === 'ALL' || quote.status === statusFilter) &&
      (`${quote.id} ${quote.customerName} ${quote.destination}`.toLowerCase().includes(query));
  }), [quotes, search, statusFilter]);

  const createFromTrip = async () => {
    const trip = trips.find(item => item.id === newTripId);
    if (!trip) return notify('Choose a Trip first.');
    if (trip.costingStatus !== 'CALCULATED') return notify('Recalculate Trip costing before creating a Quote.');
    try {
      await loadTripItinerary(trip.id);
      const customer = customers.find(item => item.id === trip.customerId);
      const quote = await createQuote({
        tripId: trip.id,
        leadId: trip.leadId || '',
        customerId: trip.customerId,
        customerName: customer?.name || 'Guest',
        customerPhone: customer?.phone,
        customerEmail: customer?.email,
        destination: trip.destination,
        travelerCount: trip.travelerCount,
        adults: trip.adults,
        children: trip.children,
        totalAmount: newSellingPrice,
        discountAmount: newDiscount,
        validUntil: newValidUntil,
        inclusions: ['Inventory-linked itinerary services', 'BBOS trip coordination'],
        exclusions: ['Personal expenses', 'Services not listed in this proposal'],
        termsAndConditions: 'Services remain subject to availability until booking confirmation.',
      });
      setShowNew(false);
      setSelectedQuoteId(quote.id);
      notify(`Quote ${quote.id} created from the calculated Trip.`);
    } catch (error: any) {
      notify(error.message || 'Unable to create Quote.');
    }
  };

  const saveQuote = async () => {
    if (!editForm) return;
    try {
      const updated = await updateQuote(editForm.id, {
        totalAmount: Number(editForm.totalAmount),
        discountAmount: Number(editForm.discountAmount),
        validUntil: editForm.validUntil,
        notes: editForm.notes,
        inclusions: editForm.inclusions,
        exclusions: editForm.exclusions,
        termsAndConditions: editForm.termsAndConditions,
        backupAccommodations: editForm.backupAccommodations || [],
        status: editForm.status,
      }, true);
      setEditForm({ ...updated });
      notify(`Saved Quote version ${updated.version}.`);
    } catch (error: any) {
      notify(error.message || 'Unable to save Quote.');
    }
  };

  const loadBackups = async (sourceTripItemId: string) => {
    if (!editForm?.tripId) return;
    setLoadingBackupsFor(sourceTripItemId);
    try {
      const options = await getQuoteBackupAccommodationOptions(editForm.tripId, sourceTripItemId);
      setBackupOptions(current => ({ ...current, [sourceTripItemId]: options }));
    } catch (error: any) {
      notify(error.message || 'Unable to load backup hotels.');
    } finally {
      setLoadingBackupsFor(null);
    }
  };

  const toggleBackup = (option: QuoteBackupAccommodation) => {
    if (!editForm) return;
    const current = editForm.backupAccommodations || [];
    const exists = current.some(item => item.sourceTripItemId === option.sourceTripItemId && item.ratePeriodId === option.ratePeriodId);
    if (exists) {
      setEditForm({ ...editForm, backupAccommodations: current.filter(item => !(item.sourceTripItemId === option.sourceTripItemId && item.ratePeriodId === option.ratePeriodId)) });
      return;
    }
    const sourceCount = current.filter(item => item.sourceTripItemId === option.sourceTripItemId).length;
    if (sourceCount >= 2) return notify('A primary stay may have at most two backup hotels.');
    setEditForm({ ...editForm, backupAccommodations: [...current, option] });
  };

  const convert = async () => {
    if (!editForm) return;
    try {
      const booking = await convertQuoteToBooking(editForm.id);
      notify(`Booking ${booking.bookingReference} created.`);
      if (onNavigate) window.setTimeout(() => onNavigate('bookings', booking.id), 800);
    } catch (error: any) {
      notify(error.message || 'Quote conversion failed.');
    }
  };

  const openCustomerPackage = async () => {
    if (!editForm) return;
    setPackageError(null);
    try {
      setCustomerPackage(await getCustomerPackage(editForm.id));
    } catch (error: any) {
      notify(error.message || 'Customer package generation failed.');
    }
  };

  const shareCustomerPackage = async () => {
    if (!editForm) return;
    setPackageError(null);
    setIsSharing(true);
    try {
      const result = await shareQuotePackage(editForm.id, 'DOCUMENT', editForm.version || 1);
      setEditForm({ ...result.quote });
      setCustomerPackage(result.customerPackage);
      notify('Customer package recorded as shared and downloaded.');
    } catch (error: any) {
      const message = error.message || 'Package sharing failed.';
      setPackageError(message);
      throw error;
    } finally {
      setIsSharing(false);
    }
  };

  if (editForm) {
    const previewFinal = Math.max(0, Number(editForm.totalAmount || 0) - Number(editForm.discountAmount || 0));
    const previewProfit = editForm.totalSupplierCost === undefined ? undefined : previewFinal - editForm.totalSupplierCost;
    const previewMargin = previewProfit === undefined || previewFinal <= 0 ? undefined : Number(((previewProfit / previewFinal) * 100).toFixed(1));
    const legacy = !editForm.tripId;
    return (
      <div id="quote-builder-editor" className="space-y-5">
        {toast && <Toast message={toast} />}
        {customerPackage && <CustomerPackagePreview value={customerPackage} onClose={() => setCustomerPackage(null)} onShare={shareCustomerPackage} isSharing={isSharing} error={packageError} />}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedQuoteId(null)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Back to Quotes"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900">Quote #{editForm.id}</h2>
                <span data-testid="quote-version" className="text-xs font-bold px-2 py-1 rounded bg-purple-100 text-purple-700">V{editForm.version || 1}</span>
                {legacy && <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">LEGACY / UNLINKED</span>}
              </div>
              <p className="text-xs text-slate-500">{editForm.customerName} · {editForm.destination}{editForm.tripId ? ` · Trip ${editForm.tripId}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editForm.leadId && onNavigate && <button data-testid="quote-return-to-lead" type="button" onClick={() => onNavigate('lead-detail', editForm.leadId)} className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white">Return to Lead</button>}
            {(editForm.versionHistory?.length || 0) > 0 && <button type="button" onClick={() => setShowHistory(true)} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100"><History className="inline w-4 h-4 mr-1" />History</button>}
            <button data-testid="open-customer-package" type="button" onClick={openCustomerPackage} className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white"><Eye className="inline w-4 h-4 mr-1" />Customer Package</button>
            {canMutate && <button data-testid="save-quote" type="button" onClick={saveQuote} className="px-4 py-2 text-xs font-bold rounded-xl bg-[#7056EE] text-white">Save revision</button>}
            {canMutate && editForm.status === 'SENT' && <button data-testid="convert-quote" type="button" onClick={convert} className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white"><Check className="inline w-4 h-4 mr-1" />Convert</button>}
          </div>
        </div>

        {editForm.requiresLowMarginApproval && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Low-margin approval is required: {editForm.approval?.state || 'PENDING'}.</div>}
        {editForm.sharedAt && <div data-testid="quote-share-status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Shared via {editForm.shareChannel || 'DOCUMENT'} on {new Date(editForm.sharedAt).toLocaleString('en-IN')} by {editForm.sharedByEmployeeId}.</div>}

        <div className="grid xl:grid-cols-[1fr_340px] gap-5">
          <div className="space-y-4">
            <ServiceSection title="Accommodation" icon={<Bed className="w-4 h-4" />} empty="No accommodation service linked.">
              {(editForm.hotels || []).map((hotel, index) => (
                <div key={hotel.id || index} data-testid="quote-hotel-service" className="rounded-xl border border-slate-200 p-4 space-y-3">
                  <div className="flex justify-between gap-3">
                    <div><p className="font-bold text-sm">{hotel.hotelName}</p><p className="text-xs text-slate-500">{hotel.roomType} · {hotel.mealPlan}</p></div>
                    {!hotel.sourceTripItemId && <span className="text-[10px] text-amber-700">Legacy service</span>}
                  </div>
                  <p className="text-xs text-slate-600">{hotel.checkInDate || 'Date unavailable'}{hotel.checkOutDate ? ` → ${hotel.checkOutDate}` : ''} · {hotel.nights} nights · {hotel.roomsCount || hotel.rooms || 1} room(s) · {hotel.adultsCount || editForm.adults || 1} adults</p>
                  {hotel.sourceTripItemId && editForm.tripId && <>
                    <button data-testid={`load-backups-${hotel.sourceTripItemId}`} type="button" onClick={() => loadBackups(hotel.sourceTripItemId!)} className="text-xs font-bold text-[#7056EE]">
                      {loadingBackupsFor === hotel.sourceTripItemId ? 'Loading alternatives…' : 'Choose backup hotels'}
                    </button>
                    {(backupOptions[hotel.sourceTripItemId] || []).map(option => {
                      const selected = (editForm.backupAccommodations || []).some(item => item.sourceTripItemId === option.sourceTripItemId && item.ratePeriodId === option.ratePeriodId);
                      return <label key={option.id} className="flex items-center gap-2 text-xs rounded-lg bg-slate-50 p-2">
                        <input data-testid={`backup-option-${option.ratePeriodId}`} type="checkbox" checked={selected} onChange={() => toggleBackup(option)} />
                        <span><strong>{option.propertyName}</strong> · {option.roomCategoryName} · {option.mealPlan}</span>
                      </label>;
                    })}
                  </>}
                  {(editForm.backupAccommodations || []).filter(item => item.sourceTripItemId === hotel.sourceTripItemId).map(option => (
                    <div key={option.id} data-testid="selected-backup-hotel" className="text-xs rounded-lg border border-purple-200 bg-purple-50 p-2"><Tag className="inline w-3 h-3 mr-1" />Backup: {option.propertyName} · {option.roomCategoryName} · {option.mealPlan}</div>
                  ))}
                </div>
              ))}
            </ServiceSection>

            <ServiceSection title="Transport" icon={<Car className="w-4 h-4" />} empty="No transport service linked.">
              {(editForm.transports || []).map((item, index) => <div key={item.id || index} data-testid="quote-transport-service" className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-sm">{item.vehicleType}</p><p className="text-xs text-slate-500">{item.route}</p><p className="text-xs text-slate-600 mt-1">{item.serviceDate || 'Date unavailable'} · {item.days} day(s) · {item.passengerCount || editForm.travelerCount} travelers</p>
              </div>)}
            </ServiceSection>

            <ServiceSection title="Activities" icon={<Compass className="w-4 h-4" />} empty="No activity linked.">
              {(editForm.activities || []).map((item, index) => <div key={item.id || index} data-testid="quote-activity-service" className="rounded-xl border border-slate-200 p-4">
                <p className="font-bold text-sm">{item.activityName || item.name}</p><p className="text-xs text-slate-500">{item.serviceDate || item.date || 'Date unavailable'} · {item.pax} participant(s)</p>{item.specialRequests && <p className="text-xs text-slate-600 mt-1">{item.specialRequests}</p>}
              </div>)}
            </ServiceSection>
          </div>

          <aside className="bg-white rounded-2xl border border-slate-200 p-5 h-fit space-y-4">
            <div className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-600" /><h3 className="font-bold">Commercial pricing</h3></div>
            <MoneyInput testId="quote-selling-price" label="Proposed selling price" value={editForm.totalAmount} disabled={!canMutate} onChange={value => setEditForm({ ...editForm, totalAmount: value })} />
            <MoneyInput testId="quote-discount" label="Discount" value={editForm.discountAmount} disabled={!canMutate} onChange={value => setEditForm({ ...editForm, discountAmount: value })} />
            <label className="block text-xs font-semibold text-slate-600">Valid until<input data-testid="quote-valid-until" type="date" value={editForm.validUntil} disabled={!canMutate} onChange={event => setEditForm({ ...editForm, validUntil: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
            <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
              {canSeeFinancials && <Row label="Supplier cost" value={editForm.totalSupplierCost === undefined ? 'Pending' : money(editForm.totalSupplierCost)} testId="quote-supplier-cost" />}
              <Row label="Selling price" value={money(editForm.totalAmount)} />
              <Row label="Discount" value={`-${money(editForm.discountAmount)}`} />
              <Row label="Final selling price" value={money(previewFinal)} testId="quote-final-price" strong />
              {canSeeFinancials && <Row label="Profit" value={previewProfit === undefined ? 'Pending' : money(previewProfit)} testId="quote-profit" />}
              {canSeeFinancials && <Row label="Margin" value={previewMargin === undefined ? 'Pending' : `${previewMargin}%`} testId="quote-margin" />}
            </div>
            {canMutate && <label className="block text-xs font-semibold text-slate-600">Workflow status<select data-testid="quote-status" value={editForm.status} onChange={event => setEditForm({ ...editForm, status: event.target.value as QuoteStatus })} className="mt-1 w-full rounded-lg border border-slate-200 p-2"><option value="DRAFT">DRAFT</option><option value="PENDING_APPROVAL">PENDING_APPROVAL</option><option value="SENT">SENT</option><option value="VIEWED">VIEWED</option><option value="REJECTED">REJECTED</option><option value="EXPIRED">EXPIRED</option></select></label>}
          </aside>
        </div>

        {showHistory && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 max-w-xl w-full max-h-[80vh] overflow-auto"><div className="flex justify-between"><h3 className="font-bold">Commercial revision history</h3><button data-testid="close-quote-history" onClick={() => setShowHistory(false)}><X className="w-5 h-5" /></button></div><div className="mt-4 space-y-2">{(editForm.versionHistory || []).map(version => <div data-testid="quote-history-version" key={version.version} className="border rounded-xl p-3 text-xs"><p className="font-bold">Version {version.version} · {version.status}</p><p>{money(version.totalAmount)} - {money(version.discountAmount)} = {money(version.finalAmount)}</p><p className="text-slate-500">{new Date(version.updatedAt).toLocaleString('en-IN')} · {version.updatedBy}</p></div>)}</div></div></div>}
      </div>
    );
  }

  return <div id="quotes-view" className="space-y-5">
    {toast && <Toast message={toast} />}
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Travel Quotations</h2><p className="text-xs text-slate-500">Create customer proposals from calculated, inventory-linked Trips.</p></div>{canMutate && <button data-testid="new-trip-quote" type="button" onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl bg-[#7056EE] text-white text-xs font-bold"><Plus className="inline w-4 h-4 mr-1" />New Quote from Trip</button>}</div>
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3"><div className="relative flex-1 min-w-56"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search quotes" className="w-full pl-9 p-2 rounded-xl border border-slate-200 text-xs" /></div><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 p-2 text-xs"><option value="ALL">All statuses</option>{['DRAFT','PENDING_APPROVAL','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED'].map(status => <option key={status}>{status}</option>)}</select></div>
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="divide-y divide-slate-100">{filtered.map(quote => <button data-testid={`open-quote-${quote.id}`} key={quote.id} onClick={() => setSelectedQuoteId(quote.id)} className="w-full text-left p-4 hover:bg-slate-50 grid md:grid-cols-[1fr_1fr_auto] gap-2"><div><p className="font-bold text-sm">{quote.customerName}</p><p className="text-[11px] text-slate-500">#{quote.id}{quote.tripId ? ` · Trip ${quote.tripId}` : ' · Legacy/unlinked'}</p></div><div><p className="text-sm font-semibold">{quote.destination}</p><p className="text-xs text-slate-500">Version {quote.version || 1}</p></div><div className="text-right"><p className="font-bold">{money(quote.finalAmount)}</p><p className="text-[10px] font-bold text-purple-700">{quote.status}</p></div></button>)}{filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-400">No Quotes found.</p>}</div></div>

    {showNew && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4"><div className="flex justify-between"><div><h3 className="font-bold">New Quote from Trip</h3><p className="text-xs text-slate-500">Only calculated Trips can enter the commercial Quote workflow.</p></div><button onClick={() => setShowNew(false)}><X className="w-5 h-5" /></button></div><label className="block text-xs font-semibold">Calculated Trip<select data-testid="quote-trip-select" value={newTripId} onChange={event => setNewTripId(event.target.value)} className="mt-1 w-full border rounded-xl p-2"><option value="">Select Trip</option>{costedTrips.map(trip => <option key={trip.id} value={trip.id}>{trip.title} · {trip.destination}</option>)}</select></label>{selectedTrip && <TripSummary trip={selectedTrip} />}<MoneyInput testId="new-quote-selling-price" label="Proposed selling price" value={newSellingPrice} onChange={setNewSellingPrice} /><MoneyInput testId="new-quote-discount" label="Discount" value={newDiscount} onChange={setNewDiscount} /><label className="block text-xs font-semibold">Valid until<input type="date" value={newValidUntil} onChange={event => setNewValidUntil(event.target.value)} className="mt-1 w-full border rounded-xl p-2" /></label><button data-testid="create-trip-quote" type="button" onClick={createFromTrip} disabled={!newTripId} className="w-full p-2 rounded-xl bg-[#7056EE] disabled:bg-slate-300 text-white text-xs font-bold">Create authoritative Quote</button></div></div>}
  </div>;
};

const Toast = ({ message }: { message: string }) => <div className="fixed top-20 right-6 z-[60] rounded-xl bg-slate-950 text-white px-4 py-3 text-xs shadow-xl"><CheckCircle2 className="inline w-4 h-4 text-emerald-400 mr-2" />{message}</div>;

const ServiceSection = ({ title, icon, empty, children }: { title: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) => {
  const values = React.Children.toArray(children);
  return <section className="bg-white rounded-2xl border border-slate-200 p-5"><h3 className="font-bold flex items-center gap-2 mb-3">{icon}{title}</h3>{values.length ? <div className="space-y-3">{children}</div> : <p className="text-xs text-slate-400">{empty}</p>}</section>;
};

const MoneyInput = ({ testId, label, value, onChange, disabled = false }: { testId: string; label: string; value?: number; onChange: (value: number) => void; disabled?: boolean }) => <label className="block text-xs font-semibold text-slate-600">{label}<div className="mt-1 flex items-center rounded-lg border border-slate-200 px-2"><span>₹</span><input data-testid={testId} type="number" min="0" step="1" value={Number(value || 0)} disabled={disabled} onChange={event => onChange(Number(event.target.value))} className="w-full p-2 outline-none disabled:bg-slate-50" /></div></label>;

const Row = ({ label, value, testId, strong = false }: { label: string; value: string; testId?: string; strong?: boolean }) => <div className={`flex justify-between ${strong ? 'font-bold text-sm' : ''}`}><span className="text-slate-500">{label}</span><span data-testid={testId}>{value}</span></div>;

const TripSummary = ({ trip }: { trip: Trip }) => <div className="rounded-xl bg-slate-50 p-3 text-xs"><p className="font-bold">{trip.title}</p><p className="text-slate-500">{trip.startDate} → {trip.endDate} · {trip.travelerCount} travelers</p><p className="mt-1">Authoritative supplier cost: <strong>{money(trip.totalSupplierCost)}</strong></p></div>;

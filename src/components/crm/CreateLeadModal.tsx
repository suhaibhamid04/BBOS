import React, { useEffect, useRef, useState } from 'react';
import { Flame, X } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  normalizeLeadEmail,
  normalizeLeadPhone,
  type DestinationRegion,
  type Customer,
  type Lead,
  type LeadPriority,
  type LeadSourceId,
  type TripType,
} from '../../types';
import { PRESET_USERS } from '../../services/permissions';
import { APP_CONFIG } from '../../config';
import { authenticatedReadHeaders } from '../../services/auth/authenticatedApi';
import { getLeadAssignmentOptions } from '../../services/leads/leadDistributionApi';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (section: any, targetId?: string) => void;
  lead?: Lead;
}

const destinations: DestinationRegion[] = ['Kashmir', 'Jammu', 'Ladakh', 'Himachal', 'Kerala', 'Goa', 'Golden Triangle', 'General', 'Other Domestic'];
const mealPlans = ['', 'EP', 'CP', 'MAP', 'AP'];
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-[#7056EE] focus:outline-none focus:ring-1 focus:ring-[#7056EE]';
const labelClass = 'block space-y-1 font-semibold text-slate-700';

function requestId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({ isOpen, onClose, onNavigate, lead: editingLead }) => {
  const { createLead, updateLead, createOrResumeLeadTrip } = useData();
  const { currentUser } = useAuth();
  const [assigneeOptions, setAssigneeOptions] = useState<Array<{ employeeId: string; name: string; role: string }>>([]);
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(currentUser.employeeId);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [submitError, setSubmitError] = useState('');
  const [creationRequestId, setCreationRequestId] = useState(requestId);

  const [sourceId, setSourceId] = useState<LeadSourceId>('DIRECT_CALL');
  const [sourceReference, setSourceReference] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [whatsAppNumber, setWhatsAppNumber] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('NEW');
  const [customerMatches, setCustomerMatches] = useState<Customer[]>([]);

  const [destination, setDestination] = useState<DestinationRegion>('Kashmir');
  const [travelStartDate, setTravelStartDate] = useState('');
  const [nights, setNights] = useState('');
  const [adults, setAdults] = useState('');
  const [childAges, setChildAges] = useState<number[]>([]);
  const [focCount, setFocCount] = useState('');
  const [budget, setBudget] = useState('');
  const [tripType, setTripType] = useState<TripType | ''>('');
  const [hotelPreference, setHotelPreference] = useState('');
  const [mealPlanPreference, setMealPlanPreference] = useState('');
  const [vehiclePreference, setVehiclePreference] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [priority, setPriority] = useState<LeadPriority>('NORMAL');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSourceId(editingLead?.sourceId || 'DIRECT_CALL');
    setSourceReference(editingLead?.sourceReference || '');
    setCustomerName(editingLead?.customerName || '');
    setCustomerPhone(editingLead?.customerPhone || '');
    setAlternatePhone(editingLead?.alternatePhone || '');
    setWhatsAppNumber(editingLead?.whatsAppNumber || '');
    setCustomerEmail(editingLead?.customerEmail || '');
    setCustomerCity(editingLead?.customerCity || '');
    setSelectedCustomerId(editingLead?.customerId || 'NEW');
    setDestination(editingLead?.destination || 'Kashmir');
    setTravelStartDate(editingLead?.travelStartDate || '');
    setNights(editingLead?.nights === undefined ? '' : String(editingLead.nights));
    setAdults(editingLead?.adults === undefined ? '' : String(editingLead.adults));
    setChildAges([...(editingLead?.childAges || [])]);
    setFocCount(editingLead?.focCount === undefined ? '' : String(editingLead.focCount));
    setBudget(editingLead?.budget === undefined ? '' : String(editingLead.budget));
    setTripType(editingLead?.tripType || '');
    setHotelPreference(editingLead?.hotelPreference || '');
    setMealPlanPreference(editingLead?.mealPlanPreference || '');
    setVehiclePreference(editingLead?.vehiclePreference || editingLead?.transportPreference || '');
    setSpecialRequirements(editingLead?.specialRequirements || '');
    setPriority(editingLead?.priority || 'NORMAL');
    setTags((editingLead?.tags || []).join(', '));
    setNotes(editingLead?.notes || '');
  }, [isOpen, editingLead]);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError('');
    setCreationRequestId(requestId());
    if (editingLead) {
      setAssigneeOptions([]);
      setAssignedEmployeeId(editingLead.assignedEmployeeId || '');
      return;
    }
    if (APP_CONFIG.DEMO_MODE) {
      const demoSales = PRESET_USERS.filter(user => user.active && ['Sales Executive', 'Sales Manager'].includes(user.role) && user.salesTeamId);
      const allowed = currentUser.role === 'Founder' || currentUser.role === 'Admin'
        ? demoSales
        : currentUser.role === 'Sales Manager'
          ? demoSales.filter(user => user.salesTeamId === currentUser.salesTeamId)
          : demoSales.filter(user => user.employeeId === currentUser.employeeId);
      setAssigneeOptions(allowed);
      setAssignedEmployeeId(['Founder', 'Admin'].includes(currentUser.role) ? '' : currentUser.employeeId);
      return;
    }
    if (['Founder', 'Admin', 'Sales Manager'].includes(currentUser.role)) {
      setAssignedEmployeeId(currentUser.role === 'Sales Manager' ? currentUser.employeeId : '');
      void (async () => {
        try {
          const salesEmployees = await getLeadAssignmentOptions(currentUser.employeeId);
          setAssigneeOptions(salesEmployees);
        } catch (error) {
          setAssigneeOptions([]);
          setSubmitError(error instanceof Error ? error.message : 'Sales employees could not be loaded.');
        }
      })();
      return;
    }
    setAssigneeOptions([currentUser]);
    setAssignedEmployeeId(currentUser.employeeId);
  }, [isOpen, currentUser, editingLead]);

  useEffect(() => {
    if (!isOpen) return;
    const phone = normalizeLeadPhone(customerPhone);
    const email = normalizeLeadEmail(customerEmail);
    if (phone.length < 7 && !email) {
      setCustomerMatches([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const params = new URLSearchParams();
          if (phone.length >= 7) params.set('phone', phone);
          if (email) params.set('email', email);
          const response = await fetch(`/api/leads/customer-matches?${params}`, {
            headers: await authenticatedReadHeaders(currentUser.employeeId), signal: controller.signal,
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Customer matching failed.');
          setCustomerMatches(payload.data || []);
        } catch (error) {
          if (!controller.signal.aborted) setSubmitError(error instanceof Error ? error.message : 'Customer matching failed.');
        }
      })();
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [isOpen, customerPhone, customerEmail, currentUser.employeeId]);

  useEffect(() => {
    if (selectedCustomerId !== 'NEW' && !customerMatches.some(customer => customer.id === selectedCustomerId)) setSelectedCustomerId('NEW');
  }, [customerMatches, selectedCustomerId]);

  if (!isOpen) return null;
  const assigneeRequired = currentUser.role === 'Sales Executive' || currentUser.role === 'Sales Manager';

  const setChildrenCount = (count: number) => {
    const bounded = Math.max(0, Math.min(8, count));
    setChildAges(previous => Array.from({ length: bounded }, (_, index) => previous[index] ?? 0));
  };

  const saveLead = async (buildPackage: boolean) => {
    if (savingRef.current) return;
    if (!customerName.trim() || (!customerPhone.trim() && !customerEmail.trim())) {
      setSubmitError('Enter the customer name and at least one contact method.');
      return;
    }
    if (assigneeRequired && !assignedEmployeeId) {
      setSubmitError('Choose an active Sales employee before creating this Lead.');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setSubmitError('');
    try {
      const editablePayload: Record<string, unknown> = {
        sourceId,
        sourceReference: sourceReference.trim() || null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || null,
        alternatePhone: alternatePhone.trim() || null,
        whatsAppNumber: whatsAppNumber.trim() || null,
        customerCity: customerCity.trim() || null,
        destination,
        travelStartDate: travelStartDate || null,
        travelEndDate: travelStartDate && nights ? undefined : null,
        nights: nights ? Number(nights) : null,
        adults: adults ? Number(adults) : null,
        travelerCount: adults ? Number(adults) + childAges.length : null,
        children: childAges.length,
        childAges,
        focCount: focCount ? Number(focCount) : null,
        budget: budget ? Number(budget) : null,
        tripType: tripType || null,
        hotelPreference: hotelPreference.trim() || null,
        mealPlanPreference: mealPlanPreference || null,
        vehiclePreference: vehiclePreference.trim() || null,
        specialRequirements: specialRequirements.trim() || null,
        priority,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        notes: notes.trim(),
      };
      if (editingLead) {
        await updateLead(editingLead.id, editablePayload as Partial<Lead>);
        onClose();
        return;
      }
      const lead = await createLead({
        creationRequestId,
        ...(selectedCustomerId !== 'NEW' ? { customerId: selectedCustomerId } : {}),
        sourceId,
        ...(sourceReference.trim() ? { sourceReference: sourceReference.trim() } : {}),
        customerName: customerName.trim(),
        ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
        ...(alternatePhone.trim() ? { alternatePhone: alternatePhone.trim() } : {}),
        ...(whatsAppNumber.trim() ? { whatsAppNumber: whatsAppNumber.trim() } : {}),
        ...(customerEmail.trim() ? { customerEmail: customerEmail.trim() } : {}),
        ...(customerCity.trim() ? { customerCity: customerCity.trim() } : {}),
        destination,
        ...(travelStartDate ? { travelStartDate } : {}),
        ...(nights ? { nights: Number(nights) } : {}),
        ...(adults ? { adults: Number(adults), travelerCount: Number(adults) + childAges.length } : {}),
        children: childAges.length,
        childAges,
        ...(focCount ? { focCount: Number(focCount) } : {}),
        ...(budget ? { budget: Number(budget) } : {}),
        ...(tripType ? { tripType } : {}),
        ...(hotelPreference.trim() ? { hotelPreference: hotelPreference.trim() } : {}),
        ...(mealPlanPreference ? { mealPlanPreference } : {}),
        ...(vehiclePreference.trim() ? { vehiclePreference: vehiclePreference.trim() } : {}),
        ...(specialRequirements.trim() ? { specialRequirements: specialRequirements.trim() } : {}),
        priority,
        tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
        notes: notes.trim(),
        ...(assignedEmployeeId ? { assignedEmployeeId } : {}),
      });
      if (buildPackage) {
        const trip = await createOrResumeLeadTrip(lead.id, lead);
        onClose();
        onNavigate?.('trips', trip.id);
      } else {
        onClose();
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'The Lead could not be saved.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div id="create-lead-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div id="create-lead-modal" className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-slate-900 p-5 text-white">
          <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0A608] text-slate-950"><Flame className="h-4 w-4" /></div><div><h2 className="font-bold">{editingLead ? 'Edit travel enquiry' : 'New travel enquiry'}</h2><p className="text-xs text-slate-400">{editingLead ? 'Commercial changes require package review before recalculation or sharing.' : 'Capture known details now; optional requirements can be added later.'}</p></div></div>
          <button id="close-create-lead-modal" type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={event => { event.preventDefault(); void saveLead(false); }} className="max-h-[78vh] space-y-6 overflow-y-auto p-6 text-xs">
          <section className="space-y-3">
            <h3 className="font-bold text-slate-900">Source & Assignment</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Lead source<select id="lead-source-platform" data-testid="lead-source" value={sourceId} onChange={event => setSourceId(event.target.value as LeadSourceId)} className={inputClass}>{LEAD_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}</select></label>
              <label className={labelClass}>Source reference<input value={sourceReference} onChange={event => setSourceReference(event.target.value)} placeholder="Campaign, form or referral" className={inputClass} /></label>
              <label className={labelClass}>Assign Lead To<select id="lead-assignee-select" value={assignedEmployeeId} disabled={Boolean(editingLead)} onChange={event => setAssignedEmployeeId(event.target.value)} className={inputClass}>{editingLead && <option value={editingLead.assignedEmployeeId || ''}>{editingLead.assignedEmployeeName || 'Unassigned'}</option>}{!editingLead && !assigneeRequired && <option value="">Auto-distribute</option>}{!editingLead && assigneeRequired && assigneeOptions.length === 0 && <option value="">No active Sales assignee</option>}{!editingLead && assigneeOptions.map(user => <option key={user.employeeId} value={user.employeeId}>{user.name} ({user.role})</option>)}</select></label>
            </div>
            {editingLead && <p className="text-[11px] text-slate-500">Contact corrections update this Lead snapshot. The linked Customer master record is unchanged.</p>}
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="font-bold text-slate-900">Customer</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Customer name *<input id="lead-customer-name" required value={customerName} onChange={event => setCustomerName(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Primary phone<input id="lead-customer-phone" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="Phone or WhatsApp" className={inputClass} /></label>
              <label className={labelClass}>Email<input id="lead-customer-email" type="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Alternate phone<input value={alternatePhone} onChange={event => setAlternatePhone(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>WhatsApp number<input value={whatsAppNumber} onChange={event => setWhatsAppNumber(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>City / location<input value={customerCity} onChange={event => setCustomerCity(event.target.value)} className={inputClass} /></label>
            </div>
            {customerMatches.length > 0 && <div data-testid="customer-match-card" className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="font-bold text-blue-900">Existing customer found</p><p className="mb-2 text-blue-700">Link a known Customer or deliberately create a new Customer for this enquiry.</p><div className="space-y-2">{customerMatches.map(customer => <label key={customer.id} className="flex items-center gap-2"><input type="radio" name="customer-match" checked={selectedCustomerId === customer.id} onChange={() => setSelectedCustomerId(customer.id)} /><span><strong>{customer.name}</strong> · {customer.phone || customer.email} · {customer.city || 'City not recorded'}</span></label>)}<label className="flex items-center gap-2"><input type="radio" name="customer-match" checked={selectedCustomerId === 'NEW'} onChange={() => setSelectedCustomerId('NEW')} /><span>Create new customer; do not merge</span></label></div></div>}
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="font-bold text-slate-900">Travel Requirement</h3>
            <div className="grid gap-3 sm:grid-cols-4">
              <label className={labelClass}>Destination *<select id="lead-destination-select" value={destination} onChange={event => setDestination(event.target.value as DestinationRegion)} className={inputClass}>{destinations.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={labelClass}>Travel start<input id="lead-start-date" type="date" value={travelStartDate} onChange={event => setTravelStartDate(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Nights<input id="lead-nights" type="number" min="1" max="30" value={nights} onChange={event => setNights(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Trip type<select id="lead-trip-type-select" value={tripType} onChange={event => setTripType(event.target.value as TripType | '')} className={inputClass}><option value="">Not known yet</option>{['Honeymoon', 'Family Vacation', 'Adventure & Trekking', 'Luxury Houseboat & Resort', 'Corporate Group', 'Pilgrimage', 'Custom Private Tour'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={labelClass}>Adults<input id="lead-adults" type="number" min="1" max="100" value={adults} onChange={event => setAdults(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Children<input id="lead-children" type="number" min="0" max="8" value={childAges.length} onChange={event => setChildrenCount(Number(event.target.value))} className={inputClass} /></label>
              <label className={labelClass}>FOC count<input type="number" min="0" value={focCount} onChange={event => setFocCount(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Budget (INR)<input id="lead-budget-input" type="number" min="0" value={budget} onChange={event => setBudget(event.target.value)} className={inputClass} /></label>
            </div>
            {childAges.length > 0 && <div data-testid="lead-child-ages" className="grid gap-3 sm:grid-cols-4">{childAges.map((age, index) => <label key={index} className={labelClass}>Child {index + 1} age<input data-testid={`lead-child-age-${index}`} type="number" min="0" max="17" value={age} onChange={event => setChildAges(previous => previous.map((value, itemIndex) => itemIndex === index ? Number(event.target.value) : value))} className={inputClass} /></label>)}</div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Hotel/category preference<input id="lead-hotel-preference" value={hotelPreference} onChange={event => setHotelPreference(event.target.value)} placeholder="3-star, lake-facing, specific hotel…" className={inputClass} /></label>
              <label className={labelClass}>Meal-plan preference<select value={mealPlanPreference} onChange={event => setMealPlanPreference(event.target.value)} className={inputClass}>{mealPlans.map(value => <option key={value} value={value}>{value || 'Not known yet'}</option>)}</select></label>
              <label className={labelClass}>Vehicle/cab preference<input value={vehiclePreference} onChange={event => setVehiclePreference(event.target.value)} placeholder="Private SUV, Tempo Traveller…" className={inputClass} /></label>
            </div>
            <label className={labelClass}>Special travel requirements<textarea rows={2} value={specialRequirements} onChange={event => setSpecialRequirements(event.target.value)} placeholder="Accessibility, dietary, celebration or operational requirements" className={inputClass} /></label>
          </section>

          <section className="space-y-3 border-t border-slate-100 pt-5">
            <h3 className="font-bold text-slate-900">Sales Notes</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>Priority<select id="lead-priority-select" value={priority} onChange={event => setPriority(event.target.value as LeadPriority)} className={inputClass}>{LEAD_PRIORITIES.map(value => <option key={value}>{value}</option>)}</select></label>
              <label className={`${labelClass} sm:col-span-2`}>Tags<input value={tags} onChange={event => setTags(event.target.value)} placeholder="honeymoon, repeat, premium" className={inputClass} /></label>
            </div>
            <label className={labelClass}>Internal sales notes<textarea id="lead-notes-input" rows={3} value={notes} onChange={event => setNotes(event.target.value)} className={inputClass} /></label>
          </section>

          {submitError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-800">{submitError}</div>}
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
            <button id="cancel-create-lead-btn" type="button" onClick={onClose} className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
            <button id={editingLead ? 'submit-edit-lead-btn' : 'submit-create-lead-btn'} data-testid={editingLead ? 'save-lead-edit' : undefined} type="submit" disabled={isSaving || (assigneeRequired && !assignedEmployeeId)} className="rounded-lg border border-[#7056EE] px-5 py-2 font-bold text-[#7056EE] disabled:opacity-50">{isSaving ? 'Saving…' : editingLead ? 'Save changes' : 'Save Lead'}</button>
            {!editingLead && <button id="save-build-package-btn" data-testid="save-build-package" type="button" disabled={isSaving || (assigneeRequired && !assignedEmployeeId)} onClick={() => void saveLead(true)} className="rounded-lg bg-[#7056EE] px-5 py-2 font-bold text-white disabled:opacity-50">{isSaving ? 'Saving…' : 'Save & Build Package'}</button>}
          </div>
        </form>
      </div>
    </div>
  );
};

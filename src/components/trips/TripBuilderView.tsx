import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Trip, ItineraryDay, Hotel, Transport, Activity, ItineraryItem, HotelRoom, Customer } from '../../types';
import {
  Plane,
  Calendar,
  MapPin,
  User,
  Plus,
  Bed,
  Car,
  Compass,
  Trash2,
  ArrowLeft,
  Search,
  CheckCircle2,
  X,
  Users,
  FileText,
  AlertCircle,
  Clock,
  Edit2,
  Check
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { HotelInventoryPicker } from './HotelInventoryPicker';

interface TripBuilderViewProps {
  initialTripId?: string;
  initialLeadId?: string;
  onNavigate?: (section: any, targetId?: string) => void;
}

export const TripBuilderView: React.FC<TripBuilderViewProps> = ({ initialTripId, initialLeadId, onNavigate }) => {
  const {
    trips,
    itineraryDays,
    customers,
    leads,
    packages,
    hotels,
    hotelRooms,
    transports,
    activities,
    createCustomer,
    updateCustomer,
    createTrip,
    updateTrip,
    addItineraryDay,
    updateItineraryDay,
    deleteItineraryDay,
    addItineraryItem,
    deleteItineraryItem,
    createQuote
  } = useData();
  const { currentUser, availableUsers } = useAuth();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(initialTripId || null);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Modals state
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [showHotelModal, setShowHotelModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Form state for New / Edit Trip
  const [tripForm, setTripForm] = useState({
    title: '',
    customerMode: 'EXISTING' as 'EXISTING' | 'NEW',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    leadId: '',
    packageId: '',
    destination: 'Kashmir',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    adults: 2,
    children: 0,
    tripType: 'Honeymoon',
    budget: 85000,
    currency: 'INR',
    assignedSalesEmployeeId: ''
  });
  const [formError, setFormError] = useState('');

  // Selector state for Hotel Modal
  const [selectedHotelId, setSelectedHotelId] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');

  // Selector state for Transport Modal
  const [selectedTransportId, setSelectedTransportId] = useState<string>('');
  const [customPickup, setCustomPickup] = useState('Srinagar Airport');
  const [customDropoff, setCustomDropoff] = useState('Hotel / Sightseeing');

  // Selector state for Activity Modal
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [activityParticipants, setActivityParticipants] = useState(2);

  // Selector state for Custom item
  const [customTitle, setCustomTitle] = useState('');
  const [customType, setCustomType] = useState<'SIGHTSEEING' | 'MEAL' | 'OTHER'>('SIGHTSEEING');
  const [customDesc, setCustomDesc] = useState('');
  const [customCost, setCustomCost] = useState(0);
  const [customPrice, setCustomPrice] = useState(0);

  // Automatically update selectedTripId if initialTripId changes
  useEffect(() => {
    if (initialTripId) {
      setSelectedTripId(initialTripId);
    }
  }, [initialTripId]);

  // Automatically pre-fill from Lead if initialLeadId is provided
  useEffect(() => {
    if (initialLeadId) {
      handleLeadSelect(initialLeadId);
      setIsCreatingTrip(true);
    }
  }, [initialLeadId]);

  // Flash toast helper
  const notify = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 3500);
  };

  const activeTrip = trips.find(t => t.id === selectedTripId);
  const tripDays = activeTrip
    ? itineraryDays.filter(d => d.tripId === activeTrip.id).sort((a, b) => a.dayNumber - b.dayNumber)
    : [];
  const activeDay = tripDays[selectedDayIndex] || tripDays[0];

  const getCustomerName = (id: string) => {
    const cust = customers.find(c => c.id === id);
    if (cust) return cust.name;
    const lead = leads.find(l => l.customerId === id);
    if (lead) return lead.customerName;
    return 'Valued Customer';
  };

  // Safe date formatter
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Pre-fill Form when opening Create Trip
  const openCreateTripModal = () => {
    const defaultCust = customers[0];
    setTripForm({
      title: 'Kashmir Royal Tour & Houseboat Luxury',
      customerMode: 'EXISTING',
      customerId: defaultCust?.id || '',
      customerName: defaultCust?.name || '',
      customerPhone: defaultCust?.phone || '',
      customerEmail: defaultCust?.email || '',
      leadId: '',
      packageId: '',
      destination: 'Kashmir',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      adults: 2,
      children: 0,
      tripType: 'Honeymoon',
      budget: 95000,
      currency: 'INR',
      assignedSalesEmployeeId: currentUser.id
    });
    setFormError('');
    setIsCreatingTrip(true);
  };

  // Pre-fill Form when opening Edit Trip
  const openEditTripModal = (tripToEdit?: Trip) => {
    const target = tripToEdit || activeTrip;
    if (!target) return;

    const cust = customers.find(c => c.id === target.customerId);
    setTripForm({
      title: target.title,
      customerMode: 'EXISTING',
      customerId: target.customerId,
      customerName: cust?.name || '',
      customerPhone: cust?.phone || '',
      customerEmail: cust?.email || '',
      leadId: target.leadId || '',
      packageId: '',
      destination: target.destination,
      startDate: target.startDate,
      endDate: target.endDate,
      adults: target.adults || 2,
      children: target.children || 0,
      tripType: target.tripType || 'Leisure',
      budget: target.budget || target.totalSellingPrice || 85000,
      currency: target.currency || 'INR',
      assignedSalesEmployeeId: target.assignedSalesEmployeeId || currentUser.id
    });
    setFormError('');
    setIsEditingTrip(true);
  };

  // Handle Customer Selection in form
  const handleCustomerSelect = (customerId: string) => {
    if (customerId === '__NEW__') {
      setTripForm(prev => ({
        ...prev,
        customerMode: 'NEW',
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerEmail: ''
      }));
      return;
    }

    const cust = customers.find(c => c.id === customerId);
    if (!cust) return;

    setTripForm(prev => ({
      ...prev,
      customerMode: 'EXISTING',
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone || '',
      customerEmail: cust.email || ''
    }));
  };

  // Pre-fill Form when selecting a Lead
  const handleLeadSelect = (leadId: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    let targetCustId = lead.customerId;
    const existingCust = customers.find(c => c.id === lead.customerId || c.name.toLowerCase() === lead.customerName.toLowerCase());

    setTripForm(prev => ({
      ...prev,
      leadId: lead.id,
      customerId: existingCust ? existingCust.id : (targetCustId || prev.customerId),
      customerName: lead.customerName || prev.customerName,
      customerPhone: lead.customerPhone || prev.customerPhone,
      customerEmail: lead.customerEmail || prev.customerEmail,
      destination: lead.destination || prev.destination,
      title: `${lead.destination} ${lead.tripType || 'Tour'} for ${lead.customerName}`,
      startDate: lead.travelStartDate || prev.startDate,
      endDate: lead.travelEndDate || prev.endDate,
      adults: lead.travelerCount || 2,
      tripType: lead.tripType || 'Leisure',
      budget: lead.budget || 85000
    }));
  };

  // Pre-fill from Package
  const handlePackageSelect = (pkgId: string) => {
    const pkg = packages.find(p => p.id === pkgId);
    if (!pkg) return;
    const start = new Date(tripForm.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + (pkg.durationDays - 1));

    setTripForm(prev => ({
      ...prev,
      packageId: pkg.id,
      destination: prev.leadId ? prev.destination : pkg.destination,
      title: prev.leadId ? prev.title : pkg.title,
      endDate: prev.leadId ? prev.endDate : end.toISOString().split('T')[0],
      budget: prev.leadId ? prev.budget : pkg.basePrice * (prev.adults || 2)
    }));
  };

  // Validate form dates and travelers
  const validateForm = (): boolean => {
    if (!tripForm.title.trim()) {
      setFormError('Trip title is required.');
      return false;
    }

    if (tripForm.customerMode === 'NEW') {
      if (!tripForm.customerName.trim()) {
        setFormError('Please enter the customer full name.');
        return false;
      }
    } else {
      if (!tripForm.customerId && !tripForm.customerName.trim()) {
        setFormError('Please select or specify a customer.');
        return false;
      }
    }

    if (new Date(tripForm.endDate) < new Date(tripForm.startDate)) {
      setFormError('End Date must be on or after Start Date.');
      return false;
    }

    if (Number(tripForm.adults) < 1) {
      setFormError('At least 1 adult traveler is required.');
      return false;
    }

    return true;
  };

  // Resolve Customer Record (Create / Update / Link)
  const resolveCustomer = async (): Promise<string> => {
    // 1. If in NEW mode or customer not yet created
    if (tripForm.customerMode === 'NEW' || !tripForm.customerId) {
      const created = await createCustomer({
        name: tripForm.customerName.trim() || 'New Traveler',
        phone: tripForm.customerPhone.trim() || '+91 99060 00000',
        email: tripForm.customerEmail.trim() || 'guest@bookingbridge.com',
        city: tripForm.destination || 'Srinagar',
        tags: [tripForm.destination, tripForm.tripType],
        notes: `Created during trip planning for "${tripForm.title}"`,
        segment: 'B2C'
      });
      return created.id;
    }

    // 2. If existing customer, update their details if name/phone/email was adjusted in the form
    const existingCust = customers.find(c => c.id === tripForm.customerId);
    if (existingCust) {
      const needsUpdate =
        (tripForm.customerName && tripForm.customerName !== existingCust.name) ||
        (tripForm.customerPhone && tripForm.customerPhone !== existingCust.phone) ||
        (tripForm.customerEmail && tripForm.customerEmail !== existingCust.email);

      if (needsUpdate) {
        await updateCustomer(existingCust.id, {
          name: tripForm.customerName.trim() || existingCust.name,
          phone: tripForm.customerPhone.trim() || existingCust.phone,
          email: tripForm.customerEmail.trim() || existingCust.email
        });
      }
      return existingCust.id;
    }

    return tripForm.customerId;
  };

  // Handle New Trip Submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validateForm()) return;

    try {
      const resolvedCustomerId = await resolveCustomer();

      const created = await createTrip(
        {
          customerId: resolvedCustomerId,
          leadId: tripForm.leadId || undefined,
          title: tripForm.title.trim(),
          destination: tripForm.destination,
          startDate: tripForm.startDate,
          endDate: tripForm.endDate,
          travelerCount: Number(tripForm.adults) + Number(tripForm.children),
          adults: Number(tripForm.adults),
          children: Number(tripForm.children),
          tripType: tripForm.tripType,
          currency: tripForm.currency,
          budget: Number(tripForm.budget),
          totalCost: 0,
          totalSellingPrice: Number(tripForm.budget) || 0,
          assignedSalesEmployeeId: tripForm.assignedSalesEmployeeId || currentUser.id
        },
        undefined,
        tripForm.packageId || undefined
      );

      setIsCreatingTrip(false);
      setSelectedTripId(created.id);
      setSelectedDayIndex(0);
      notify(`Trip "${created.title}" created successfully!`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create trip.');
    }
  };

  // Handle Edit Trip Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!activeTrip) return;
    if (!validateForm()) return;

    try {
      const resolvedCustomerId = await resolveCustomer();

      await updateTrip(activeTrip.id, {
        customerId: resolvedCustomerId,
        leadId: tripForm.leadId || undefined,
        title: tripForm.title.trim(),
        destination: tripForm.destination,
        startDate: tripForm.startDate,
        endDate: tripForm.endDate,
        travelerCount: Number(tripForm.adults) + Number(tripForm.children),
        adults: Number(tripForm.adults),
        children: Number(tripForm.children),
        tripType: tripForm.tripType,
        budget: Number(tripForm.budget),
        assignedSalesEmployeeId: tripForm.assignedSalesEmployeeId || activeTrip.assignedSalesEmployeeId
      });

      setIsEditingTrip(false);
      notify(`Trip details updated and saved!`);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update trip.');
    }
  };

  // Add Day Handler
  const handleAddDay = async () => {
    if (!activeTrip) return;
    try {
      const newDay = await addItineraryDay(activeTrip.id);
      setSelectedDayIndex(tripDays.length);
      notify(`Day ${newDay.dayNumber} added to itinerary.`);
    } catch (err: any) {
      notify(`Error adding day: ${err.message}`);
    }
  };

  // Add Hotel Handler (from HotelInventoryPicker)
  const handleAddHotel = async (metadata: any) => {
    if (!activeDay) return;

    const title = `${metadata.propertyName} - ${metadata.roomCategoryName}`;
    const desc = `${metadata.mealPlan} • ${metadata.nights} Nights (${metadata.adults}A, ${metadata.children}C) • ${metadata.taxDescription}`;

    await addItineraryItem(activeDay.id, {
      type: 'HOTEL',
      title,
      description: desc,
      referenceId: metadata.propertyId,
      supplierCost: undefined, // Authoritative cost calculated securely by backend
      sellingPrice: undefined, // Deferred to package price
      metadata
    });

    setShowHotelModal(false);
    notify(`Added ${metadata.propertyName} to Day ${activeDay.dayNumber}!`);
  };

  // Add Transport Handler
  const handleAddTransport = async () => {
    if (!activeDay) return;
    const transport = transports.find(t => t.id === selectedTransportId) || transports[0];

    const title = `${transport?.vehicleType || 'Innova Crysta AC'} (${customPickup} → ${customDropoff})`;
    const cost = transport?.supplierCost || 3400;
    const price = transport?.sellingPrice || 4800;

    await addItineraryItem(activeDay.id, {
      type: 'TRANSPORT',
      title,
      description: `Chauffeur driven transit: ${customPickup} to ${customDropoff}`,
      referenceId: transport?.id,
      supplierCost: cost,
      sellingPrice: price,
      metadata: { vehicleType: transport?.vehicleType, pickup: customPickup, dropoff: customDropoff }
    });

    setShowTransportModal(false);
    notify(`Added transport to Day ${activeDay.dayNumber}!`);
  };

  // Add Activity Handler
  const handleAddActivity = async () => {
    if (!activeDay || !selectedActivityId) return;
    const activity = activities.find(a => a.id === selectedActivityId);
    if (!activity) return;

    const count = Number(activityParticipants) || 1;
    const cost = (activity.supplierCost || 0) * count;
    const price = (activity.sellingPrice || 0) * count;

    await addItineraryItem(activeDay.id, {
      type: 'ACTIVITY',
      title: `${activity.name} (${count} Pax)`,
      description: activity.description || 'Sightseeing / Adventure experience',
      referenceId: activity.id,
      supplierCost: cost,
      sellingPrice: price,
      metadata: { activityId: activity.id, participants: count }
    });

    setShowActivityModal(false);
    notify(`Added ${activity.name} to Day ${activeDay.dayNumber}!`);
  };

  // Add Custom / Sightseeing Item Handler
  const handleAddCustomItem = async () => {
    if (!activeDay || !customTitle) return;

    await addItineraryItem(activeDay.id, {
      type: customType,
      title: customTitle,
      description: customDesc || 'Custom itinerary point',
      supplierCost: Number(customCost) || 0,
      sellingPrice: Number(customPrice) || 0
    });

    setCustomTitle('');
    setCustomDesc('');
    setCustomCost(0);
    setCustomPrice(0);
    setShowCustomModal(false);
    notify(`Added item to Day ${activeDay.dayNumber}!`);
  };

  // Generate Quote Handler
  const handleGenerateQuote = async () => {
    if (!activeTrip) return;
    try {
      const customer = customers.find(c => c.id === activeTrip.customerId);
      const validUntilDate = new Date();
      validUntilDate.setDate(validUntilDate.getDate() + 7);

      const quoteHotels = tripDays.flatMap(day => 
        (day.items || []).filter(it => it.type === 'HOTEL').map(it => ({
          hotelName: it.title.split(' - ')[0] || 'Hotel',
          roomType: it.metadata?.roomCategoryName || it.title.split(' - ')[1] || 'Room',
          mealPlan: it.metadata?.mealPlan || 'MAP',
          checkInDate: it.metadata?.checkInDate || day.date,
          nights: it.metadata?.nights || 1,
          rate: it.sellingPrice // Pass undefined or number, supplierCost omitted
        }))
      );

      const quote = await createQuote({
        leadId: activeTrip.leadId || `lead-${Date.now()}`,
        customerId: activeTrip.customerId,
        customerName: customer?.name || getCustomerName(activeTrip.customerId),
        destination: activeTrip.destination,
        durationNights: Math.max(1, tripDays.length - 1),
        durationDays: tripDays.length,
        packageId: 'custom-package',
        status: 'DRAFT',
        basePrice: activeTrip.totalSellingPrice || 0,
        discount: 0,
        finalAmount: activeTrip.totalSellingPrice || 0,
        validUntil: validUntilDate.toISOString().split('T')[0],
        hotels: quoteHotels,
        inclusions: [
          `${tripDays.length} Days Handcrafted Kashmiri Itinerary`,
          'Verified Hotel Stays & Houseboat Accommodation',
          'Dedicated Chauffeur Driven Vehicle',
          '24/7 Local Concierge Support'
        ],
        exclusions: ['Personal expenses & tips', 'Airfare unless specified', 'Gondola Phase 2 tickets'],
        termsAndConditions: 'Standard Booking Bridge payment schedule: 30% advance, balance prior to arrival.'
      });

      notify(`Quote generated successfully: ID ${quote.id}`);
      if (onNavigate) {
        setTimeout(() => onNavigate('quotes'), 1200);
      }
    } catch (err: any) {
      notify(`Error creating quote: ${err.message}`);
    }
  };

  // Filtered trips for list view
  const filteredTrips = trips.filter(t => {
    const custName = getCustomerName(t.customerId).toLowerCase();
    const query = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(query) ||
      t.destination.toLowerCase().includes(query) ||
      custName.includes(query)
    );
  });

  // Financial permission guards
  const canSeeSupplierCosts = currentUser.role === 'Founder' || currentUser.role === 'Admin' || currentUser.role === 'Accounts';
  const canSeeMargins = canSeeSupplierCosts || currentUser.role === 'Sales Manager';

  // --------------------------------------------------------------------------
  // RENDER: ACTIVE TRIP BUILDER VIEW
  // --------------------------------------------------------------------------
  if (activeTrip) {
    return (
      <div id="trip-builder-active" className="space-y-4 min-h-[calc(100vh-7.5rem)] flex flex-col">
        {/* Floating status toast */}
        {statusToast && (
          <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusToast}</span>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedTripId(null)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-900"
              title="Return to Trip List"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900 leading-tight">{activeTrip.title}</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  activeTrip.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                  activeTrip.status === 'BOOKED' ? 'bg-purple-100 text-purple-800' :
                  'bg-slate-100 text-slate-700'
                }`}>
                  {activeTrip.status}
                </span>

                <button
                  id="btn-edit-trip-details"
                  onClick={() => openEditTripModal()}
                  className="px-2 py-0.5 text-[11px] font-bold text-[#7056EE] bg-purple-50 hover:bg-purple-100 rounded-md transition-colors flex items-center gap-1 border border-purple-200 shadow-2xs"
                  title="Edit Customer, Dates, Destination or Travelers"
                >
                  <Edit2 className="w-3 h-3" /> Edit Details
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  <User className="w-3.5 h-3.5 text-slate-500" /> {getCustomerName(activeTrip.customerId)}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {activeTrip.destination}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" /> {formatDate(activeTrip.startDate)} - {formatDate(activeTrip.endDate)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-slate-400" /> {activeTrip.adults} Adults {activeTrip.children > 0 ? `+ ${activeTrip.children} Kids` : ''} ({activeTrip.tripType})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                updateTrip(activeTrip.id, { updatedAt: new Date().toISOString() });
                notify('Draft trip saved to local database & memory.');
              }}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              onClick={handleGenerateQuote}
              className="px-4 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <CheckCircle2 className="w-4 h-4" /> Generate Quote
            </button>
          </div>
        </div>

        {/* Real-time Costing Engine Header */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 md:gap-8">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Supplier Cost</p>
              {canSeeSupplierCosts ? (
                <p className="text-lg font-black text-slate-900">₹{activeTrip.totalCost?.toLocaleString('en-IN') || 0}</p>
              ) : (
                <p className="text-xs font-bold text-slate-400 italic py-1">[Protected by RBAC]</p>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Selling Price</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-black text-[#7056EE]">₹{activeTrip.totalSellingPrice?.toLocaleString('en-IN') || 0}</p>
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-[#7056EE] rounded font-bold">INR</span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Gross Profit</p>
              {canSeeMargins ? (
                <p className={`text-lg font-black ${activeTrip.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ₹{activeTrip.grossProfit?.toLocaleString('en-IN') || 0}
                </p>
              ) : (
                <p className="text-xs font-bold text-slate-400 italic py-1">[Restricted]</p>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Gross Margin</p>
              {canSeeMargins ? (
                <p className={`text-lg font-black ${activeTrip.grossMargin >= 25 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {activeTrip.grossMargin || 0}%
                </p>
              ) : (
                <p className="text-xs font-bold text-slate-400 italic py-1">[Restricted]</p>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] font-medium text-slate-500">
              Budget Target: <strong>₹{activeTrip.budget?.toLocaleString('en-IN') || 'Flexible'}</strong>
            </span>
          </div>
        </div>

        {/* Builder Main Work Area */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-[460px]">
          {/* Day Navigator (Sidebar) */}
          <div className="w-full lg:w-64 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Itinerary Days ({tripDays.length})</span>
              </h3>
              <button
                onClick={handleAddDay}
                className="p-1 hover:bg-[#7056EE]/10 rounded-md text-[#7056EE] transition-colors"
                title="Add Next Day"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {tripDays.map((day, idx) => (
                <button
                  key={day.id}
                  onClick={() => setSelectedDayIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedDayIndex === idx
                      ? 'bg-purple-50 border-purple-200 text-purple-900 font-bold border shadow-xs'
                      : 'hover:bg-slate-50 text-slate-600 border border-transparent font-medium'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>Day {day.dayNumber}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{formatDate(day.date)}</span>
                  </div>
                  <p className="text-[11px] font-normal truncate mt-0.5 opacity-80">{day.title || 'Untitled Day'}</p>
                  <div className="flex items-center gap-1.5 mt-1 text-[9px] text-slate-400 font-semibold">
                    <span>{day.items?.length || 0} items</span>
                    <span>•</span>
                    <span className="truncate">{day.location}</span>
                  </div>
                </button>
              ))}

              <button
                onClick={handleAddDay}
                className="w-full py-2.5 px-3 border border-dashed border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:text-[#7056EE] hover:border-[#7056EE] hover:bg-purple-50/50 transition-colors flex items-center justify-center gap-1 mt-2"
              >
                <Plus className="w-3.5 h-3.5" /> Add Day {tripDays.length + 1}
              </button>
            </div>
          </div>

          {/* Active Day Content Area */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            {activeDay ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {/* Day Header Editor */}
                <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 bg-purple-100 text-[#7056EE] text-xs font-bold rounded-md">
                        Day {activeDay.dayNumber}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" /> {formatDate(activeDay.date)}
                      </span>
                    </div>

                    {tripDays.length > 1 && (
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to delete Day ${activeDay.dayNumber}?`)) {
                            deleteItineraryDay(activeDay.id);
                            setSelectedDayIndex(Math.max(0, selectedDayIndex - 1));
                            notify(`Day ${activeDay.dayNumber} deleted.`);
                          }
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors"
                        title="Delete this day"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Day Title</label>
                      <input
                        type="text"
                        value={activeDay.title}
                        onChange={(e) => updateItineraryDay(activeDay.id, { title: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#7056EE]"
                        placeholder="e.g. Arrival & Sunset Shikara Ride"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Location / Hub</label>
                      <input
                        type="text"
                        value={activeDay.location}
                        onChange={(e) => updateItineraryDay(activeDay.id, { location: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-[#7056EE]"
                        placeholder="e.g. Srinagar / Gulmarg"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 1: Accommodation */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Bed className="w-4 h-4 text-emerald-600" /> Accommodation / Stays
                    </h4>
                    <button
                      onClick={() => {
                        setSelectedHotelId(hotels[0]?.id || '');
                        setShowHotelModal(true);
                      }}
                      className="text-xs font-bold text-[#7056EE] hover:text-[#5e43dc] flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Hotel
                    </button>
                  </div>

                  {activeDay.items?.filter(it => it.type === 'HOTEL').length > 0 ? (
                    <div className="space-y-2">
                      {activeDay.items.filter(it => it.type === 'HOTEL').map((item) => (
                        <div key={item.id} className="p-3.5 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:border-emerald-300 transition-colors shadow-2xs">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-900">₹{item.sellingPrice?.toLocaleString('en-IN')}</p>
                              {canSeeSupplierCosts && (
                                <p className="text-[10px] text-slate-400">Cost: ₹{item.supplierCost?.toLocaleString('en-IN')}</p>
                              )}
                            </div>
                            <button
                              onClick={() => deleteItineraryItem(activeDay.id, item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-center">
                      <p className="text-xs text-slate-400 font-medium">No accommodation added for this day</p>
                    </div>
                  )}
                </div>

                {/* Section 2: Transport */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-amber-500" /> Transportation & Logistics
                    </h4>
                    <button
                      onClick={() => {
                        setSelectedTransportId(transports[0]?.id || '');
                        setShowTransportModal(true);
                      }}
                      className="text-xs font-bold text-[#7056EE] hover:text-[#5e43dc] flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Transport
                    </button>
                  </div>

                  {activeDay.items?.filter(it => it.type === 'TRANSPORT').length > 0 ? (
                    <div className="space-y-2">
                      {activeDay.items.filter(it => it.type === 'TRANSPORT').map((item) => (
                        <div key={item.id} className="p-3.5 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:border-amber-300 transition-colors shadow-2xs">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-900">₹{item.sellingPrice?.toLocaleString('en-IN')}</p>
                              {canSeeSupplierCosts && (
                                <p className="text-[10px] text-slate-400">Cost: ₹{item.supplierCost?.toLocaleString('en-IN')}</p>
                              )}
                            </div>
                            <button
                              onClick={() => deleteItineraryItem(activeDay.id, item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-center">
                      <p className="text-xs text-slate-400 font-medium">No transport added for this day</p>
                    </div>
                  )}
                </div>

                {/* Section 3: Activities & Extras */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-[#F0A608]" /> Activities, Sightseeing & Extras
                    </h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedActivityId(activities[0]?.id || '');
                          setShowActivityModal(true);
                        }}
                        className="text-xs font-bold text-[#7056EE] hover:text-[#5e43dc] flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Activity
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        onClick={() => setShowCustomModal(true)}
                        className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Custom Note
                      </button>
                    </div>
                  </div>

                  {activeDay.items?.filter(it => it.type !== 'HOTEL' && it.type !== 'TRANSPORT').length > 0 ? (
                    <div className="space-y-2">
                      {activeDay.items.filter(it => it.type !== 'HOTEL' && it.type !== 'TRANSPORT').map((item) => (
                        <div key={item.id} className="p-3.5 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:border-[#F0A608] transition-colors shadow-2xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 uppercase">
                                {item.type}
                              </span>
                              <p className="text-sm font-bold text-slate-900">{item.title}</p>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs font-bold text-slate-900">₹{item.sellingPrice?.toLocaleString('en-IN')}</p>
                              {canSeeSupplierCosts && item.supplierCost ? (
                                <p className="text-[10px] text-slate-400">Cost: ₹{item.supplierCost?.toLocaleString('en-IN')}</p>
                              ) : null}
                            </div>
                            <button
                              onClick={() => deleteItineraryItem(activeDay.id, item.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-center">
                      <p className="text-xs text-slate-400 font-medium">No activities or custom points added for this day</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                <Calendar className="w-12 h-12 text-slate-300 mb-2" />
                <p className="text-sm font-bold text-slate-700">No days in this trip yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">Click Add Day to start laying out accommodation, transit, and sightseeing.</p>
                <button
                  onClick={handleAddDay}
                  className="mt-4 px-4 py-2 bg-[#7056EE] text-white text-xs font-bold rounded-lg shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5 inline mr-1" /> Add First Day
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MODAL 1: ADD HOTEL */}
        {showHotelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
             <div className="animate-in fade-in zoom-in duration-150 w-full max-w-2xl">
                <HotelInventoryPicker
                  checkInDate={activeDay?.date || new Date().toISOString().split('T')[0]}
                  nights={1} // Defaulting to 1 night for day-based itinerary adding
                  adults={activeTrip?.adults || 2}
                  childrenCount={activeTrip?.children || 0}
                  childrenWithBed={0} // Can be enhanced later to pick exact child ages
                  childrenWithoutBed={activeTrip?.children || 0}
                  onConfirm={handleAddHotel}
                  onCancel={() => setShowHotelModal(false)}
                />
             </div>
          </div>
        )}

        {/* MODAL 2: ADD TRANSPORT */}
        {showTransportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Car className="w-4 h-4 text-amber-500" /> Select Transportation
                </h3>
                <button onClick={() => setShowTransportModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle Tier</label>
                  <select
                    value={selectedTransportId}
                    onChange={(e) => setSelectedTransportId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
                  >
                    {transports.map(t => (
                      <option key={t.id} value={t.id}>{t.vehicleType} — Daily Rate: ₹{t.sellingPrice?.toLocaleString('en-IN')}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Pickup Location</label>
                    <input
                      type="text"
                      value={customPickup}
                      onChange={(e) => setCustomPickup(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      placeholder="e.g. Srinagar Airport"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Drop-off Location</label>
                    <input
                      type="text"
                      value={customDropoff}
                      onChange={(e) => setCustomDropoff(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      placeholder="e.g. Nigeen Lake Houseboat"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddTransport}
                  className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5e43dc] transition-colors shadow-sm"
                >
                  Add Transport to Itinerary
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: ADD ACTIVITY */}
        {showActivityModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#F0A608]" /> Select Activity / Excursion
                </h3>
                <button onClick={() => setShowActivityModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Curated Himalayan Experiences</label>
                  <select
                    value={selectedActivityId}
                    onChange={(e) => setSelectedActivityId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
                  >
                    {activities.map(a => (
                      <option key={a.id} value={a.id}>{a.name} (₹{a.sellingPrice?.toLocaleString('en-IN')})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Participants Count</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={activityParticipants}
                    onChange={(e) => setActivityParticipants(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  onClick={handleAddActivity}
                  className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5e43dc] transition-colors shadow-sm"
                >
                  Add Activity to Day {activeDay.dayNumber}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: CUSTOM ITEM */}
        {showCustomModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900">Add Custom Sightseeing or Note</h3>
                <button onClick={() => setShowCustomModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Item Type</label>
                  <select
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="SIGHTSEEING">Sightseeing Point</option>
                    <option value="MEAL">Dining / Meal Inclusion</option>
                    <option value="OTHER">Custom Operational Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    placeholder="e.g. Mughal Gardens Walk (Nishat & Shalimar)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={customDesc}
                    onChange={(e) => setCustomDesc(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    placeholder="Provide details or instructions for guest / driver..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price (₹)</label>
                    <input
                      type="number"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Supplier Cost (₹)</label>
                    <input
                      type="number"
                      value={customCost}
                      onChange={(e) => setCustomCost(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddCustomItem}
                  className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5e43dc] transition-colors shadow-sm mt-2"
                >
                  Save Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: EDIT TRIP DETAILS */}
        {isEditingTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-150">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-[#7056EE]" />
                  <h3 className="text-base font-bold text-slate-900">Edit Trip Details & Customer</h3>
                </div>
                <button onClick={() => setIsEditingTrip(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Customer selection / Edit */}
                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-800">
                      Customer Assignment & Details <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setTripForm({ ...tripForm, customerMode: 'EXISTING' })}
                        className={`font-semibold px-2 py-0.5 rounded transition-colors ${
                          tripForm.customerMode === 'EXISTING'
                            ? 'bg-[#7056EE] text-white'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Select Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setTripForm({ ...tripForm, customerMode: 'NEW', customerId: '' })}
                        className={`font-semibold px-2 py-0.5 rounded transition-colors ${
                          tripForm.customerMode === 'NEW'
                            ? 'bg-[#7056EE] text-white'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        + Create New Customer
                      </button>
                    </div>
                  </div>

                  {tripForm.customerMode === 'EXISTING' ? (
                    <div>
                      <select
                        value={tripForm.customerId}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE] bg-white font-medium"
                      >
                        <option value="">-- Choose Existing Customer --</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email}) - {c.city}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Customer Name</label>
                      <input
                        type="text"
                        value={tripForm.customerName}
                        onChange={(e) => setTripForm({ ...tripForm, customerName: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        placeholder="Full Name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Phone Number</label>
                      <input
                        type="text"
                        value={tripForm.customerPhone}
                        onChange={(e) => setTripForm({ ...tripForm, customerPhone: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        placeholder="+91 Phone"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Email Address</label>
                      <input
                        type="email"
                        value={tripForm.customerEmail}
                        onChange={(e) => setTripForm({ ...tripForm, customerEmail: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                        placeholder="email@domain.com"
                      />
                    </div>
                  </div>
                </div>

                {/* Title & Destination */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Trip Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={tripForm.title}
                      onChange={(e) => setTripForm({ ...tripForm, title: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Region</label>
                    <select
                      value={tripForm.destination}
                      onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    >
                      <option value="Kashmir">Kashmir</option>
                      <option value="Ladakh">Ladakh</option>
                      <option value="Jammu">Jammu</option>
                      <option value="Himachal">Himachal</option>
                      <option value="Goa">Goa</option>
                      <option value="Kerala">Kerala</option>
                    </select>
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={tripForm.startDate}
                      onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={tripForm.endDate}
                      onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                </div>

                {/* Travelers & Type */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Adults</label>
                    <input
                      type="number"
                      min="1"
                      value={tripForm.adults}
                      onChange={(e) => setTripForm({ ...tripForm, adults: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Children</label>
                    <input
                      type="number"
                      min="0"
                      value={tripForm.children}
                      onChange={(e) => setTripForm({ ...tripForm, children: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Trip Type</label>
                    <select
                      value={tripForm.tripType}
                      onChange={(e) => setTripForm({ ...tripForm, tripType: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    >
                      <option value="Honeymoon">Honeymoon</option>
                      <option value="Family">Family</option>
                      <option value="Adventure">Adventure</option>
                      <option value="Leisure">Leisure</option>
                      <option value="Corporate">Corporate</option>
                      <option value="Pilgrimage">Pilgrimage</option>
                    </select>
                  </div>
                </div>

                {/* Budget & Sales Employee */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Target Budget / Selling Price (₹)</label>
                    <input
                      type="number"
                      value={tripForm.budget}
                      onChange={(e) => setTripForm({ ...tripForm, budget: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Specialist</label>
                    <select
                      value={tripForm.assignedSalesEmployeeId}
                      onChange={(e) => setTripForm({ ...tripForm, assignedSalesEmployeeId: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    >
                      {availableUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5e43dc] transition-colors shadow-sm"
                  >
                    Save Changes & Update Trip
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: TRIPS DIRECTORY LIST VIEW
  // --------------------------------------------------------------------------
  return (
    <div id="trip-builder-list" className="space-y-5">
      {statusToast && (
        <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Trip Builder</h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-[#7056EE]">
              {trips.length} Active Trips
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Create day-by-day customized itineraries, assign hotels and mountain chauffeurs, and calculate gross margins.
          </p>
        </div>

        <button
          id="btn-new-trip"
          onClick={openCreateTripModal}
          className="px-4 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white text-xs font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Trip
        </button>
      </div>

      {/* Directory Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search trips by title, customer, or destination..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-[#7056EE]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Trip Details</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Travel Dates</th>
                <th className="py-3.5 px-4">Costing & Value</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredTrips.map((trip) => {
                const daysCount = itineraryDays.filter(d => d.tripId === trip.id).length;
                return (
                  <tr
                    key={trip.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedTripId(trip.id);
                      setSelectedDayIndex(0);
                    }}
                  >
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{trip.title}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" /> {trip.destination} • {daysCount || 5} Days • {trip.adults} Adults
                      </p>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {getCustomerName(trip.customerId)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">₹{trip.totalSellingPrice?.toLocaleString('en-IN') || 0}</p>
                      {canSeeMargins && trip.grossMargin ? (
                        <p className="text-[10px] text-emerald-600 font-medium">Margin: {trip.grossMargin}%</p>
                      ) : null}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        trip.status === 'DRAFT' ? 'bg-slate-100 text-slate-700' :
                        trip.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                        trip.status === 'BOOKED' ? 'bg-purple-100 text-purple-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {trip.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openEditTripModal(trip)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTripId(trip.id);
                            setSelectedDayIndex(0);
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-[#7056EE] bg-purple-50 hover:bg-purple-100 rounded-md transition-colors"
                        >
                          Open Builder &rarr;
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredTrips.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    No trips found matching your filter. Click "+ New Trip" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE NEW TRIP WORKFLOW MODAL */}
      {isCreatingTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Plane className="w-5 h-5 text-[#7056EE]" />
                <h3 className="text-base font-bold text-slate-900">Create New Custom Trip</h3>
              </div>
              <button onClick={() => setIsCreatingTrip(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Template selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Start from Itinerary Package (Optional)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Pre-loads day structure & highlights</span>
                </label>
                <select
                  value={tripForm.packageId}
                  onChange={(e) => handlePackageSelect(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
                >
                  <option value="">-- Start from Blank Custom Itinerary --</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>{p.title} ({p.durationDays} Days)</option>
                  ))}
                </select>
              </div>

              {/* Customer selection / entry */}
              <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">
                    Customer Assignment & Details <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTripForm({ ...tripForm, customerMode: 'EXISTING' })}
                      className={`font-semibold px-2 py-0.5 rounded transition-colors ${
                        tripForm.customerMode === 'EXISTING'
                          ? 'bg-[#7056EE] text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Select Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setTripForm({ ...tripForm, customerMode: 'NEW', customerId: '' })}
                      className={`font-semibold px-2 py-0.5 rounded transition-colors ${
                        tripForm.customerMode === 'NEW'
                          ? 'bg-[#7056EE] text-white'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      + Create New Customer
                    </button>
                  </div>
                </div>

                {tripForm.customerMode === 'EXISTING' ? (
                  <div>
                    <select
                      value={tripForm.customerId}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE] bg-white font-medium"
                    >
                      <option value="">-- Choose Existing Customer --</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.phone || c.email}) - {c.city}</option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Customer Name</label>
                    <input
                      type="text"
                      value={tripForm.customerName}
                      onChange={(e) => setTripForm({ ...tripForm, customerName: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      placeholder="Full Name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Phone Number</label>
                    <input
                      type="text"
                      value={tripForm.customerPhone}
                      onChange={(e) => setTripForm({ ...tripForm, customerPhone: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      placeholder="+91 Phone"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Email Address</label>
                    <input
                      type="email"
                      value={tripForm.customerEmail}
                      onChange={(e) => setTripForm({ ...tripForm, customerEmail: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      placeholder="email@domain.com"
                    />
                  </div>
                </div>
              </div>

              {/* Lead Link (optional) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link to Active CRM Lead (Optional)
                </label>
                <select
                  value={tripForm.leadId}
                  onChange={(e) => handleLeadSelect(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#7056EE]"
                >
                  <option value="">-- No Direct Lead Link --</option>
                  {leads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.customerName} — {l.destination} ({l.tripType}) [Budget: ₹{l.budget?.toLocaleString('en-IN')}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Title & Destination */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trip Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={tripForm.title}
                    onChange={(e) => setTripForm({ ...tripForm, title: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    placeholder="e.g. Kashmir Royal Honeymoon"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Destination Region</label>
                  <select
                    value={tripForm.destination}
                    onChange={(e) => setTripForm({ ...tripForm, destination: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="Kashmir">Kashmir</option>
                    <option value="Ladakh">Ladakh</option>
                    <option value="Jammu">Jammu</option>
                    <option value="Himachal">Himachal</option>
                    <option value="Goa">Goa</option>
                    <option value="Kerala">Kerala</option>
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={tripForm.startDate}
                    onChange={(e) => setTripForm({ ...tripForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={tripForm.endDate}
                    onChange={(e) => setTripForm({ ...tripForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>
              </div>

              {/* Travelers & Type */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Adults</label>
                  <input
                    type="number"
                    min="1"
                    value={tripForm.adults}
                    onChange={(e) => setTripForm({ ...tripForm, adults: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Children</label>
                  <input
                    type="number"
                    min="0"
                    value={tripForm.children}
                    onChange={(e) => setTripForm({ ...tripForm, children: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Trip Type</label>
                  <select
                    value={tripForm.tripType}
                    onChange={(e) => setTripForm({ ...tripForm, tripType: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    <option value="Honeymoon">Honeymoon</option>
                    <option value="Family">Family</option>
                    <option value="Adventure">Adventure</option>
                    <option value="Leisure">Leisure</option>
                    <option value="Corporate">Corporate</option>
                    <option value="Pilgrimage">Pilgrimage</option>
                  </select>
                </div>
              </div>

              {/* Budget & Sales Specialist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Budget / Value (₹)</label>
                  <input
                    type="number"
                    value={tripForm.budget}
                    onChange={(e) => setTripForm({ ...tripForm, budget: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    placeholder="e.g. 95000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Sales Specialist</label>
                  <select
                    value={tripForm.assignedSalesEmployeeId}
                    onChange={(e) => setTripForm({ ...tripForm, assignedSalesEmployeeId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  >
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5e43dc] transition-colors shadow-sm"
                >
                  Create & Open Trip Builder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

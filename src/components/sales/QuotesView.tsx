import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Quote, QuoteHotelItem, QuoteTransportItem, QuoteActivityItem, QuoteStatus, QuoteVersion } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  Eye,
  Sparkles,
  X,
  ArrowLeft,
  Search,
  User,
  MapPin,
  Calendar,
  Bed,
  Car,
  Compass,
  Check,
  Trash2,
  Edit2,
  AlertCircle,
  Copy,
  Printer,
  Lock,
  ArrowUpRight,
  TrendingUp,
  Tag,
  DollarSign,
  Send,
  HelpCircle,
  BookmarkCheck
} from 'lucide-react';

interface QuotesViewProps {
  initialQuoteId?: string;
  onNavigate?: (section: any, targetId?: string) => void;
}

export const QuotesView: React.FC<QuotesViewProps> = ({ initialQuoteId, onNavigate }) => {
  const {
    quotes,
    trips,
    leads,
    customers,
    createQuote,
    updateQuote,
    convertQuoteToBooking,
    createTrip
  } = useData();
  const { currentUser, availableUsers } = useAuth();

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(initialQuoteId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Modals & Drawers
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isNewQuoteModalOpen, setIsNewQuoteModalOpen] = useState(false);

  // Active Quote Draft Form State
  const activeQuote = quotes.find(q => q.id === selectedQuoteId);
  const [editForm, setEditForm] = useState<Quote | null>(null);

  // Sync edit form when activeQuote changes or is selected
  useEffect(() => {
    if (activeQuote) {
      setEditForm({ ...activeQuote });
    } else {
      setEditForm(null);
    }
  }, [activeQuote, selectedQuoteId]);

  // Handle incoming initialQuoteId prop
  useEffect(() => {
    if (initialQuoteId) {
      setSelectedQuoteId(initialQuoteId);
    }
  }, [initialQuoteId]);

  const notify = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 3500);
  };

  // Financial RBAC Guards
  const canSeeSupplierCosts =
    currentUser.role === 'Founder' || currentUser.role === 'Admin' || currentUser.role === 'Accounts';
  const canSeeMargins = canSeeSupplierCosts || currentUser.role === 'Sales Manager';

  // AI Recommendation State (Review-only)
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      impactType: 'SAVING' | 'UPGRADE' | 'UPSELL' | 'OPTIMIZATION';
      priceDelta: number;
      applied: boolean;
      action: () => void;
    }>
  >([]);

  // Generate AI Suggestions based on active quote
  const runAiQuoteAssistant = (type: 'OPTIMIZE' | 'UPGRADE' | 'SAVINGS' | 'UPSELL') => {
    if (!editForm) return;

    if (type === 'OPTIMIZE') {
      const targetDiscount = Math.round(editForm.totalAmount * 0.05);
      setAiSuggestions([
        {
          id: `ai-opt-${Date.now()}`,
          title: 'Budget Alignment: 5% Direct Booking Incentive',
          description: `Apply ₹${targetDiscount.toLocaleString('en-IN')} seasonal closing discount to reach client budget while preserving a healthy gross margin.`,
          impactType: 'OPTIMIZATION',
          priceDelta: -targetDiscount,
          applied: false,
          action: () => {
            setEditForm(prev => {
              if (!prev) return null;
              const disc = targetDiscount;
              return { ...prev, discountAmount: disc, finalAmount: Math.max(0, prev.totalAmount - disc) };
            });
            notify('Applied 5% optimization discount to quote draft.');
          }
        }
      ]);
    } else if (type === 'UPGRADE') {
      setAiSuggestions([
        {
          id: `ai-upg-${Date.now()}`,
          title: 'Upgrade to Mascot Houseboats Royal Cedar Wood Suite',
          description: 'Upgrade the standard houseboat night to a hand-carved heritage Cedar Suite overlooking Nigeen Lake.',
          impactType: 'UPGRADE',
          priceDelta: 6000,
          applied: false,
          action: () => {
            setEditForm(prev => {
              if (!prev) return null;
              const newHotels = [...(prev.hotels || [])];
              if (newHotels.length > 0) {
                newHotels[0] = { ...newHotels[0], roomType: 'Royal Cedar Wood Heritage Suite', rate: newHotels[0].rate + 6000 };
              }
              const newTotal = prev.totalAmount + 6000;
              return {
                ...prev,
                hotels: newHotels,
                totalAmount: newTotal,
                finalAmount: Math.max(0, newTotal - (prev.discountAmount || 0))
              };
            });
            notify('Upgraded stay category in quote.');
          }
        }
      ]);
    } else if (type === 'SAVINGS') {
      setAiSuggestions([
        {
          id: `ai-sav-${Date.now()}`,
          title: 'Optimize Logistics: Off-peak Transit Route',
          description: 'Group Pahalgam excursion transfers to save ₹3,500 on contracted chauffeur day-rate.',
          impactType: 'SAVING',
          priceDelta: -3500,
          applied: false,
          action: () => {
            setEditForm(prev => {
              if (!prev) return null;
              const newTotal = Math.max(0, prev.totalAmount - 3500);
              return {
                ...prev,
                totalAmount: newTotal,
                finalAmount: Math.max(0, newTotal - (prev.discountAmount || 0))
              };
            });
            notify('Applied logistics savings recommendation.');
          }
        }
      ]);
    } else if (type === 'UPSELL') {
      setAiSuggestions([
        {
          id: `ai-ups-${Date.now()}`,
          title: 'Add-on: VIP Gondola Phase 2 Fast-Track Tickets',
          description: 'Include guaranteed Phase 2 cable car high-altitude tickets + private skiing guide for ₹4,800.',
          impactType: 'UPSELL',
          priceDelta: 4800,
          applied: false,
          action: () => {
            setEditForm(prev => {
              if (!prev) return null;
              const newActivities = [
                ...(prev.activities || []),
                {
                  id: `act-${Date.now()}`,
                  name: 'VIP Gondola Phase 2 Fast-Track + Guide',
                  pax: prev.travelerCount || 2,
                  rate: 4800,
                  supplierCost: 3200
                }
              ];
              const newTotal = prev.totalAmount + 4800;
              return {
                ...prev,
                activities: newActivities,
                totalAmount: newTotal,
                finalAmount: Math.max(0, newTotal - (prev.discountAmount || 0))
              };
            });
            notify('Added VIP Gondola experience to quote.');
          }
        }
      ]);
    }

    setIsAiDrawerOpen(true);
  };

  // Recompute Pricing Engine Totals
  const recalculateTotals = (baseTotal: number, discount: number) => {
    const finalAmt = Math.max(0, baseTotal - discount);
    return {
      totalAmount: baseTotal,
      discountAmount: discount,
      finalAmount: finalAmt
    };
  };

  // Save Changes Handler
  const handleSaveQuote = async (createNewVersion = false) => {
    if (!editForm) return;

    try {
      // Recompute pricing
      const sellingTotal = Number(editForm.totalAmount) || 0;
      const discount = Number(editForm.discountAmount) || 0;
      const finalAmt = Math.max(0, sellingTotal - discount);

      // Use the authoritative totalCost stored in the quote (which came from the Trip)
      // Do NOT recalculate it from missing client-side supplierCost fields
      const totalCost = editForm.totalCost || 0;

      const grossProfit = finalAmt - totalCost;
      const grossMargin = finalAmt > 0 ? Number(((grossProfit / finalAmt) * 100).toFixed(1)) : 0;

      const updated = await updateQuote(
        editForm.id,
        {
          ...editForm,
          totalAmount: sellingTotal,
          discountAmount: discount,
          finalAmount: finalAmt,
          totalCost,
          grossProfit,
          grossMargin,
          salesEmployeeId: editForm.salesEmployeeId || currentUser.id
        },
        createNewVersion
      );

      setEditForm({ ...updated });
      notify(
        createNewVersion
          ? `Saved new Quote Version V${updated.version} successfully!`
          : `Quote #${updated.id} updated and saved.`
      );
    } catch (err: any) {
      notify(`Error saving quote: ${err.message}`);
    }
  };

  // Convert to Booking Handler
  const handleConvertBooking = async () => {
    if (!editForm) return;

    try {
      const booking = await convertQuoteToBooking(editForm.id);
      notify(`Quote converted! Booking Reference: ${booking.bookingReference}`);
      if (onNavigate) {
        setTimeout(() => onNavigate('bookings'), 1200);
      }
    } catch (err: any) {
      notify(`Error converting to booking: ${err.message}`);
    }
  };

  // Add Item Helpers
  const addHotelRow = () => {
    if (!editForm) return;
    const newItem: QuoteHotelItem = {
      id: `h-${Date.now()}`,
      hotelName: 'The Lalit Grand Palace, Srinagar',
      roomType: 'Deluxe Palace Room',
      mealPlan: 'MAP',
      nights: 2,
      rate: 24000,
      supplierCost: 16000
    };
    const newHotels = [...(editForm.hotels || []), newItem];
    const newTotal = editForm.totalAmount + newItem.rate;
    setEditForm({
      ...editForm,
      hotels: newHotels,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  const removeHotelRow = (idx: number) => {
    if (!editForm || !editForm.hotels) return;
    const removed = editForm.hotels[idx];
    const newHotels = editForm.hotels.filter((_, i) => i !== idx);
    const newTotal = Math.max(0, editForm.totalAmount - (removed?.rate || 0));
    setEditForm({
      ...editForm,
      hotels: newHotels,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  const addTransportRow = () => {
    if (!editForm) return;
    const newItem: QuoteTransportItem = {
      id: `t-${Date.now()}`,
      vehicleType: 'Innova Crysta AC Dedicated',
      route: 'Srinagar - Gulmarg - Pahalgam Circuit',
      days: 5,
      rate: 24000,
      supplierCost: 17000
    };
    const newTrans = [...(editForm.transports || []), newItem];
    const newTotal = editForm.totalAmount + newItem.rate;
    setEditForm({
      ...editForm,
      transports: newTrans,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  const removeTransportRow = (idx: number) => {
    if (!editForm || !editForm.transports) return;
    const removed = editForm.transports[idx];
    const newTrans = editForm.transports.filter((_, i) => i !== idx);
    const newTotal = Math.max(0, editForm.totalAmount - (removed?.rate || 0));
    setEditForm({
      ...editForm,
      transports: newTrans,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  const addActivityRow = () => {
    if (!editForm) return;
    const newItem: QuoteActivityItem = {
      id: `a-${Date.now()}`,
      name: 'Gulmarg Gondola Phase 1 & 2 Tickets',
      pax: editForm.travelerCount || 2,
      rate: 4900,
      supplierCost: 3700
    };
    const newActs = [...(editForm.activities || []), newItem];
    const newTotal = editForm.totalAmount + newItem.rate;
    setEditForm({
      ...editForm,
      activities: newActs,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  const removeActivityRow = (idx: number) => {
    if (!editForm || !editForm.activities) return;
    const removed = editForm.activities[idx];
    const newActs = editForm.activities.filter((_, i) => i !== idx);
    const newTotal = Math.max(0, editForm.totalAmount - (removed?.rate || 0));
    setEditForm({
      ...editForm,
      activities: newActs,
      totalAmount: newTotal,
      finalAmount: Math.max(0, newTotal - (editForm.discountAmount || 0))
    });
  };

  // Filtered Quotes for Table
  const filteredQuotes = quotes.filter(q => {
    const matchesSearch =
      q.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.destination.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // --------------------------------------------------------------------------
  // RENDER: ACTIVE QUOTE BUILDER VIEW
  // --------------------------------------------------------------------------
  if (editForm) {
    return (
      <div id="quote-builder-editor" className="space-y-5">
        {/* Floating status toast */}
        {statusToast && (
          <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{statusToast}</span>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedQuoteId(null)}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-900"
              title="Return to Quotes Directory"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 leading-tight">Quote #{editForm.id}</h2>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-purple-100 text-[#7056EE] border border-purple-200">
                  Version {editForm.version || 1}
                </span>

                {/* Status Selector */}
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as QuoteStatus })}
                  className={`text-xs font-bold rounded-lg px-2.5 py-1 border transition-colors ${
                    editForm.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                    editForm.status === 'SENT' ? 'bg-purple-50 text-purple-800 border-purple-300' :
                    editForm.status === 'REJECTED' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                    editForm.status === 'EXPIRED' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                    'bg-slate-100 text-slate-700 border-slate-300'
                  }`}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="SENT">SENT</option>
                  <option value="VIEWED">VIEWED</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>

                {editForm.versionHistory && editForm.versionHistory.length > 0 && (
                  <button
                    onClick={() => setIsVersionHistoryOpen(true)}
                    className="text-xs text-slate-500 hover:text-[#7056EE] font-medium flex items-center gap-1 hover:underline ml-1"
                  >
                    <Clock className="w-3.5 h-3.5" /> History ({editForm.versionHistory.length})
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1 font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                  <User className="w-3.5 h-3.5 text-slate-500" /> {editForm.customerName}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {editForm.destination}
                </span>
                {editForm.tripId && (
                  <span className="flex items-center gap-1 text-[#7056EE] font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Linked to Trip #{editForm.tripId}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* AI Assistant Menu Trigger */}
            <div className="relative">
              <button
                onClick={() => runAiQuoteAssistant('OPTIMIZE')}
                className="px-3.5 py-2 bg-[#F0A608]/10 hover:bg-[#F0A608]/20 text-amber-900 border border-[#F0A608]/30 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F0A608]" /> AI Strategist
              </button>
            </div>

            <button
              onClick={() => setIsPreviewOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <Eye className="w-3.5 h-3.5" /> Customer Preview
            </button>

            <button
              onClick={() => handleSaveQuote(false)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-colors shadow-2xs"
            >
              Save Draft
            </button>

            <button
              onClick={() => handleSaveQuote(true)}
              className="px-3.5 py-2 bg-[#7056EE] hover:bg-[#5b42d6] text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
            >
              <BookmarkCheck className="w-3.5 h-3.5" /> Save as V{(editForm.version || 1) + 1}
            </button>

            {(editForm.status === 'ACCEPTED' || editForm.status === 'SENT') && (
              <button
                onClick={handleConvertBooking}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Convert to Booking
              </button>
            )}
          </div>
        </div>

        {/* Pricing Engine Summary Bar */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-wrap items-center gap-6 sm:gap-8">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Selling Price</p>
              <p className="text-xl font-black text-slate-900">₹{editForm.totalAmount?.toLocaleString('en-IN') || 0}</p>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Discount Amount</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-rose-600">- ₹</span>
                <input
                  type="number"
                  value={editForm.discountAmount || 0}
                  onChange={(e) => {
                    const disc = Number(e.target.value) || 0;
                    setEditForm({
                      ...editForm,
                      discountAmount: disc,
                      finalAmount: Math.max(0, editForm.totalAmount - disc)
                    });
                  }}
                  className="w-24 px-2 py-1 text-sm font-bold text-rose-600 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#7056EE]"
                />
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Final Client Price</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-black text-[#7056EE]">₹{editForm.finalAmount?.toLocaleString('en-IN') || 0}</p>
                <span className="text-[10px] px-2 py-0.5 bg-purple-50 text-[#7056EE] rounded font-bold border border-purple-100">
                  INR
                </span>
              </div>
            </div>

            {/* Financial Protected RBAC Metrics */}
            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Contracted Cost</p>
              {canSeeSupplierCosts ? (
                <p className="text-lg font-black text-slate-700">₹{editForm.totalCost?.toLocaleString('en-IN') || 0}</p>
              ) : (
                <p className="text-xs font-bold text-slate-400 italic py-1">[Protected by RBAC]</p>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 hidden sm:block"></div>

            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Gross Margin</p>
              {canSeeMargins ? (
                <p className={`text-lg font-black ${(editForm.grossMargin || 0) >= 20 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {editForm.grossMargin || 0}%
                </p>
              ) : (
                <p className="text-xs font-bold text-slate-400 italic py-1">[Restricted]</p>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-500 font-medium">
              Valid Until:{' '}
              <input
                type="date"
                value={editForm.validUntil?.split('T')[0] || ''}
                onChange={(e) => setEditForm({ ...editForm, validUntil: e.target.value })}
                className="ml-1 text-xs font-bold text-slate-800 border border-slate-200 rounded-lg px-2 py-1"
              />
            </span>
          </div>
        </div>

        {/* 11 Editable Sections Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT COLUMN: Customer, Trip Summary, Notes & Terms (1 Col) */}
          <div className="space-y-5">
            {/* Section 1: Customer Information */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <User className="w-4 h-4 text-[#7056EE]" /> Customer Details
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Full Name</label>
                  <input
                    type="text"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-semibold text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Phone</label>
                    <input
                      type="text"
                      value={editForm.customerPhone || ''}
                      onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-800"
                      placeholder="+91..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Email</label>
                    <input
                      type="email"
                      value={editForm.customerEmail || ''}
                      onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-800"
                      placeholder="email@..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Trip Summary */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" /> Trip Parameters
              </h3>
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Destination</label>
                    <input
                      type="text"
                      value={editForm.destination}
                      onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg font-medium text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Package Label</label>
                    <input
                      type="text"
                      value={editForm.packageName || ''}
                      onChange={(e) => setEditForm({ ...editForm, packageName: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-900"
                      placeholder="e.g. Kashmir Deluxe Honeymoon"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Duration</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.durationDays || 5}
                      onChange={(e) => setEditForm({ ...editForm, durationDays: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Adults</label>
                    <input
                      type="number"
                      min="1"
                      value={editForm.adults || 2}
                      onChange={(e) => setEditForm({ ...editForm, adults: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Children</label>
                    <input
                      type="number"
                      min="0"
                      value={editForm.children || 0}
                      onChange={(e) => setEditForm({ ...editForm, children: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-900"
                    />
                  </div>
                </div>

                {/* Sales Specialist */}
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Sales Specialist</label>
                  <select
                    value={editForm.salesEmployeeId || currentUser.id}
                    onChange={(e) => setEditForm({ ...editForm, salesEmployeeId: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-800"
                  >
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                {/* Trip Link */}
                {editForm.tripId ? (
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Associated Trip:</span>
                    <button
                      onClick={() => onNavigate && onNavigate('trips', editForm.tripId)}
                      className="text-[#7056EE] font-bold hover:underline flex items-center gap-1"
                    >
                      Open Trip Builder <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      const newTrip = await createTrip({
                        customerId: editForm.customerId,
                        leadId: editForm.leadId,
                        title: `${editForm.destination} Tour for ${editForm.customerName}`,
                        destination: editForm.destination,
                        startDate: new Date().toISOString().split('T')[0],
                        endDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
                        travelerCount: editForm.travelerCount || 2,
                        adults: editForm.adults || 2,
                        children: editForm.children || 0,
                        tripType: 'Leisure',
                        budget: editForm.finalAmount,
                        totalCost: editForm.totalCost || 0,
                        totalSellingPrice: editForm.finalAmount
                      });
                      setEditForm({ ...editForm, tripId: newTrip.id });
                      notify(`Created associated trip #${newTrip.id}!`);
                    }}
                    className="w-full py-2 bg-purple-50 hover:bg-purple-100 text-[#7056EE] text-xs font-bold rounded-lg transition-colors border border-purple-200"
                  >
                    + Generate Trip Itinerary from Quote
                  </button>
                )}
              </div>
            </div>

            {/* Section 3: Notes & Internal Protection */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-500" /> Quotation Notes
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                    Client-Facing Notes (Printed on Proposal)
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    placeholder="e.g. Honeymoon cake & floral decoration included on arrival..."
                  />
                </div>

                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                    <Lock className="w-3.5 h-3.5 text-amber-600" /> Internal Notes (Restricted)
                  </div>
                  <p className="text-[10px] text-amber-700">
                    Strictly masked from customer preview. Visible only to Booking Bridge operations and sales staff.
                  </p>
                  <textarea
                    rows={2}
                    value={editForm.internalNotes || ''}
                    onChange={(e) => setEditForm({ ...editForm, internalNotes: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-amber-200 rounded-lg text-slate-800"
                    placeholder="e.g. Supplier payment negotiated 10% below standard rate card..."
                  />
                </div>
              </div>
            </div>

            {/* Section 4: Terms & Conditions */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-500" /> Terms & Booking Policies
              </h3>
              <textarea
                rows={3}
                value={editForm.termsAndConditions || ''}
                onChange={(e) => setEditForm({ ...editForm, termsAndConditions: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-700"
                placeholder="Payment schedules, cancellation policy, flight delays..."
              />
            </div>
          </div>

          {/* RIGHT COLUMN: Hotels, Transports, Activities, Inclusions & Exclusions (2 Cols) */}
          <div className="lg:col-span-2 space-y-5">
            {/* Section 5: Hotels Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Bed className="w-4 h-4 text-emerald-600" /> Accommodations & Stays ({(editForm.hotels || []).length})
                </h3>
                <button
                  onClick={addHotelRow}
                  className="px-2.5 py-1 text-xs font-bold text-[#7056EE] bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Hotel
                </button>
              </div>

              {(editForm.hotels || []).length > 0 ? (
                <div className="space-y-2.5">
                  {editForm.hotels?.map((h, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          value={h.hotelName}
                          onChange={(e) => {
                            const newH = [...editForm.hotels!];
                            newH[idx].hotelName = e.target.value;
                            setEditForm({ ...editForm, hotels: newH });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-900"
                          placeholder="Hotel Property"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <input
                          type="text"
                          value={h.roomType}
                          onChange={(e) => {
                            const newH = [...editForm.hotels!];
                            newH[idx].roomType = e.target.value;
                            setEditForm({ ...editForm, hotels: newH });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700"
                          placeholder="Room & Meal Plan"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-[10px] text-slate-400 block sm:hidden">Nights</span>
                        <input
                          type="number"
                          min="1"
                          value={h.nights}
                          onChange={(e) => {
                            const newH = [...editForm.hotels!];
                            newH[idx].nights = Number(e.target.value);
                            setEditForm({ ...editForm, hotels: newH });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-center"
                        />
                      </div>
                      <div className="sm:col-span-2 text-right">
                        <input
                          type="number"
                          value={h.rate}
                          onChange={(e) => {
                            const newH = [...editForm.hotels!];
                            newH[idx].rate = Number(e.target.value);
                            setEditForm({ ...editForm, hotels: newH });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-right font-bold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-1 text-right">
                        <button onClick={() => removeHotelRow(idx)} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No hotel stays itemized. Click "+ Add Hotel" to add accommodations.
                </div>
              )}
            </div>

            {/* Section 6: Transportation Breakdown */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Car className="w-4 h-4 text-amber-500" /> Transportation & Chauffeurs ({(editForm.transports || []).length})
                </h3>
                <button
                  onClick={addTransportRow}
                  className="px-2.5 py-1 text-xs font-bold text-[#7056EE] bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Transport
                </button>
              </div>

              {(editForm.transports || []).length > 0 ? (
                <div className="space-y-2.5">
                  {editForm.transports?.map((t, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                      <div className="sm:col-span-5">
                        <input
                          type="text"
                          value={t.vehicleType}
                          onChange={(e) => {
                            const newT = [...editForm.transports!];
                            newT[idx].vehicleType = e.target.value;
                            setEditForm({ ...editForm, transports: newT });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          value={t.route}
                          onChange={(e) => {
                            const newT = [...editForm.transports!];
                            newT[idx].route = e.target.value;
                            setEditForm({ ...editForm, transports: newT });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-slate-700"
                        />
                      </div>
                      <div className="sm:col-span-2 text-right">
                        <input
                          type="number"
                          value={t.rate}
                          onChange={(e) => {
                            const newT = [...editForm.transports!];
                            newT[idx].rate = Number(e.target.value);
                            setEditForm({ ...editForm, transports: newT });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-right font-bold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-1 text-right">
                        <button onClick={() => removeTransportRow(idx)} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No transport itemized. Click "+ Add Transport" to add vehicles.
                </div>
              )}
            </div>

            {/* Section 7: Activities & Experiences */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-[#F0A608]" /> Activities & Sightseeing ({(editForm.activities || []).length})
                </h3>
                <button
                  onClick={addActivityRow}
                  className="px-2.5 py-1 text-xs font-bold text-[#7056EE] bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Activity
                </button>
              </div>

              {(editForm.activities || []).length > 0 ? (
                <div className="space-y-2.5">
                  {editForm.activities?.map((a, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
                      <div className="sm:col-span-7">
                        <input
                          type="text"
                          value={a.name}
                          onChange={(e) => {
                            const newA = [...editForm.activities!];
                            newA[idx].name = e.target.value;
                            setEditForm({ ...editForm, activities: newA });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={a.pax}
                          onChange={(e) => {
                            const newA = [...editForm.activities!];
                            newA[idx].pax = Number(e.target.value);
                            setEditForm({ ...editForm, activities: newA });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-center"
                        />
                      </div>
                      <div className="sm:col-span-2 text-right">
                        <input
                          type="number"
                          value={a.rate}
                          onChange={(e) => {
                            const newA = [...editForm.activities!];
                            newA[idx].rate = Number(e.target.value);
                            setEditForm({ ...editForm, activities: newA });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded-md text-right font-bold text-slate-900"
                        />
                      </div>
                      <div className="sm:col-span-1 text-right">
                        <button onClick={() => removeActivityRow(idx)} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No excursions itemized. Click "+ Add Activity" to add experiences.
                </div>
              )}
            </div>

            {/* Section 8: Inclusions & Exclusions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Inclusions */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-600" /> Package Inclusions
                  </h3>
                  <button
                    onClick={() => {
                      const newInc = [...(editForm.inclusions || []), 'New Inclusion Item'];
                      setEditForm({ ...editForm, inclusions: newInc });
                    }}
                    className="text-[11px] font-bold text-[#7056EE] hover:underline"
                  >
                    + Add Inclusion
                  </button>
                </div>

                <div className="space-y-2">
                  {(editForm.inclusions || []).map((inc, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <input
                        type="text"
                        value={inc}
                        onChange={(e) => {
                          const newInc = [...editForm.inclusions!];
                          newInc[i] = e.target.value;
                          setEditForm({ ...editForm, inclusions: newInc });
                        }}
                        className="flex-1 px-2 py-1 border border-slate-200 rounded-md text-slate-800"
                      />
                      <button
                        onClick={() => {
                          const newInc = editForm.inclusions!.filter((_, idx) => idx !== i);
                          setEditForm({ ...editForm, inclusions: newInc });
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Exclusions */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                    <X className="w-4 h-4 text-rose-600" /> Package Exclusions
                  </h3>
                  <button
                    onClick={() => {
                      const newExc = [...(editForm.exclusions || []), 'New Exclusion Item'];
                      setEditForm({ ...editForm, exclusions: newExc });
                    }}
                    className="text-[11px] font-bold text-[#7056EE] hover:underline"
                  >
                    + Add Exclusion
                  </button>
                </div>

                <div className="space-y-2">
                  {(editForm.exclusions || []).map((exc, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <X className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      <input
                        type="text"
                        value={exc}
                        onChange={(e) => {
                          const newExc = [...editForm.exclusions!];
                          newExc[i] = e.target.value;
                          setEditForm({ ...editForm, exclusions: newExc });
                        }}
                        className="flex-1 px-2 py-1 border border-slate-200 rounded-md text-slate-800"
                      />
                      <button
                        onClick={() => {
                          const newExc = editForm.exclusions!.filter((_, idx) => idx !== i);
                          setEditForm({ ...editForm, exclusions: newExc });
                        }}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI QUOTE STRATEGIST DRAWER (Review-Only) */}
        {isAiDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
            <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#F0A608]" />
                  <h3 className="text-base font-bold text-slate-900">AI Quote Strategist</h3>
                </div>
                <button onClick={() => setIsAiDrawerOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => runAiQuoteAssistant('OPTIMIZE')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-50 text-[#7056EE] hover:bg-purple-100 transition-colors"
                >
                  💡 Budget Optimization
                </button>
                <button
                  onClick={() => runAiQuoteAssistant('UPGRADE')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition-colors"
                >
                  🌟 Room Upgrades
                </button>
                <button
                  onClick={() => runAiQuoteAssistant('SAVINGS')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  ✂️ Cost Savings
                </button>
                <button
                  onClick={() => runAiQuoteAssistant('UPSELL')}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors"
                >
                  📈 High-Margin Upsells
                </button>
              </div>

              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Review Recommendations</h4>
                {aiSuggestions.map((sug) => (
                  <div key={sug.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-[#7056EE]">
                        {sug.impactType}
                      </span>
                      <span className={`text-xs font-bold ${sug.priceDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {sug.priceDelta >= 0 ? `+₹${sug.priceDelta.toLocaleString('en-IN')}` : `-₹${Math.abs(sug.priceDelta).toLocaleString('en-IN')}`}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-900">{sug.title}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{sug.description}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex gap-2">
                      <button
                        onClick={() => {
                          sug.action();
                          setAiSuggestions(prev => prev.filter(x => x.id !== sug.id));
                        }}
                        className="flex-1 py-1.5 bg-[#7056EE] text-white text-xs font-bold rounded-lg hover:bg-[#5b42d6] transition-colors"
                      >
                        Apply to Quote
                      </button>
                      <button
                        onClick={() => setAiSuggestions(prev => prev.filter(x => x.id !== sug.id))}
                        className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}

                {aiSuggestions.length === 0 && (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Select a strategy above to generate review-only recommendations for this quote.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* VERSION HISTORY DRAWER */}
        {isVersionHistoryOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/40 backdrop-blur-xs">
            <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#7056EE]" />
                  <h3 className="text-base font-bold text-slate-900">Version History</h3>
                </div>
                <button onClick={() => setIsVersionHistoryOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-[#7056EE]">Version {editForm.version || 1} (Current Active)</span>
                    <span className="text-[10px] text-slate-400">Now</span>
                  </div>
                  <p className="text-sm font-black text-slate-900">₹{editForm.finalAmount.toLocaleString('en-IN')}</p>
                </div>

                {(editForm.versionHistory || []).map((v, i) => (
                  <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Version {v.version}</span>
                      <span className="text-[10px] text-slate-400">{new Date(v.updatedAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Value: ₹{v.finalAmount.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-slate-400 font-medium">By {v.updatedBy || 'Agent'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CUSTOMER QUOTE PREVIEW (Strictly Omitting Supplier Costs, Margins & Internal Notes) */}
        {isPreviewOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-150">
              {/* Branded Header */}
              <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-[#7056EE] text-white p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#F0A608] flex items-center justify-center font-black text-slate-950 text-base">
                      BB
                    </div>
                    <span className="text-lg font-black tracking-tight">BOOKING BRIDGE</span>
                  </div>
                  <p className="text-xs text-purple-200 font-medium tracking-wide">
                    HIMALAYAN LUXURY & BESPOKE EXPEDITIONS
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-mono text-purple-200">REF: #{editForm.id}</span>
                  <p className="text-[11px] text-slate-300 mt-0.5">Version {editForm.version || 1}</p>
                </div>
              </div>

              {/* Client Destination Banner */}
              <div className="p-6 space-y-5 text-slate-800 text-xs">
                <div className="flex justify-between items-start border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{editForm.packageName || `${editForm.destination} Tour Itinerary`}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Prepared for: <strong>{editForm.customerName}</strong> ({editForm.travelerCount} Travelers)</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400">Offer Valid Until:</span>
                    <p className="text-xs font-bold text-[#7056EE]">{new Date(editForm.validUntil).toLocaleDateString('en-IN')}</p>
                  </div>
                </div>

                {/* Stays & Accommodations */}
                {(editForm.hotels || []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Bed className="w-4 h-4 text-emerald-600" /> Accommodations Included
                    </h4>
                    <div className="space-y-1.5">
                      {editForm.hotels?.map((h, i) => (
                        <div key={i} className="p-2.5 bg-slate-50 rounded-lg flex justify-between items-center">
                          <div>
                            <p className="font-bold text-slate-900">{h.hotelName}</p>
                            <p className="text-[11px] text-slate-500">
                              {h.roomType} • {h.mealPlan}
                              {h.checkInDate && ` • Check-In: ${new Date(h.checkInDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                            </p>
                          </div>
                          <span className="font-semibold text-slate-700">{h.nights} Nights</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transportation */}
                {(editForm.transports || []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-amber-500" /> Dedicated Chauffeur & Logistics
                    </h4>
                    <div className="space-y-1.5">
                      {editForm.transports?.map((t, i) => (
                        <div key={i} className="p-2.5 bg-slate-50 rounded-lg flex justify-between items-center">
                          <div>
                            <p className="font-bold text-slate-900">{t.vehicleType}</p>
                            <p className="text-[11px] text-slate-500">{t.route}</p>
                          </div>
                          <span className="font-semibold text-slate-700">{t.days} Days Service</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Activities */}
                {(editForm.activities || []).length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-[#F0A608]" /> Handpicked Activities & Experiences
                    </h4>
                    <div className="space-y-1.5">
                      {editForm.activities?.map((a, i) => (
                        <div key={i} className="p-2.5 bg-slate-50 rounded-lg flex justify-between items-center">
                          <span className="font-bold text-slate-900">{a.name}</span>
                          <span className="font-semibold text-slate-700">{a.pax} Guests</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Inclusions & Exclusions */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <h5 className="font-bold text-emerald-800 mb-1.5">Inclusions</h5>
                    <ul className="space-y-1 text-[11px] text-slate-600">
                      {editForm.inclusions?.map((inc, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{inc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="font-bold text-rose-800 mb-1.5">Exclusions</h5>
                    <ul className="space-y-1 text-[11px] text-slate-600">
                      {editForm.exclusions?.map((exc, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <X className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                          <span>{exc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Client Notes */}
                {editForm.notes && (
                  <div className="p-3 bg-purple-50/60 border border-purple-200/70 rounded-xl">
                    <p className="font-bold text-slate-900 mb-0.5">Special Arrangements:</p>
                    <p className="text-[11px] text-slate-600">{editForm.notes}</p>
                  </div>
                )}

                {/* Transparent Client Pricing Card */}
                <div className="p-4 bg-slate-950 text-white rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-400">Total All-Inclusive Tour Price</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-2xl font-black text-white">₹{editForm.finalAmount.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#F0A608] text-slate-950 font-bold">ALL TAXES INCL.</span>
                    </div>
                  </div>

                  {editForm.discountAmount > 0 && (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400">Special Promo Savings:</span>
                      <p className="text-sm font-bold text-emerald-400">- ₹{editForm.discountAmount.toLocaleString('en-IN')}</p>
                    </div>
                  )}
                </div>

                {/* Terms */}
                {editForm.termsAndConditions && (
                  <p className="text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-2">
                    {editForm.termsAndConditions}
                  </p>
                )}
              </div>

              {/* Preview Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl font-bold text-xs"
                >
                  Close Preview
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(window.location.href);
                      notify('Shareable client proposal link copied to clipboard!');
                    }}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Link
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b42d6] text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm"
                  >
                    <Printer className="w-3.5 h-3.5" /> Print / Save PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // RENDER: QUOTES DIRECTORY TABLE VIEW
  // --------------------------------------------------------------------------
  return (
    <div id="quotes-view" className="space-y-5">
      {statusToast && (
        <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Travel Quotations</h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-purple-100 text-[#7056EE]">
              {quotes.length} Total Quotes
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Build proposals, manage pricing and discounts, track version history, and convert accepted quotes into bookings.
          </p>
        </div>

        <button
          onClick={() => {
            const firstTrip = trips[0];
            const defaultCust = customers[0];
            createQuote({
              leadId: firstTrip?.leadId || 'lead-new',
              customerId: defaultCust?.id || 'cust-new',
              customerName: defaultCust?.name || 'Valued Guest',
              destination: 'Kashmir',
              tripId: firstTrip?.id,
              travelerCount: 2,
              durationDays: 5,
              durationNights: 4,
              totalAmount: 85000,
              discountAmount: 0,
              finalAmount: 85000,
              status: 'DRAFT',
              validUntil: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
              version: 1,
              hotels: [
                {
                  hotelName: 'The Lalit Grand Palace, Srinagar',
                  roomType: 'Deluxe Palace Room',
                  mealPlan: 'MAP',
                  nights: 2,
                  rate: 24000,
                  supplierCost: 16000
                }
              ],
              transports: [
                {
                  vehicleType: 'Innova Crysta AC Dedicated',
                  route: 'Srinagar - Gulmarg - Pahalgam',
                  days: 5,
                  rate: 24000,
                  supplierCost: 17000
                }
              ],
              activities: [
                {
                  name: 'Gulmarg Gondola Phase 1 & 2',
                  pax: 2,
                  rate: 4900,
                  supplierCost: 3700
                }
              ],
              inclusions: ['4 Nights Luxury Stay', 'Daily Gourmet Breakfast & Dinner', 'Dedicated Vehicle'],
              exclusions: ['Airfare', 'Personal expenses'],
              termsAndConditions: '30% advance to confirm booking.'
            }).then(q => {
              setSelectedQuoteId(q.id);
              notify(`New Quote #${q.id} created.`);
            });
          }}
          className="px-4 py-2 bg-[#7056EE] hover:bg-[#5b42d6] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Quote
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search quotes by recipient, ID, or destination..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-1 focus:ring-[#7056EE]"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {['ALL', 'DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === status
                  ? 'bg-[#7056EE] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Quote ID & Recipient</th>
                <th className="py-3.5 px-4">Destination & Version</th>
                <th className="py-3.5 px-4">Pricing Breakdown</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Validity</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredQuotes.map((q) => (
                <tr
                  key={q.id}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedQuoteId(q.id)}
                >
                  <td className="py-3.5 px-4">
                    <p className="font-bold text-slate-900">{q.customerName}</p>
                    <p className="text-[11px] text-slate-400 font-mono">#{q.id}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-800">{q.destination}</p>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-[#7056EE] border border-purple-100">
                        V{q.version || 1}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                      {q.packageName || `${q.durationDays || 5} Days Tour Package`}
                    </p>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-black text-slate-900 text-sm">₹{q.finalAmount.toLocaleString('en-IN')}</p>
                    {q.discountAmount > 0 && (
                      <p className="text-[10px] text-rose-600 font-semibold">
                        Disc: ₹{q.discountAmount.toLocaleString('en-IN')}
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      q.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-800' :
                      q.status === 'SENT' ? 'bg-purple-100 text-purple-800' :
                      q.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                      q.status === 'EXPIRED' ? 'bg-amber-100 text-amber-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                    {new Date(q.validUntil).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {q.status === 'ACCEPTED' && (
                        <button
                          onClick={async () => {
                            await convertQuoteToBooking(q.id);
                            notify('Converted to confirmed booking!');
                            if (onNavigate) onNavigate('bookings');
                          }}
                          className="px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] font-bold rounded-lg transition-colors border border-emerald-200"
                        >
                          Convert
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedQuoteId(q.id)}
                        className="px-3 py-1 bg-[#7056EE] hover:bg-[#5b42d6] text-white rounded-lg text-[11px] font-bold transition-colors shadow-2xs"
                      >
                        Edit Quote &rarr;
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    No quotes found matching your filter criteria. Click "+ New Quote" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Bed, Car, Check, CheckCircle2, Compass, Copy, Download, Eye, History,
  ExternalLink, Link2, Mail, MessageCircle, Plus, RefreshCw, Search, Send, ShieldCheck, Star, Tag, X,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type {
  CustomerPackageDocument,
  CustomerDeliveryPreparation,
  CustomerQuoteComparison,
  CustomerShareExpiryDays,
  CustomerShareHistoryItem,
  Quote,
  QuoteBackupAccommodation,
  QuoteStatus,
  Trip,
} from '../../types';
import { CustomerPackagePreview } from './CustomerPackagePreview';
import { QuoteComparisonPreview } from './QuoteComparisonPreview';
import { isTripCostingFresh } from '../../utils/costingFreshness';
import { STANDARD_CUSTOMER_POLICY_PRESET } from '../../policies/bookingBridgePolicy';

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
    quotes, trips, itineraryDays, customers, createQuote, updateQuote, convertQuoteToBooking,
    loadTripItinerary, recalculateTripCost, getQuoteBackupAccommodationOptions, getCustomerPackage, shareQuotePackage,
    duplicateQuoteOption, updateQuoteOption, recommendQuoteOption, refreshQuoteOptionFromTrip, reorderQuoteOptions, getQuoteOptionComparison,
    createCustomerShare, listCustomerShares, revokeCustomerShare, downloadCustomerSharePdf, prepareCustomerShareDelivery,
    sendLeadWhatsApp,
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
  const [newOptionLabel, setNewOptionLabel] = useState('Value');
  const [backupOptions, setBackupOptions] = useState<Record<string, QuoteBackupAccommodation[]>>({});
  const [loadingBackupsFor, setLoadingBackupsFor] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [customerPackage, setCustomerPackage] = useState<CustomerPackageDocument | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isUpdatingCosts, setIsUpdatingCosts] = useState(false);
  const [comparison, setComparison] = useState<CustomerQuoteComparison | null>(null);
  const [showDuplicate, setShowDuplicate] = useState(false);
  const [duplicateLabel, setDuplicateLabel] = useState('Recommended');
  const [duplicatePrice, setDuplicatePrice] = useState(0);
  const [shareExpiryDays, setShareExpiryDays] = useState<CustomerShareExpiryDays | null>(14);
  const [shareHistory, setShareHistory] = useState<CustomerShareHistoryItem[]>([]);
  const [shareHistoryLoading, setShareHistoryLoading] = useState(false);
  const [shareActionLoading, setShareActionLoading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [lastShareUrl, setLastShareUrl] = useState('');
  const [lastShareId, setLastShareId] = useState('');
  const [shareUrls, setShareUrls] = useState<Record<string, string>>({});
  const [selectedDeliveryShareId, setSelectedDeliveryShareId] = useState('');
  const [deliveryDraft, setDeliveryDraft] = useState<CustomerDeliveryPreparation | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  const canMutate = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(currentUser.role);
  const canSeeFinancials = ['Founder', 'Admin', 'Sales Manager', 'Sales Executive'].includes(currentUser.role);
  const costedTrips = trips.filter(isTripCostingFresh);
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
    if (!isTripCostingFresh(trip)) return notify('Recalculate Trip costing before creating a Quote.');
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
        inclusions: [...STANDARD_CUSTOMER_POLICY_PRESET.inclusions],
        exclusions: [...STANDARD_CUSTOMER_POLICY_PRESET.exclusions],
        termsAndConditions: STANDARD_CUSTOMER_POLICY_PRESET.termsAndConditions,
        paymentSchedule: STANDARD_CUSTOMER_POLICY_PRESET.paymentSchedule.map(item => ({ ...item })),
        optionLabel: newOptionLabel,
        customerTitle: `${trip.destination} Holiday Package`,
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
      const optionInput = {
        label: editForm.optionLabel,
        customerTitle: editForm.customerTitle,
        totalAmount: Number(editForm.totalAmount),
        discountAmount: Number(editForm.discountAmount),
        validUntil: editForm.validUntil,
        inclusions: editForm.inclusions,
        exclusions: editForm.exclusions,
        termsAndConditions: editForm.termsAndConditions,
        backupAccommodations: editForm.backupAccommodations || [],
      };
      const updated = editForm.optionId
        ? await updateQuoteOption(editForm.id, optionInput)
        : await updateQuote(editForm.id, {
        ...optionInput,
        notes: editForm.notes,
        backupAccommodations: editForm.backupAccommodations || [],
        status: editForm.status,
      }, true);
      setEditForm({ ...updated });
      notify(`Saved Quote version ${updated.version}.`);
    } catch (error: any) {
      notify(error.message || 'Unable to save Quote.');
    }
  };

  const duplicateOption = async () => {
    if (!editForm?.optionId) return;
    try {
      const created = await duplicateQuoteOption(editForm.id, { label: duplicateLabel, totalAmount: duplicatePrice || editForm.totalAmount, validUntil: editForm.validUntil });
      setShowDuplicate(false);
      setSelectedQuoteId(created.id);
      notify(`Created independent option “${created.optionLabel}”.`);
    } catch (error: any) {
      notify(error.message || 'Unable to duplicate option.');
    }
  };

  const recommendOption = async () => {
    if (!editForm?.optionId) return;
    try {
      const updated = await recommendQuoteOption(editForm.id);
      setEditForm(current => current ? { ...current, ...updated } : current);
      notify(`${updated.optionLabel} is now the recommended option.`);
    } catch (error: any) {
      notify(error.message || 'Unable to recommend option.');
    }
  };

  const refreshOption = async () => {
    if (!editForm?.optionId) return;
    try {
      const updated = await refreshQuoteOptionFromTrip(editForm.id);
      setEditForm({ ...updated });
      notify('This option now uses the current reviewed Package; the other options were not changed.');
    } catch (error: any) {
      notify(error.message || 'Unable to refresh this option.');
    }
  };

  const openComparison = async () => {
    if (!editForm?.quoteGroupId) return;
    try {
      setComparison(await getQuoteOptionComparison(editForm.quoteGroupId));
    } catch (error: any) {
      notify(error.message || 'Unable to load customer comparison.');
    }
  };

  const loadCustomerShareHistory = async (groupId = editForm?.quoteGroupId) => {
    if (!groupId) {
      setShareHistory([]);
      return;
    }
    setShareHistoryLoading(true);
    setShareError('');
    try {
      const history = await listCustomerShares(groupId);
      setShareHistory(history);
      setSelectedDeliveryShareId(current => history.some(item => item.shareId === current)
        ? current
        : (history[0]?.shareId || ''));
    } catch (error: any) {
      setShareError(error.message || 'Unable to load customer share history.');
    } finally {
      setShareHistoryLoading(false);
    }
  };

  useEffect(() => {
    setLastShareUrl('');
    setLastShareId('');
    setShareUrls({});
    setSelectedDeliveryShareId('');
    setDeliveryDraft(null);
    if (editForm?.quoteGroupId) void loadCustomerShareHistory(editForm.quoteGroupId);
    else setShareHistory([]);
  }, [editForm?.quoteGroupId]);

  const createSecureCustomerShare = async () => {
    if (!editForm?.quoteGroupId) return;
    setShareActionLoading(true);
    setShareError('');
    try {
      const result = await createCustomerShare(editForm.quoteGroupId, shareExpiryDays);
      const url = new URL(result.publicPath, window.location.origin).toString();
      setLastShareUrl(url);
      setLastShareId(result.share.shareId);
      setShareUrls(previous => ({ ...previous, [result.share.shareId]: url }));
      setSelectedDeliveryShareId(result.share.shareId);
      setShareHistory(previous => [result.share, ...previous.filter(item => item.shareId !== result.share.shareId)]);
      notify('Secure customer link created from the frozen Quote options.');
    } catch (error: any) {
      setShareError(error.message || 'Unable to create customer link.');
    } finally {
      setShareActionLoading(false);
    }
  };

  const copyCustomerShareLink = async () => {
    if (!lastShareUrl) return;
    try {
      await navigator.clipboard.writeText(lastShareUrl);
      notify('Customer link copied.');
    } catch {
      setShareError('Copy was blocked by the browser. Select and copy the link manually.');
    }
  };

  const revokeShare = async (shareId: string) => {
    setShareActionLoading(true);
    setShareError('');
    try {
      const updated = await revokeCustomerShare(shareId);
      setShareHistory(previous => previous.map(item => item.shareId === shareId ? updated : item));
      setShareUrls(previous => {
        const next = { ...previous };
        delete next[shareId];
        return next;
      });
      if (shareId === lastShareId) {
        setLastShareUrl('');
        setLastShareId('');
      }
      setDeliveryDraft(null);
      notify('Customer link revoked immediately.');
    } catch (error: any) {
      setShareError(error.message || 'Unable to revoke customer link.');
    } finally {
      setShareActionLoading(false);
    }
  };

  const selectedDeliveryShare = shareHistory.find(item => item.shareId === selectedDeliveryShareId);
  const selectedDeliveryUrl = selectedDeliveryShareId ? shareUrls[selectedDeliveryShareId] : '';
  const deliveryNeedsFreshLink = Boolean(selectedDeliveryShare && (
    selectedDeliveryShare.status !== 'ACTIVE' || !selectedDeliveryUrl
  ));

  const downloadSharePdf = async () => {
    if (!selectedDeliveryShare) return;
    setDeliveryLoading(true);
    setShareError('');
    try {
      const { blob, filename } = await downloadCustomerSharePdf(selectedDeliveryShare.shareId);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      await loadCustomerShareHistory();
      notify(`Downloaded frozen Quote Group V${selectedDeliveryShare.version} PDF.`);
    } catch (error: any) {
      setShareError(error.message || 'Unable to generate customer PDF.');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const prepareDelivery = async (channel: 'WHATSAPP' | 'EMAIL') => {
    if (!selectedDeliveryShare || !selectedDeliveryUrl) {
      setShareError('Create a fresh customer link before preparing WhatsApp or email delivery.');
      return;
    }
    setDeliveryLoading(true);
    setShareError('');
    try {
      const prepared = await prepareCustomerShareDelivery(selectedDeliveryShare.shareId, channel, selectedDeliveryUrl);
      setDeliveryDraft(prepared);
      await loadCustomerShareHistory();
    } catch (error: any) {
      setShareError(error.message || 'Unable to prepare customer delivery.');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const copyDeliveryMessage = async () => {
    if (!deliveryDraft) return;
    const content = deliveryDraft.channel === 'EMAIL'
      ? `${deliveryDraft.subject || ''}\n\n${deliveryDraft.body}`
      : deliveryDraft.body;
    try {
      await navigator.clipboard.writeText(content);
      notify(`${deliveryDraft.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} content copied.`);
    } catch {
      setShareError('Copy was blocked by the browser. Select and copy the prepared content manually.');
    }
  };

  const sendPreparedWhatsApp = async () => {
    if (!deliveryDraft || deliveryDraft.channel !== 'WHATSAPP' || !editForm?.leadId) return;
    setDeliveryLoading(true);
    setShareError('');
    try {
      const result = await sendLeadWhatsApp(editForm.leadId, {
        idempotencyKey: `share-${deliveryDraft.shareId}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
        messageType: 'TEXT', body: deliveryDraft.body,
      });
      if (result.entry.providerStatus === 'FAILED') throw new Error(result.entry.metadata?.failureMessage || 'WhatsApp provider rejected the package message.');
      notify('Package link accepted by WhatsApp. Delivery updates are available in the Lead Conversation.');
      setDeliveryDraft(null);
    } catch (error: any) {
      setShareError(error.message || 'Unable to send the package link through WhatsApp.');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const deliveryLaunchUrl = deliveryDraft
    ? deliveryDraft.channel === 'WHATSAPP'
      ? `${deliveryDraft.recipient ? `https://wa.me/${deliveryDraft.recipient}` : 'https://api.whatsapp.com/send'}?text=${encodeURIComponent(deliveryDraft.body)}`
      : `mailto:${encodeURIComponent(deliveryDraft.recipient || '')}?subject=${encodeURIComponent(deliveryDraft.subject || '')}&body=${encodeURIComponent(deliveryDraft.body)}`
    : '';

  const moveOption = async (optionId: string, direction: -1 | 1) => {
    if (!editForm?.quoteGroupId) return;
    const ordered = quotes
      .filter(quote => quote.quoteGroupId === editForm.quoteGroupId)
      .sort((left, right) => (left.optionOrder || 0) - (right.optionOrder || 0));
    const index = ordered.findIndex(option => option.optionId === optionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const optionIds = ordered.map(option => option.optionId!);
    [optionIds[index], optionIds[target]] = [optionIds[target], optionIds[index]];
    try {
      await reorderQuoteOptions(editForm.quoteGroupId, optionIds);
      notify('Customer option order updated.');
    } catch (error: any) {
      notify(error.message || 'Unable to reorder package options.');
    }
  };

  const openComparisonOption = async (quoteId: string) => {
    setComparison(null);
    setSelectedQuoteId(quoteId);
    try {
      setCustomerPackage(await getCustomerPackage(quoteId));
    } catch (error: any) {
      notify(error.message || 'Unable to load option package.');
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
    const linkedTrip = editForm.tripId ? trips.find(trip => trip.id === editForm.tripId) : undefined;
    if (linkedTrip && !isTripCostingFresh(linkedTrip)) {
      const message = 'Package pricing needs updating before you can share this Quote.';
      setPackageError(message);
      throw new Error(message);
    }
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

  const updateLinkedTripCosts = async (trip: Trip) => {
    if (trip.packageReview?.required) {
      notify('Apply the latest Lead changes in the Package before updating costs.');
      if (onNavigate) onNavigate('trips', trip.id);
      return;
    }
    setIsUpdatingCosts(true);
    try {
      await recalculateTripCost(trip.id);
      notify('Package costs updated. You can now save a fresh Quote revision.');
    } catch (error: any) {
      notify(error.message || 'We could not update package costs. Review the supplier pricing and try again.');
    } finally {
      setIsUpdatingCosts(false);
    }
  };

  if (editForm) {
    const linkedTrip = editForm.tripId ? trips.find(trip => trip.id === editForm.tripId) : undefined;
    const quoteTripStale = Boolean(!editForm.optionId && linkedTrip && !isTripCostingFresh(linkedTrip));
    const historicalSharedQuote = Boolean(editForm.sharedAt);
    const itineraryReviewRequired = !editForm.optionId && !historicalSharedQuote && Boolean(editForm.tripId && itineraryDays.some(day =>
      day.tripId === editForm.tripId && day.customerContent?.status === 'REVIEW_NEEDED'));
    const packageShareBlocked = quoteTripStale || itineraryReviewRequired;
    const packageShareMessage = quoteTripStale
      ? 'Package pricing needs updating before this Quote can be shared again.'
      : itineraryReviewRequired
        ? 'Review the updated day-wise customer itinerary in Package Builder before sharing.'
        : undefined;
    const quoteFinancialsAreCurrent = !quoteTripStale || historicalSharedQuote;
    const previewFinal = Math.max(0, Number(editForm.totalAmount || 0) - Number(editForm.discountAmount || 0));
    const previewProfit = !quoteFinancialsAreCurrent || editForm.totalSupplierCost === undefined ? undefined : previewFinal - editForm.totalSupplierCost;
    const previewMargin = previewProfit === undefined || previewFinal <= 0 ? undefined : Number(((previewProfit / previewFinal) * 100).toFixed(1));
    const legacy = !editForm.tripId;
    const groupOptions = editForm.quoteGroupId
      ? quotes.filter(quote => quote.quoteGroupId === editForm.quoteGroupId).sort((a, b) => (a.optionOrder || 0) - (b.optionOrder || 0))
      : [];
    return (
      <div id="quote-builder-editor" className="space-y-5">
        {toast && <Toast message={toast} />}
        {customerPackage && <CustomerPackagePreview value={customerPackage} onClose={() => setCustomerPackage(null)} onShare={shareCustomerPackage} isSharing={isSharing} shareDisabled={packageShareBlocked} shareDisabledMessage={packageShareMessage} error={packageError} />}
        {comparison && <QuoteComparisonPreview value={comparison} onClose={() => setComparison(null)} onOpenOption={openComparisonOption} />}
        {deliveryDraft && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"><div data-testid="delivery-draft-modal" className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-[#7056EE]">{deliveryDraft.channel === 'WHATSAPP' ? 'WhatsApp prepared' : 'Email prepared'}</p><h3 className="mt-1 text-lg font-black">Quote Group V{deliveryDraft.version}</h3><p className="mt-1 text-xs text-slate-500">Editable customer-safe copy. BBOS records preparation only, not external delivery.</p></div><button type="button" aria-label="Close delivery draft" onClick={() => setDeliveryDraft(null)}><X className="h-5 w-5" /></button></div><label className="block text-xs font-semibold text-slate-700">{deliveryDraft.channel === 'WHATSAPP' ? 'WhatsApp number' : 'Customer email'}<input data-testid="delivery-recipient" value={deliveryDraft.recipient || ''} onChange={event => setDeliveryDraft(current => current ? { ...current, recipient: event.target.value, recipientAvailable: Boolean(event.target.value.trim()) } : current)} placeholder={deliveryDraft.channel === 'WHATSAPP' ? 'Optional - message can still be copied' : 'Optional - email can still be copied'} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label>{deliveryDraft.channel === 'EMAIL' && <label className="block text-xs font-semibold text-slate-700">Subject<input data-testid="delivery-subject" value={deliveryDraft.subject || ''} onChange={event => setDeliveryDraft(current => current ? { ...current, subject: event.target.value } : current)} className="mt-1 w-full rounded-xl border border-slate-200 p-3" /></label>}<label className="block text-xs font-semibold text-slate-700">Message<textarea data-testid="delivery-message" value={deliveryDraft.body} onChange={event => setDeliveryDraft(current => current ? { ...current, body: event.target.value } : current)} rows={12} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm leading-6" /></label>{!deliveryDraft.recipientAvailable && <p data-testid="delivery-recipient-fallback" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">No valid recipient was found. You can enter one here, copy the prepared message, or open the channel without a preselected recipient.</p>}<div className="flex flex-wrap justify-end gap-2"><button data-testid="copy-delivery-message" type="button" onClick={() => void copyDeliveryMessage()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold"><Copy className="mr-1 inline h-4 w-4" />Copy</button>{deliveryDraft.channel === 'WHATSAPP' && <button data-testid="send-whatsapp-through-bbos" type="button" disabled={deliveryLoading} onClick={() => void sendPreparedWhatsApp()} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Send className="mr-1 inline h-4 w-4" />Send through BBOS</button>}<a data-testid="launch-delivery" href={deliveryLaunchUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-[#7056EE] px-4 py-2.5 text-xs font-bold text-white">{deliveryDraft.channel === 'WHATSAPP' ? 'Open WhatsApp' : 'Open Email App'}</a></div></div></div>}
        {showDuplicate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5"><div className="flex justify-between"><div><h3 className="font-bold">Duplicate package option</h3><p className="text-xs text-slate-500">Services, itinerary and supplier-cost snapshot are copied independently.</p></div><button type="button" onClick={() => setShowDuplicate(false)}><X className="h-5 w-5" /></button></div><label className="block text-xs font-semibold">Customer label<input data-testid="duplicate-option-label" value={duplicateLabel} onChange={event => setDuplicateLabel(event.target.value)} className="mt-1 w-full rounded-xl border p-2" /></label><MoneyInput testId="duplicate-option-price" label="Package selling price" value={duplicatePrice} onChange={setDuplicatePrice} /><button data-testid="confirm-duplicate-option" type="button" onClick={duplicateOption} className="w-full rounded-xl bg-[#7056EE] p-3 text-xs font-bold text-white">Create independent option</button></div></div>}
        {groupOptions.length > 0 && <section data-testid="quote-option-strip" className="rounded-2xl border border-purple-200 bg-purple-50 p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wider text-purple-700">Package options</p><p className="text-xs text-slate-600">One enquiry · independently frozen choices</p></div><button data-testid="open-option-comparison" type="button" onClick={openComparison} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white"><Eye className="mr-1 inline h-4 w-4" />Customer comparison</button></div><div className="flex gap-2 overflow-x-auto pb-1">{groupOptions.map((option, index) => <div key={option.id} className={`min-w-40 rounded-xl border p-3 ${option.id === editForm.id ? 'border-[#7056EE] bg-white ring-2 ring-purple-200' : 'border-purple-100 bg-white/70'}`}><button data-testid={`select-option-${option.optionId}`} type="button" onClick={() => setSelectedQuoteId(option.id)} className="w-full text-left"><span className="text-xs font-black">{option.optionLabel || 'Option'}</span>{option.isRecommended && <Star className="ml-1 inline h-3 w-3 fill-amber-400 text-amber-400" />}<span className="mt-1 block text-xs text-slate-500">{money(option.finalAmount)} · {option.optionStatus || option.status}</span></button>{canMutate && groupOptions.length > 1 && <div className="mt-2 flex gap-1"><button type="button" aria-label={`Move ${option.optionLabel || 'option'} left`} disabled={index === 0} onClick={() => void moveOption(option.optionId!, -1)} className="rounded border px-2 text-xs disabled:opacity-30">←</button><button type="button" aria-label={`Move ${option.optionLabel || 'option'} right`} disabled={index === groupOptions.length - 1} onClick={() => void moveOption(option.optionId!, 1)} className="rounded border px-2 text-xs disabled:opacity-30">→</button></div>}</div>)}</div></section>}
        {canMutate && groupOptions.length > 0 && <section data-testid="customer-share-panel" className="space-y-4 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-[#7056EE]"><Link2 className="mr-1 inline h-4 w-4" />Share with Customer</p><h2 className="mt-1 text-lg font-black">Secure Quote Group link</h2><p className="mt-1 text-xs text-slate-500">Shares the exact frozen Value, Recommended, and Premium options. Later Package edits cannot change an existing link.</p></div><div className="flex flex-wrap items-end gap-2"><label className="text-xs font-semibold text-slate-600">Link expiry<select data-testid="customer-share-expiry" value={shareExpiryDays ?? 'NONE'} onChange={event => setShareExpiryDays(event.target.value === 'NONE' ? null : Number(event.target.value) as CustomerShareExpiryDays)} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="NONE">No expiry</option></select></label><button data-testid="create-customer-share" type="button" disabled={shareActionLoading} onClick={createSecureCustomerShare} className="rounded-xl bg-[#7056EE] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{shareActionLoading ? 'Creating…' : 'Create Customer Link'}</button></div></div>
          {shareError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{shareError}</div>}
          {lastShareUrl && <div data-testid="customer-share-ready" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-black text-emerald-900">Customer link ready</p><input aria-label="Customer share URL" readOnly value={lastShareUrl} className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs" /><div className="mt-3 flex flex-wrap gap-2"><button data-testid="copy-customer-share" type="button" onClick={copyCustomerShareLink} className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900"><Copy className="mr-1 inline h-4 w-4" />Copy Link</button><a data-testid="open-customer-share" href={lastShareUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white"><ExternalLink className="mr-1 inline h-4 w-4" />Open Preview</a>{lastShareId && <button type="button" onClick={() => void revokeShare(lastShareId)} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700">Revoke Link</button>}</div></div>}
          <div><div className="mb-2 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wider text-slate-500">Customer shares</p><button data-testid="refresh-share-history" type="button" onClick={() => void loadCustomerShareHistory()} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold"><RefreshCw className="mr-1 inline h-3 w-3" />Refresh</button></div>{shareHistoryLoading ? <p className="text-xs text-slate-500">Loading share history…</p> : shareHistory.length === 0 ? <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No customer links created yet.</p> : <div data-testid="customer-share-history" className="space-y-2">{shareHistory.map(share => <div key={share.shareId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-bold">Quote Group V{share.version} · {share.status}</p><p className="text-xs text-slate-500">{new Date(share.createdAt).toLocaleString('en-IN')} · Shared by {share.createdByName}</p><p className="text-xs text-slate-500">Viewed {share.viewCount} time{share.viewCount === 1 ? '' : 's'}{share.lastViewedAt ? ` · Last opened ${new Date(share.lastViewedAt).toLocaleString('en-IN')}` : ''}{share.expiresAt ? ` · Expires ${new Date(share.expiresAt).toLocaleString('en-IN')}` : ' · No expiry'}</p></div>{share.status === 'ACTIVE' && <button data-testid={`revoke-share-${share.shareId}`} type="button" disabled={shareActionLoading} onClick={() => void revokeShare(share.shareId)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50">Revoke</button>}</div>)}</div>}</div>
        </section>}
        {canMutate && groupOptions.length > 0 && <section data-testid="customer-delivery-panel" className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-[#7056EE]">Customer delivery</p><h2 className="mt-1 text-lg font-black">One frozen version, multiple channels</h2><p className="mt-1 text-xs text-slate-500">PDF, WhatsApp and email all use the selected immutable customer share.</p></div>{shareHistory.length > 0 && <label className="text-xs font-semibold text-slate-600">Delivery version<select data-testid="delivery-share-version" value={selectedDeliveryShareId} onChange={event => { setSelectedDeliveryShareId(event.target.value); setDeliveryDraft(null); }} className="mt-1 block min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2">{shareHistory.map((share, index) => <option key={share.shareId} value={share.shareId}>{index === 0 ? 'Current' : 'Historical'} Quote V{share.version} - {share.status}</option>)}</select></label>}</div>{selectedDeliveryShare ? <><div data-testid="selected-delivery-version" className={`rounded-xl border p-3 text-xs font-semibold ${selectedDeliveryShare.status === 'ACTIVE' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{shareHistory[0]?.shareId === selectedDeliveryShare.shareId ? 'Current' : 'Historical'} Quote V{selectedDeliveryShare.version} · {selectedDeliveryShare.status} · Created {new Date(selectedDeliveryShare.createdAt).toLocaleDateString('en-IN')}{selectedDeliveryShare.status !== 'ACTIVE' ? ' · Digital delivery requires a fresh active link.' : !selectedDeliveryUrl ? ' · Create a fresh link to prepare WhatsApp or email.' : ''}</div><div className="grid gap-3 sm:grid-cols-3"><button data-testid="download-share-pdf" type="button" disabled={deliveryLoading} onClick={() => void downloadSharePdf()} className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-left disabled:opacity-50"><Download className="mb-2 h-5 w-5 text-violet-700" /><span className="block text-sm font-black">Download PDF</span><span className="mt-1 block text-xs text-slate-500">Exact frozen Quote V{selectedDeliveryShare.version}</span></button><button data-testid="prepare-whatsapp" type="button" disabled={deliveryLoading || deliveryNeedsFreshLink} onClick={() => void prepareDelivery('WHATSAPP')} className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left disabled:cursor-not-allowed disabled:opacity-45"><MessageCircle className="mb-2 h-5 w-5 text-emerald-700" /><span className="block text-sm font-black">Share on WhatsApp</span><span className="mt-1 block text-xs text-slate-500">Prepare editable message and secure link</span></button><button data-testid="prepare-email" type="button" disabled={deliveryLoading || deliveryNeedsFreshLink} onClick={() => void prepareDelivery('EMAIL')} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-left disabled:cursor-not-allowed disabled:opacity-45"><Mail className="mb-2 h-5 w-5 text-blue-700" /><span className="block text-sm font-black">Prepare Email</span><span className="mt-1 block text-xs text-slate-500">Editable mailto subject, body and link</span></button></div>{deliveryNeedsFreshLink && <p data-testid="delivery-fresh-link-required" className="text-xs font-semibold text-amber-800">Create Customer Link above before preparing WhatsApp or email. Historical PDF remains available and stays version-specific.</p>}<p className="text-[11px] text-slate-500">Prepared: PDF {selectedDeliveryShare.pdfGeneratedCount || 0} · WhatsApp {selectedDeliveryShare.whatsappPreparedCount || 0} · Email {selectedDeliveryShare.emailPreparedCount || 0}. External sent/read status is not claimed.</p></> : <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600">Create a secure customer link first. Delivery always starts from an immutable CustomerShare snapshot.</p>}</section>}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSelectedQuoteId(null)} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Back to Quotes"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-900">{editForm.optionLabel ? `${editForm.optionLabel} Option` : `Quote #${editForm.id}`}</h2>
                <span data-testid="quote-version" className="text-xs font-bold px-2 py-1 rounded bg-purple-100 text-purple-700">V{editForm.version || 1}</span>
                {legacy && <span className="text-[10px] font-bold px-2 py-1 rounded bg-amber-100 text-amber-800">LEGACY / UNLINKED</span>}
              </div>
              <p className="text-xs text-slate-500">{editForm.customerName} · {editForm.destination}{editForm.tripId ? ` · Trip ${editForm.tripId}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {editForm.leadId && onNavigate && <button data-testid="quote-return-to-lead" type="button" onClick={() => onNavigate('lead-detail', editForm.leadId)} className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white">Return to Lead</button>}
            {(editForm.versionHistory?.length || 0) > 0 && <button type="button" onClick={() => setShowHistory(true)} className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100"><History className="inline w-4 h-4 mr-1" />History</button>}
            {canMutate && editForm.optionId && <button data-testid="duplicate-quote-option" type="button" onClick={() => { setDuplicateLabel(`Copy of ${editForm.optionLabel || 'Option'}`); setDuplicatePrice(editForm.totalAmount); setShowDuplicate(true); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><Copy className="mr-1 inline h-4 w-4" />Duplicate</button>}
            {canMutate && editForm.optionId && !editForm.isRecommended && <button data-testid="recommend-quote-option" type="button" onClick={recommendOption} className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><Star className="mr-1 inline h-4 w-4" />Recommend</button>}
            {canMutate && editForm.optionId && <button data-testid="refresh-quote-option" type="button" onClick={refreshOption} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold">Use current Package</button>}
            <button data-testid="open-customer-package" type="button" disabled={quoteTripStale && !historicalSharedQuote} onClick={openCustomerPackage} className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white disabled:cursor-not-allowed disabled:opacity-50"><Eye className="inline w-4 h-4 mr-1" />Customer Package</button>
            {canMutate && <button data-testid="save-quote" type="button" disabled={quoteTripStale} onClick={saveQuote} className="px-4 py-2 text-xs font-bold rounded-xl bg-[#7056EE] text-white disabled:cursor-not-allowed disabled:bg-slate-300">Save revision</button>}
            {canMutate && editForm.status === 'SENT' && <button data-testid="convert-quote" type="button" onClick={convert} className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white"><Check className="inline w-4 h-4 mr-1" />Convert</button>}
          </div>
        </div>

        {editForm.requiresLowMarginApproval && editForm.approval?.state === 'APPROVED' && <div data-testid="quote-low-margin-approved" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Commercial exception approved{editForm.approval.currentDecision?.reviewerName ? ` by ${editForm.approval.currentDecision.reviewerName}` : ''}. Sharing is available while these economics remain unchanged.</div>}
        {editForm.requiresLowMarginApproval && editForm.approval?.state === 'REJECTED' && <div data-testid="quote-low-margin-rejected" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">Commercial approval was not granted. Adjust package pricing and resubmit for approval.{editForm.approval.currentDecision?.note ? ` ${editForm.approval.currentDecision.note}` : ''}</div>}
        {editForm.requiresLowMarginApproval && !['APPROVED', 'REJECTED'].includes(editForm.approval?.state || '') && <div data-testid="quote-low-margin-review-required" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Commercial approval required. Waiting for Sales Manager approval before this Quote can be shared.</div>}
        {editForm.sharedAt && <div data-testid="quote-share-status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">Shared via {editForm.shareChannel || 'DOCUMENT'} on {new Date(editForm.sharedAt).toLocaleString('en-IN')} by {editForm.sharedByEmployeeId}.</div>}
        {quoteTripStale && linkedTrip && <div data-testid="quote-costing-warning" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-black">Package pricing needs updating before you can share this Quote.</p><p className="mt-1 text-xs">{historicalSharedQuote ? 'This previously shared Quote remains available as a historical snapshot. A new revision requires current costs.' : 'Supplier cost, profit, and margin are not current.'}</p></div><button data-testid="quote-update-costs" type="button" disabled={isUpdatingCosts} onClick={() => void updateLinkedTripCosts(linkedTrip)} className="rounded-lg bg-amber-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isUpdatingCosts ? 'Updating…' : linkedTrip.packageReview?.required ? 'Review Package' : 'Update Costs'}</button></div></div>}

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
            {editForm.optionId && <><label className="block text-xs font-semibold text-slate-600">Option label<input data-testid="quote-option-label" value={editForm.optionLabel || ''} disabled={!canMutate} onChange={event => setEditForm({ ...editForm, optionLabel: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label><label className="block text-xs font-semibold text-slate-600">Customer title<input data-testid="quote-option-title" value={editForm.customerTitle || ''} disabled={!canMutate} onChange={event => setEditForm({ ...editForm, customerTitle: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label></>}
            <MoneyInput testId="quote-selling-price" label="Proposed selling price" value={editForm.totalAmount} disabled={!canMutate} onChange={value => setEditForm({ ...editForm, totalAmount: value })} />
            <MoneyInput testId="quote-discount" label="Discount" value={editForm.discountAmount} disabled={!canMutate} onChange={value => setEditForm({ ...editForm, discountAmount: value })} />
            <label className="block text-xs font-semibold text-slate-600">Valid until<input data-testid="quote-valid-until" type="date" value={editForm.validUntil} disabled={!canMutate} onChange={event => setEditForm({ ...editForm, validUntil: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 p-2" /></label>
            <div className="border-t border-slate-200 pt-3 space-y-2 text-xs">
              {canSeeFinancials && <Row label={quoteTripStale && historicalSharedQuote ? 'Historical supplier cost' : 'Supplier cost'} value={!quoteFinancialsAreCurrent ? 'Needs update' : editForm.totalSupplierCost === undefined ? 'Pending' : money(editForm.totalSupplierCost)} testId="quote-supplier-cost" />}
              <Row label="Selling price" value={money(editForm.totalAmount)} />
              <Row label="Discount" value={`-${money(editForm.discountAmount)}`} />
              <Row label="Final selling price" value={money(previewFinal)} testId="quote-final-price" strong />
              {canSeeFinancials && <Row label={quoteTripStale && historicalSharedQuote ? 'Historical profit' : 'Profit'} value={previewProfit === undefined ? '—' : money(previewProfit)} testId="quote-profit" />}
              {canSeeFinancials && <Row label={quoteTripStale && historicalSharedQuote ? 'Historical margin' : 'Margin'} value={previewMargin === undefined ? '—' : `${previewMargin}%`} testId="quote-margin" />}
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
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">Travel Quotations</h2><p className="text-xs text-slate-500">Create customer proposals from calculated, inventory-linked Trips.</p></div>{canMutate && <button data-testid="new-trip-quote" type="button" onClick={() => setShowNew(true)} className="px-4 py-2 rounded-xl bg-[#7056EE] text-white text-xs font-bold"><Plus className="inline w-4 h-4 mr-1" />Create Option</button>}</div>
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3"><div className="relative flex-1 min-w-56"><Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search quotes" className="w-full pl-9 p-2 rounded-xl border border-slate-200 text-xs" /></div><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 p-2 text-xs"><option value="ALL">All statuses</option>{['DRAFT','PENDING_APPROVAL','SENT','VIEWED','ACCEPTED','REJECTED','EXPIRED'].map(status => <option key={status}>{status}</option>)}</select></div>
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden"><div className="divide-y divide-slate-100">{filtered.map(quote => <button data-testid={`open-quote-${quote.id}`} key={quote.id} onClick={() => setSelectedQuoteId(quote.id)} className="w-full text-left p-4 hover:bg-slate-50 grid md:grid-cols-[1fr_1fr_auto] gap-2"><div><p className="font-bold text-sm">{quote.customerName}</p><p className="text-[11px] text-slate-500">#{quote.id}{quote.tripId ? ` · Trip ${quote.tripId}` : ' · Legacy/unlinked'}</p></div><div><p className="text-sm font-semibold">{quote.destination}</p><p className="text-xs text-slate-500">Version {quote.version || 1}</p></div><div className="text-right"><p className="font-bold">{money(quote.finalAmount)}</p><p className="text-[10px] font-bold text-purple-700">{quote.status}</p></div></button>)}{filtered.length === 0 && <p className="p-10 text-center text-sm text-slate-400">No Quotes found.</p>}</div></div>

    {showNew && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white rounded-2xl p-5 max-w-lg w-full space-y-4"><div className="flex justify-between"><div><h3 className="font-bold">Create package option</h3><p className="text-xs text-slate-500">Only calculated Trips can enter the commercial Quote workflow.</p></div><button onClick={() => setShowNew(false)}><X className="w-5 h-5" /></button></div><label className="block text-xs font-semibold">Option label<input data-testid="new-option-label" value={newOptionLabel} onChange={event => setNewOptionLabel(event.target.value)} placeholder="Value, Recommended, Premium…" className="mt-1 w-full border rounded-xl p-2" /></label><label className="block text-xs font-semibold">Calculated Trip<select data-testid="quote-trip-select" value={newTripId} onChange={event => setNewTripId(event.target.value)} className="mt-1 w-full border rounded-xl p-2"><option value="">Select Trip</option>{costedTrips.map(trip => <option key={trip.id} value={trip.id}>{trip.title} · {trip.destination}</option>)}</select></label>{selectedTrip && <TripSummary trip={selectedTrip} />}<MoneyInput testId="new-quote-selling-price" label="Proposed selling price" value={newSellingPrice} onChange={setNewSellingPrice} /><MoneyInput testId="new-quote-discount" label="Discount" value={newDiscount} onChange={setNewDiscount} /><label className="block text-xs font-semibold">Valid until<input type="date" value={newValidUntil} onChange={event => setNewValidUntil(event.target.value)} className="mt-1 w-full border rounded-xl p-2" /></label><button data-testid="create-trip-quote" type="button" onClick={createFromTrip} disabled={!newTripId || !newOptionLabel.trim()} className="w-full p-2 rounded-xl bg-[#7056EE] disabled:bg-slate-300 text-white text-xs font-bold">Create independent option</button></div></div>}
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

import React, { useState, useEffect, useCallback } from 'react';
import { BookingDetailResponse } from '../../types/bookingApi';
import { useAuth } from '../../context/AuthContext';
import {
  FileText, MapPin, Calendar, CreditCard, ChevronRight, Activity, Car, Bed,
  CheckCircle, XCircle, Truck, AlertTriangle, Zap, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';

interface BookingDetailPanelProps {
  bookingId: string;
  onClose: () => void;
}

interface ServiceExpansion {
  [serviceId: string]: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800',
  CONFIRMED:       'bg-emerald-100 text-emerald-800',
  IN_OPERATIONS:   'bg-blue-100 text-blue-800',
  TRAVELLING:      'bg-purple-100 text-purple-800',
  COMPLETED:       'bg-slate-100 text-slate-700',
  CANCELLED:       'bg-rose-100 text-rose-700',
};

const COMPONENT_BADGE: Record<string, string> = {
  DRAFT:     'bg-slate-100 text-slate-600',
  REQUESTED: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-rose-100 text-rose-700',
};

export const BookingDetailPanel: React.FC<BookingDetailPanelProps> = ({ bookingId, onClose }) => {
  const { currentUser, permissions } = useAuth();
  const [data, setData] = useState<BookingDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ServiceExpansion>({});
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Per-service form state (keyed by service id)
  const [serviceForms, setServiceForms] = useState<Record<string, Record<string, string>>>({});

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        headers: { 'X-Demo-User-Id': currentUser.id }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load booking');
      setData(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bookingId, currentUser.id]);

  useEffect(() => {
    if (bookingId) fetchDetail();
  }, [bookingId, fetchDetail]);

  const apiPost = async (path: string, body?: any) => {
    const res = await fetch(`/api/bookings/${bookingId}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Demo-User-Id': currentUser.id },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const apiPatch = async (path: string, body: any) => {
    const res = await fetch(`/api/bookings/${bookingId}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Demo-User-Id': currentUser.id },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const handleDispatch = async () => {
    setActionLoading('dispatch');
    setActionError(null);
    try {
      await apiPost('/dispatch');
      await fetchDetail();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;
    setActionLoading('cancel');
    setActionError(null);
    try {
      await apiPost('/cancel', { cancellationReason: cancelReason });
      setCancelModalOpen(false);
      setCancelReason('');
      await fetchDetail();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateVouchers = async () => {
    setActionLoading('vouchers');
    setActionError(null);
    try {
      await apiPost('/vouchers/generate');
      await fetchDetail();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleServiceConfirm = async (
    type: 'accommodations' | 'transports' | 'activities',
    serviceId: string
  ) => {
    setActionLoading(`service-${serviceId}`);
    setActionError(null);
    try {
      const formData = serviceForms[serviceId] || {};
      await apiPatch(`/services/${type}/${serviceId}`, {
        confirmationStatus: 'CONFIRMED',
        ...formData,
      });
      await fetchDetail();
      setExpanded(prev => ({ ...prev, [serviceId]: false }));
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const updateServiceForm = (serviceId: string, field: string, value: string) => {
    setServiceForms(prev => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] || {}), [field]: value },
    }));
  };

  const toggleExpanded = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const canManageOps = permissions.canManageOperations;
  const isAdmin = currentUser.role === 'Admin' || currentUser.role === 'Founder';

  if (loading) return (
    <div className="h-full flex items-center justify-center bg-slate-50/50 p-8 rounded-r-2xl border-l border-slate-200">
      <div className="text-slate-400 font-medium">Loading booking details...</div>
    </div>
  );

  if (error) return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 p-8 rounded-r-2xl border-l border-slate-200">
      <div className="text-red-500 font-bold mb-2">Error</div>
      <div className="text-slate-600 text-sm">{error}</div>
      <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-xs font-bold">Close</button>
    </div>
  );

  if (!data) return null;

  const { booking, accommodations, transports, activities, paymentSummary } = data;
  const isTerminal = booking.status === 'CANCELLED' || booking.status === 'COMPLETED';
  const allConfirmed = booking.confirmationProgress?.allConfirmed;

  return (
    <div className="h-full bg-white border-l border-slate-200 flex flex-col w-full rounded-r-2xl shadow-[-10px_0_30px_rgba(0,0,0,0.02)] relative z-10 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Booking Detail</div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{booking.bookingReference}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE[booking.status] || 'bg-slate-200 text-slate-700'}`}>
              {booking.status}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="mx-5 mt-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {actionError}
        </div>
      )}

      {/* Stage 2 Action Bar */}
      {!isTerminal && (canManageOps || isAdmin) && (
        <div className="mx-5 mt-4 flex flex-wrap gap-2">
          {/* Dispatch to Operations */}
          {booking.status === 'CONFIRMED' && canManageOps && (
            <button
              id={`dispatch-btn-${booking.id}`}
              onClick={handleDispatch}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {actionLoading === 'dispatch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
              Dispatch to Operations
            </button>
          )}

          {/* Generate Vouchers */}
          {booking.status === 'IN_OPERATIONS' && allConfirmed && canManageOps && (
            <button
              id={`vouchers-btn-${booking.id}`}
              onClick={handleGenerateVouchers}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
            >
              {actionLoading === 'vouchers' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generate Vouchers
            </button>
          )}

          {/* Cancel Booking */}
          {isAdmin && (
            <button
              id={`cancel-btn-${booking.id}`}
              onClick={() => setCancelModalOpen(true)}
              disabled={!!actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded-lg text-sm font-bold transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Cancel Booking
            </button>
          )}
        </div>
      )}

      {/* Confirmation Progress */}
      {booking.confirmationProgress && (
        <div className="mx-5 mt-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Confirmation Progress</div>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold text-emerald-600">{booking.confirmationProgress.confirmedServices} Confirmed</span>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">{booking.confirmationProgress.totalServices} Total</span>
            {allConfirmed && <span className="flex items-center gap-1 text-emerald-600 font-bold"><CheckCircle className="w-3 h-3" /> All Confirmed</span>}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Customer & Trip */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <FileText className="w-3 h-3" /> Customer
            </div>
            <div className="font-bold text-slate-900">{booking.customerName || 'Unknown'}</div>
            <div className="text-xs text-slate-500 mt-1">{booking.customerEmail || 'No Email'}</div>
            <div className="text-xs text-slate-500">{booking.customerPhone || 'No Phone'}</div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Travel Dates
            </div>
            <div className="font-bold text-slate-900">{new Date(booking.travelStartDate).toLocaleDateString()}</div>
            <div className="text-xs text-slate-500 mt-1">To: {new Date(booking.travelEndDate).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Payment Summary */}
        {paymentSummary && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#7056EE]" />
              Payment Summary
            </h3>
            <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">Status</div>
                <div className="font-bold text-slate-900">{paymentSummary.paymentStatus}</div>
              </div>
              {paymentSummary.totalSellingPrice !== undefined && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Total Value</div>
                  <div className="font-bold text-slate-900">₹{paymentSummary.totalSellingPrice.toLocaleString('en-IN')}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-slate-500 mb-1">Received</div>
                <div className="font-bold text-emerald-600">₹{paymentSummary.amountReceived.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Pending</div>
                <div className="font-bold text-rose-600">₹{paymentSummary.amountPending.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Fulfilment Services */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3">Fulfilment Services</h3>
          <div className="space-y-3">
            {accommodations.map(acc => (
              <div key={acc.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 flex gap-4 items-start">
                  <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Bed className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-sm">{acc.propertyName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{acc.roomCategoryName} • {acc.mealPlan}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      {new Date(acc.checkInDate).toLocaleDateString()} to {new Date(acc.checkOutDate).toLocaleDateString()} ({acc.nightsCount}N)
                    </div>
                    {acc.supplierConfirmationCode && (
                      <div className="text-[11px] text-emerald-600 font-bold mt-1">Code: {acc.supplierConfirmationCode}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${COMPONENT_BADGE[acc.confirmationStatus]}`}>
                      {acc.confirmationStatus}
                    </span>
                    {canManageOps && acc.confirmationStatus !== 'CONFIRMED' && !isTerminal && (
                      <button onClick={() => toggleExpanded(acc.id)} className="p-1 text-slate-400 hover:text-slate-700">
                        {expanded[acc.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {expanded[acc.id] && canManageOps && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Confirmation Code</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="e.g. HRS-123456"
                          value={serviceForms[acc.id]?.supplierConfirmationCode || ''}
                          onChange={e => updateServiceForm(acc.id, 'supplierConfirmationCode', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Supplier Contact</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="Supplier contact name"
                          value={serviceForms[acc.id]?.supplierContactName || ''}
                          onChange={e => updateServiceForm(acc.id, 'supplierContactName', e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Operational Notes</label>
                      <input
                        className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                        placeholder="Internal notes"
                        value={serviceForms[acc.id]?.operationalNotes || ''}
                        onChange={e => updateServiceForm(acc.id, 'operationalNotes', e.target.value)}
                      />
                    </div>
                    <button
                      id={`confirm-acc-${acc.id}`}
                      onClick={() => handleServiceConfirm('accommodations', acc.id)}
                      disabled={actionLoading === `service-${acc.id}`}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                    >
                      {actionLoading === `service-${acc.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Confirm Accommodation
                    </button>
                  </div>
                )}
              </div>
            ))}

            {transports.map(trans => (
              <div key={trans.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 flex gap-4 items-start">
                  <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Car className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-sm">{trans.vehicleCategoryName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{trans.routeName}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      {new Date(trans.serviceDate).toLocaleDateString()} • {trans.passengerCount} Pax
                    </div>
                    {trans.driverName && (
                      <div className="text-[11px] text-blue-600 font-bold mt-1">Driver: {trans.driverName} {trans.driverPhone ? `(${trans.driverPhone})` : ''}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${COMPONENT_BADGE[trans.confirmationStatus]}`}>
                      {trans.confirmationStatus}
                    </span>
                    {canManageOps && trans.confirmationStatus !== 'CONFIRMED' && !isTerminal && (
                      <button onClick={() => toggleExpanded(trans.id)} className="p-1 text-slate-400 hover:text-slate-700">
                        {expanded[trans.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {expanded[trans.id] && canManageOps && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Driver Name</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="Driver full name"
                          value={serviceForms[trans.id]?.driverName || ''}
                          onChange={e => updateServiceForm(trans.id, 'driverName', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Driver Phone</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="+91 9876543210"
                          value={serviceForms[trans.id]?.driverPhone || ''}
                          onChange={e => updateServiceForm(trans.id, 'driverPhone', e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Vehicle Registration</label>
                      <input
                        className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                        placeholder="e.g. DL 01 AB 1234"
                        value={serviceForms[trans.id]?.vehicleRegistrationNumber || ''}
                        onChange={e => updateServiceForm(trans.id, 'vehicleRegistrationNumber', e.target.value)}
                      />
                    </div>
                    <button
                      id={`confirm-trans-${trans.id}`}
                      onClick={() => handleServiceConfirm('transports', trans.id)}
                      disabled={actionLoading === `service-${trans.id}`}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                    >
                      {actionLoading === `service-${trans.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Confirm Transport
                    </button>
                  </div>
                )}
              </div>
            ))}

            {activities.map(act => (
              <div key={act.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-4 flex gap-4 items-start">
                  <div className="bg-rose-100 p-2 rounded-lg text-rose-600"><Activity className="w-4 h-4" /></div>
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 text-sm">{act.activityName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{act.destinationName}</div>
                    <div className="text-[11px] text-slate-400 mt-2">
                      {new Date(act.serviceDate).toLocaleDateString()} • {act.participantCount} Pax
                    </div>
                    {act.supplierConfirmationCode && (
                      <div className="text-[11px] text-emerald-600 font-bold mt-1">Code: {act.supplierConfirmationCode}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${COMPONENT_BADGE[act.confirmationStatus]}`}>
                      {act.confirmationStatus}
                    </span>
                    {canManageOps && act.confirmationStatus !== 'CONFIRMED' && !isTerminal && (
                      <button onClick={() => toggleExpanded(act.id)} className="p-1 text-slate-400 hover:text-slate-700">
                        {expanded[act.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {expanded[act.id] && canManageOps && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Confirmation Code</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="e.g. ACT-789012"
                          value={serviceForms[act.id]?.supplierConfirmationCode || ''}
                          onChange={e => updateServiceForm(act.id, 'supplierConfirmationCode', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Guide Name</label>
                        <input
                          className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                          placeholder="Assigned guide name"
                          value={serviceForms[act.id]?.assignedGuideName || ''}
                          onChange={e => updateServiceForm(act.id, 'assignedGuideName', e.target.value)}
                        />
                      </div>
                    </div>
                    <button
                      id={`confirm-act-${act.id}`}
                      onClick={() => handleServiceConfirm('activities', act.id)}
                      disabled={actionLoading === `service-${act.id}`}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                    >
                      {actionLoading === `service-${act.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                      Confirm Activity
                    </button>
                  </div>
                )}
              </div>
            ))}

            {accommodations.length === 0 && transports.length === 0 && activities.length === 0 && (
              <div className="text-center p-4 border border-slate-200 border-dashed rounded-xl text-slate-400 text-xs">
                No services attached to this booking.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cancel Booking Modal */}
      {cancelModalOpen && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20 rounded-r-2xl">
          <div className="bg-white rounded-2xl p-6 w-[360px] shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Cancel Booking</h3>
            <p className="text-sm text-slate-500 mb-4">
              This action cannot be undone. Provide a reason for the cancellation.
            </p>
            <textarea
              id="cancel-reason-input"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none"
              rows={3}
              placeholder="e.g. Customer requested cancellation due to travel date change..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setCancelModalOpen(false); setCancelReason(''); setActionError(null); }}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-bold text-slate-700"
              >
                Back
              </button>
              <button
                id="confirm-cancel-btn"
                onClick={handleCancel}
                disabled={cancelReason.trim().length < 5 || actionLoading === 'cancel'}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-lg text-sm font-bold text-white flex items-center justify-center gap-2"
              >
                {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

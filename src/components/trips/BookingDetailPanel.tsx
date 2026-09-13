import React, { useState, useEffect } from 'react';
import { BookingDetailResponse } from '../../types/bookingApi';
import { useAuth } from '../../context/AuthContext';
import { FileText, MapPin, Calendar, Clock, CreditCard, ChevronRight, Activity, Car, Bed } from 'lucide-react';

interface BookingDetailPanelProps {
  bookingId: string;
  onClose: () => void;
}

export const BookingDetailPanel: React.FC<BookingDetailPanelProps> = ({ bookingId, onClose }) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState<BookingDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/bookings/${bookingId}`, {
          headers: {
            'X-Demo-User-Id': currentUser.id
          }
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load booking');
        setData(json.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (bookingId) fetchDetail();
  }, [bookingId, currentUser.id]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50/50 p-8 rounded-r-2xl border-l border-slate-200">
        <div className="text-slate-400 font-medium">Loading booking details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-50/50 p-8 rounded-r-2xl border-l border-slate-200">
        <div className="text-red-500 font-bold mb-2">Error</div>
        <div className="text-slate-600 text-sm">{error}</div>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-xs font-bold">Close</button>
      </div>
    );
  }

  if (!data) return null;

  const { booking, accommodations, transports, activities, paymentSummary } = data;

  return (
    <div className="h-full bg-white border-l border-slate-200 flex flex-col w-full rounded-r-2xl shadow-[-10px_0_30px_rgba(0,0,0,0.02)] relative z-10 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div>
          <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Booking Detail</div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{booking.bookingReference}</h2>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
              booking.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
            }`}>
              {booking.status}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

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

        {/* Services */}
        <div>
          <h3 className="text-sm font-bold text-slate-900 mb-3">Fulfilment Services</h3>
          <div className="space-y-3">
            {accommodations.map(acc => (
              <div key={acc.id} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
                <div className="bg-orange-100 p-2 rounded-lg text-orange-600">
                  <Bed className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-slate-900 text-sm">{acc.propertyName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{acc.roomCategoryName} • {acc.mealPlan}</div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {new Date(acc.checkInDate).toLocaleDateString()} to {new Date(acc.checkOutDate).toLocaleDateString()} ({acc.nightsCount}N)
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold ${acc.confirmationStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {acc.confirmationStatus}
                </div>
              </div>
            ))}
            
            {transports.map(trans => (
              <div key={trans.id} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <Car className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-slate-900 text-sm">{trans.vehicleCategoryName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{trans.routeName}</div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {new Date(trans.serviceDate).toLocaleDateString()} • {trans.passengerCount} Pax
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold ${trans.confirmationStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {trans.confirmationStatus}
                </div>
              </div>
            ))}

            {activities.map(act => (
              <div key={act.id} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-start">
                <div className="bg-rose-100 p-2 rounded-lg text-rose-600">
                  <Activity className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-slate-900 text-sm">{act.activityName}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{act.destinationName}</div>
                  <div className="text-[11px] text-slate-400 mt-2">
                    {new Date(act.serviceDate).toLocaleDateString()} • {act.participantCount} Pax
                  </div>
                </div>
                <div className={`px-2 py-1 rounded text-[10px] font-bold ${act.confirmationStatus === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {act.confirmationStatus}
                </div>
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
    </div>
  );
};

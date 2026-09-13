import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { BookingListResponse } from '../../types/bookingApi';
import { Booking } from '../../types/booking';
import { BookingDetailPanel } from './BookingDetailPanel';

export const BookingsView: React.FC = () => {
  const { currentUser } = useAuth();
  
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounce search query
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadBookings = async (cursor?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      let url = '/api/bookings?limit=20';
      if (cursor) url += `&cursor=${cursor}`;
      if (debouncedQuery) url += `&query=${encodeURIComponent(debouncedQuery)}`;
      
      const res = await fetch(url, {
        headers: { 'X-Demo-User-Id': currentUser.id }
      });
      
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load bookings');
      
      const typedData = json as BookingListResponse;
      
      if (cursor) {
        setBookings(prev => [...prev, ...typedData.data]);
      } else {
        setBookings(typedData.data);
      }
      
      setNextCursor(typedData.nextCursor);
      setHasMore(typedData.hasMore);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial load & search
  useEffect(() => {
    loadBookings();
  }, [debouncedQuery, currentUser.id]);

  return (
    <div id="bookings-view" className="h-full flex gap-4">
      {/* List Pane */}
      <div className={`flex-1 space-y-5 transition-all duration-300 ${selectedBookingId ? 'max-w-2xl hidden md:block' : 'w-full'}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Booking Registry</h2>
              {!loading && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/15 text-[#7056EE]">
                  Live
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Central repository for operational bookings.</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-[calc(100vh-180px)]">
          <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by reference or customer..." 
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#7056EE] focus:ring-1 focus:ring-[#7056EE]"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {error ? (
              <div className="p-8 text-center text-red-500 text-sm">{error}</div>
            ) : loading && bookings.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">Loading bookings...</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                  <tr className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">Booking Ref</th>
                    <th className="py-3.5 px-4">Customer</th>
                    <th className="py-3.5 px-4">Travel Date</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {bookings.map((booking) => (
                    <tr 
                      key={booking.id} 
                      className={`transition-colors cursor-pointer ${selectedBookingId === booking.id ? 'bg-[#7056EE]/5' : 'hover:bg-slate-50/80'}`}
                      onClick={() => setSelectedBookingId(booking.id)}
                    >
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{booking.bookingReference}</p>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">
                        {booking.customerName || 'Unknown'}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(booking.travelStartDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          booking.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {booking.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedBookingId(booking.id); }}
                          className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            selectedBookingId === booking.id 
                              ? 'bg-[#7056EE] text-white' 
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">
                        No bookings found matching criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            
            {hasMore && !loading && (
              <div className="p-4 flex justify-center border-t border-slate-100">
                <button 
                  onClick={() => loadBookings(nextCursor!)}
                  className="px-4 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Load More
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Pane */}
      {selectedBookingId && (
        <div className="flex-1 max-w-2xl h-[calc(100vh-120px)] mt-[60px] animate-in slide-in-from-right-8 fade-in duration-300">
          <BookingDetailPanel bookingId={selectedBookingId} onClose={() => setSelectedBookingId(null)} />
        </div>
      )}
    </div>
  );
};



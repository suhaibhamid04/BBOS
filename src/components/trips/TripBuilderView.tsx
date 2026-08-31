import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Trip, ItineraryDay, Hotel, Transport, Activity, Driver, Supplier, Voucher } from '../../types';
import { Plane, Calendar, MapPin, User, Plus, Bed, Car, Compass, Trash2, ArrowLeft, MoreVertical, Search, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const TripBuilderView: React.FC = () => {
  const { trips, customers, leads, hotels, transports, activities } = useData();
  const { currentUser } = useAuth();
  
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);

  const activeTrip = trips.find(t => t.id === selectedTripId);

  const handleCreateTrip = () => {
    setIsCreatingTrip(true);
  };

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || 'Unknown Customer';

  // Format date safely
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (activeTrip) {
    const days = activeTrip.itinerary || [];
    const activeDay = days[selectedDayIndex];

    return (
      <div id="trip-builder-active" className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedTripId(null)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">{activeTrip.tripName || 'Untitled Trip'}</h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                <span className="flex items-center gap-1"><User className="w-3 h-3" /> {getCustomerName(activeTrip.customerId)}</span>
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {activeTrip.destination}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(activeTrip.startDate)} - {formatDate(activeTrip.endDate)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors">
              Save Draft
            </button>
            <button className="px-4 py-2 bg-[#7056EE] hover:bg-[#6044E6] text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Generate Quote
            </button>
          </div>
        </div>

        {/* Costing Engine Preview */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Supplier Cost</p>
              <p className="text-lg font-black text-slate-900">₹{activeTrip.totalCost?.toLocaleString('en-IN') || 0}</p>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Selling Price</p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-black text-[#7056EE]">₹{activeTrip.totalSellingPrice?.toLocaleString('en-IN') || 0}</p>
                <button className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold transition-colors">Edit</button>
              </div>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Gross Profit</p>
              <p className="text-lg font-black text-emerald-600">₹{activeTrip.grossProfit?.toLocaleString('en-IN') || 0}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Margin</p>
              <p className="text-lg font-black text-emerald-600">{activeTrip.grossMargin}%</p>
            </div>
          </div>
          <div>
             <button className="text-xs font-bold text-[#7056EE] hover:text-[#6044E6] flex items-center gap-1">
               Detailed Breakdown &rarr;
             </button>
          </div>
        </div>

        {/* Builder Layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Day Navigator (Sidebar) */}
          <div className="w-64 bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden shrink-0">
            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Itinerary Days</h3>
              <button className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {days.map((day, idx) => (
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
                  <p className="text-[11px] font-normal truncate mt-0.5 opacity-80">{day.title || 'Add location/title...'}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Day Content Area */}
          <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            {activeDay ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-slate-900">Day {activeDay.dayNumber}</h3>
                    <span className="text-sm text-slate-500 font-medium">{formatDate(activeDay.date)}</span>
                  </div>
                  <input 
                    type="text"
                    placeholder="Enter day title (e.g., Arrival & Srinagar Sightseeing)" 
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-[#7056EE] focus:ring-1 focus:ring-[#7056EE]"
                    defaultValue={activeDay.title}
                  />
                </div>

                <div className="p-5 space-y-6">
                  {/* Accommodation */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Bed className="w-4 h-4 text-emerald-500" /> Accommodation
                      </h4>
                      <button className="text-xs font-bold text-[#7056EE] hover:text-[#6044E6] flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Hotel
                      </button>
                    </div>
                    {activeDay.hotelBookings && activeDay.hotelBookings.length > 0 ? (
                      <div className="space-y-2">
                        {activeDay.hotelBookings.map((hb, i) => (
                          <div key={i} className="p-3 border border-slate-200 rounded-lg bg-white flex items-center justify-between group hover:border-emerald-300 transition-colors">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{hb.hotelName}</p>
                              <p className="text-xs text-slate-500">{hb.roomType} • {hb.mealPlan}</p>
                            </div>
                            <button className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                        <p className="text-xs text-slate-500 font-medium">No accommodation added for this day</p>
                      </div>
                    )}
                  </div>

                  {/* Transport */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Car className="w-4 h-4 text-amber-500" /> Transportation
                      </h4>
                      <button className="text-xs font-bold text-[#7056EE] hover:text-[#6044E6] flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Transport
                      </button>
                    </div>
                    {activeDay.transportBookings && activeDay.transportBookings.length > 0 ? (
                      <div className="space-y-2">
                        {activeDay.transportBookings.map((tb, i) => (
                          <div key={i} className="p-3 border border-slate-200 rounded-lg bg-white flex items-center justify-between group hover:border-amber-300 transition-colors">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{tb.vehicleType} • {tb.pickupLocation} to {tb.dropoffLocation}</p>
                              <p className="text-xs text-slate-500">{tb.notes || 'Full day sightseeing'}</p>
                            </div>
                            <button className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                        <p className="text-xs text-slate-500 font-medium">No transport added for this day</p>
                      </div>
                    )}
                  </div>

                  {/* Activities */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-[#F0A608]" /> Activities & Extras
                      </h4>
                      <button className="text-xs font-bold text-[#7056EE] hover:text-[#6044E6] flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Activity
                      </button>
                    </div>
                    {activeDay.activityBookings && activeDay.activityBookings.length > 0 ? (
                      <div className="space-y-2">
                        {activeDay.activityBookings.map((ab, i) => (
                          <div key={i} className="p-3 border border-slate-200 rounded-lg bg-white flex items-center justify-between group hover:border-[#F0A608] transition-colors">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{ab.activityName}</p>
                              <p className="text-xs text-slate-500">{ab.activityType}</p>
                            </div>
                            <button className="p-1.5 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                        <p className="text-xs text-slate-500 font-medium">No activities added for this day</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-slate-50/50">
                <p className="text-sm font-medium text-slate-400">Select a day from the left to edit itinerary</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="trip-builder-list" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Trip Builder</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
              {trips.length} Active Trips
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Design custom itineraries, select hotels, and calculate costs.</p>
        </div>
        <button 
          onClick={handleCreateTrip}
          className="px-4 py-2 bg-[#7056EE] hover:bg-[#6044E6] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Trip
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search trips by customer or destination..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#7056EE] focus:ring-1 focus:ring-[#7056EE]"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Trip Details</th>
                <th className="py-3.5 px-4">Customer</th>
                <th className="py-3.5 px-4">Dates</th>
                <th className="py-3.5 px-4">Costing</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {trips.map((trip) => (
                <tr key={trip.id} className="hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => setSelectedTripId(trip.id)}>
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900">{trip.tripName || 'Untitled Trip'}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" /> {trip.destination} ({trip.totalPax} Pax)
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
                    {trip.grossMargin && (
                      <p className="text-[10px] text-emerald-600 font-medium">Margin: {trip.grossMargin}%</p>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      trip.status === 'DRAFT' ? 'bg-slate-100 text-slate-700' :
                      trip.status === 'QUOTED' ? 'bg-purple-100 text-purple-800' :
                      trip.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {trip.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button className="p-1.5 text-slate-400 hover:text-[#7056EE] rounded-md hover:bg-slate-100 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {trips.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                    No trips found. Create a new trip to get started.
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

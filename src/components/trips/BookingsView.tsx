import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { CheckSquare, Search, FileText, CheckCircle2, XCircle } from 'lucide-react';

export const BookingsView: React.FC = () => {
  const { trips, hotels, transports } = useData();
  const [activeTab, setActiveTab] = useState<'TRIPS' | 'HOTELS' | 'TRANSPORT'>('TRIPS');

  const confirmedTrips = trips.filter(t => t.status === 'CONFIRMED' || t.status === 'IN_PROGRESS' || t.status === 'COMPLETED');
  
  const getCustomerName = (id: string) => id.replace('cust-', 'Customer ');

  return (
    <div id="bookings-view" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Booking Registry</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {confirmedTrips.length} Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Central repository for confirmed trips, hotels, and transport bookings.</p>
        </div>
      </div>

      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('TRIPS')}
          className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'TRIPS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Confirmed Trips
        </button>
        <button
          onClick={() => setActiveTab('HOTELS')}
          className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'HOTELS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Hotel Bookings
        </button>
        <button
          onClick={() => setActiveTab('TRANSPORT')}
          className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
            activeTab === 'TRANSPORT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Transport Bookings
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={`Search ${activeTab.toLowerCase()}...`} 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-[#7056EE] focus:ring-1 focus:ring-[#7056EE]"
            />
          </div>
        </div>
        
        {activeTab === 'TRIPS' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Booking ID / Trip</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Travel Dates</th>
                  <th className="py-3.5 px-4">Value</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {confirmedTrips.map((trip) => (
                  <tr key={trip.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">{trip.tripName}</p>
                      <p className="text-[11px] text-slate-400 font-mono">BKG-{trip.id.slice(-6).toUpperCase()}</p>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {getCustomerName(trip.customerId)}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {new Date(trip.startDate).toLocaleDateString()} - {new Date(trip.endDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900">₹{trip.totalSellingPrice?.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        trip.status === 'IN_PROGRESS' ? 'bg-[#7056EE]/15 text-[#7056EE]' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {trip.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="px-3 py-1 bg-slate-100 hover:bg-[#7056EE] hover:text-white rounded-lg text-[11px] font-bold text-slate-700 transition-colors">
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                {confirmedTrips.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500 text-sm">
                      No confirmed trips found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab !== 'TRIPS' && (
          <div className="p-8 text-center text-slate-500 text-sm bg-slate-50/50">
            <p>Detailed {activeTab.toLowerCase()} booking ledger will be displayed here.</p>
            <p className="text-xs text-slate-400 mt-1">This aggregates all component bookings from active trips.</p>
          </div>
        )}
      </div>
    </div>
  );
};


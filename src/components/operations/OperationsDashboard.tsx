import React from 'react';
import { useData } from '../../context/DataContext';
import { Compass, Calendar, Car, Bed, FileText, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

export const OperationsDashboard: React.FC = () => {
  const { trips, hotels, transports, drivers, suppliers, vouchers, customers } = useData();

  // Active trips (confirmed/in-progress)
  const activeTrips = trips.filter(t => t.status === 'CONFIRMED' || t.status === 'IN_PROGRESS');
  
  // Upcoming arrivals (next 7 days)
  const today = new Date();
  const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  const upcomingTrips = activeTrips.filter(t => {
    const startDate = new Date(t.startDate);
    return startDate >= today && startDate <= nextWeek;
  }).sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const getCustomerName = (id: string) => {
    return customers.find(c => c.id === id)?.name || id.replace('cust-', 'Customer ');
  };

  return (
    <div id="operations-dashboard" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Operations Dashboard</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Live Operations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Manage ground logistics, supplier confirmations, and guest arrivals.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Upcoming Arrivals</span>
            <Compass className="w-5 h-5 text-[#F0A608]" />
          </div>
          <div className="text-2xl font-black text-slate-900">{upcomingTrips.length}</div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">In the next 7 days</p>
        </div>
        
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Hotels</span>
            <Bed className="w-5 h-5 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">3</div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">Awaiting supplier confirmation</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Drivers Active</span>
            <Car className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {drivers.filter(d => d.status === 'ON_TRIP').length} / {drivers.length}
          </div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">Currently assigned to trips</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ready Vouchers</span>
            <FileText className="w-5 h-5 text-[#7056EE]" />
          </div>
          <div className="text-2xl font-black text-slate-900">{vouchers.filter(v => v.status === 'GENERATED').length}</div>
          <p className="text-[10px] text-slate-500 font-medium mt-1">Pending dispatch to guests</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Arrivals Widget */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Upcoming Arrivals</h3>
            <button className="text-xs font-bold text-[#7056EE] hover:text-[#6044E6]">View Calendar</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
            {upcomingTrips.map(trip => (
              <div key={trip.id} className="p-3 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-bold text-slate-900">{trip.tripName}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {new Date(trip.startDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Customer: {trip.customerId.replace('cust-', 'Cust ')}</span>
                  <span>{trip.totalPax} Pax</span>
                </div>
              </div>
            ))}
            {upcomingTrips.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">
                No arrivals in the next 7 days.
              </div>
            )}
          </div>
        </div>

        {/* Action Center */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900">Pending Actions</h3>
            <span className="text-xs font-bold px-2 py-1 bg-rose-100 text-rose-800 rounded-lg">3 Required</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {/* Mock Pending Actions for Demo */}
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex gap-3">
              <div className="mt-0.5">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Confirm Hotel Khyber</p>
                <p className="text-xs text-slate-600 mt-0.5">Trip: TRP-001 (Starts in 3 days)</p>
                <div className="mt-2 flex gap-2">
                  <button className="text-[10px] font-bold px-3 py-1.5 bg-rose-500 text-white rounded shadow-xs hover:bg-rose-600 transition-colors">Mark Confirmed</button>
                  <button className="text-[10px] font-bold px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded hover:bg-slate-50 transition-colors">Contact Supplier</button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
              <div className="mt-0.5">
                <Clock className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Assign Driver for Pickup</p>
                <p className="text-xs text-slate-600 mt-0.5">Trip: TRP-002 (Srinagar Airport - 10:00 AM)</p>
                <div className="mt-2 flex gap-2">
                  <button className="text-[10px] font-bold px-3 py-1.5 bg-amber-500 text-white rounded shadow-xs hover:bg-amber-600 transition-colors">Assign Now</button>
                </div>
              </div>
            </div>
            
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="w-5 h-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Generate Vouchers</p>
                <p className="text-xs text-slate-600 mt-0.5">Trip: TRP-003 (Fully confirmed)</p>
                <div className="mt-2 flex gap-2">
                  <button className="text-[10px] font-bold px-3 py-1.5 bg-[#7056EE] text-white rounded shadow-xs hover:bg-[#6044E6] transition-colors">Generate</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


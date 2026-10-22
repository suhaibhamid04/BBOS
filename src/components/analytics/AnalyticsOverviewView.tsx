import React from 'react';
import { BarChart2, PieChart } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { calculateDashboardMetrics, formatMetric } from '../../services/dashboardMetrics';

export const AnalyticsOverviewView: React.FC = () => {
  const { currentUser } = useAuth();
  const { leads, bookings, quotes, dataLoadErrors } = useData();
  const metrics = calculateDashboardMetrics({ leads, bookings, quotes, role: currentUser.role, errors: dataLoadErrors });
  const financialAvailable = metrics.verifiedCustomerPayments.status === 'available';
  const totalBookingValue = bookings.reduce((sum, booking) => sum + (Number(booking.totalAmount) || 0), 0);
  const averageBookingValue = bookings.length === 0 ? 0 : totalBookingValue / bookings.length;
  const activePipelineValue = quotes.filter(quote => ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'VIEWED'].includes(quote.status)).reduce((sum, quote) => sum + (Number(quote.finalAmount) || 0), 0);
  const byMonth = bookings.reduce<Record<string, { payment: number; bookings: number }>>((result, booking) => {
    const date = new Date(booking.createdAt);
    if (Number.isNaN(date.getTime())) return result;
    const key = date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
    result[key] ||= { payment: 0, bookings: 0 };
    result[key].payment += Number(booking.amountReceived) || 0;
    result[key].bookings += 1;
    return result;
  }, {});
  const byDestination = bookings.reduce<Record<string, number>>((result, booking) => {
    const destination = booking.destination?.trim() || 'Unspecified';
    result[destination] = (result[destination] || 0) + (Number(booking.totalAmount) || 0);
    return result;
  }, {});
  const monthlyEntries = Object.entries(byMonth) as Array<[string, { payment: number; bookings: number }]>;
  const destinationEntries = Object.entries(byDestination) as Array<[string, number]>;
  const maxMonthly = Math.max(0, ...monthlyEntries.map(([, value]) => value.payment));

  return <div id="analytics-overview-view" className="space-y-6">
    <div><h2 className="text-xl font-bold text-slate-900">Business & Travel Analytics</h2><p className="text-xs text-slate-500 mt-1">Authorized totals derived from current leads, quotes, bookings, and verified payment aggregates</p></div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-500">Verified Customer Payments</p><h3 className="text-2xl font-black mt-2">{formatMetric(metrics.verifiedCustomerPayments, value => `₹${value.toLocaleString('en-IN')}`)}</h3><p className="text-[11px] text-slate-500 mt-1">Verified payments reflected by authorized bookings</p></div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-500">Average Booking Value</p><h3 className="text-2xl font-black mt-2">{dataLoadErrors.bookings ? 'Unavailable' : `₹${Math.round(averageBookingValue).toLocaleString('en-IN')}`}</h3><p className="text-[11px] text-slate-500 mt-1">Selling value divided by authorized bookings</p></div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-500">Lead Conversion Rate</p><h3 className="text-2xl font-black mt-2 text-violet-700">{formatMetric(metrics.conversionRate, value => `${value.toFixed(1)}%`)}</h3><p className="text-[11px] text-slate-500 mt-1">Converted leads divided by all authorized leads</p></div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-xs text-slate-500">Active Quote Value</p><h3 className="text-2xl font-black mt-2 text-amber-700">{dataLoadErrors.quotes || !financialAvailable ? 'Unavailable' : `₹${activePipelineValue.toLocaleString('en-IN')}`}</h3><p className="text-[11px] text-slate-500 mt-1">Current selling value; not realized revenue</p></div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4"><h3 className="text-sm font-bold flex items-center gap-2"><BarChart2 className="w-4 h-4 text-violet-600" />Verified Payments by Booking Month</h3>{dataLoadErrors.bookings || !financialAvailable ? <p className="text-sm text-slate-500">Financial trend unavailable.</p> : monthlyEntries.length === 0 ? <p className="text-sm text-slate-500">No booking payment data.</p> : <div className="space-y-3">{monthlyEntries.map(([month, value]) => <div key={month}><div className="flex justify-between text-xs"><span>{month}</span><span>₹{value.payment.toLocaleString('en-IN')} ({value.bookings})</span></div><div className="h-2 bg-slate-100 rounded mt-1"><div className="h-2 bg-violet-500 rounded" style={{ width: `${maxMonthly === 0 ? 0 : Math.round(value.payment / maxMonthly * 100)}%` }} /></div></div>)}</div>}</div>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4"><h3 className="text-sm font-bold flex items-center gap-2"><PieChart className="w-4 h-4 text-amber-600" />Destination Booking Value</h3>{dataLoadErrors.bookings || !financialAvailable ? <p className="text-sm text-slate-500">Destination value unavailable.</p> : destinationEntries.length === 0 ? <p className="text-sm text-slate-500">No destination booking data.</p> : <div className="space-y-3">{destinationEntries.sort((a,b) => b[1]-a[1]).map(([destination, value]) => { const share = totalBookingValue === 0 ? 0 : Math.round(value / totalBookingValue * 100); return <div key={destination}><div className="flex justify-between text-xs"><span>{destination}</span><span>{share}% (₹{value.toLocaleString('en-IN')})</span></div><div className="h-2 bg-slate-100 rounded mt-1"><div className="h-2 bg-amber-500 rounded" style={{ width: `${share}%` }} /></div></div>; })}</div>}</div>
    </div>
  </div>;
};

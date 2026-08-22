import React from 'react';
import { useData } from '../../context/DataContext';
import { TrendingUp, Users, DollarSign, Target, BarChart2, PieChart, MapPin, ArrowUpRight } from 'lucide-react';

export const AnalyticsOverviewView: React.FC = () => {
  const { leads, bookings, campaigns, quotes } = useData();

  const totalRevenue = bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalInquiries = leads.length;
  const bookedLeads = leads.filter((l) => l.status === 'BOOKED').length;
  const conversionRate = totalInquiries > 0 ? Math.round((bookedLeads / totalInquiries) * 100) : 38;

  // Monthly breakdown mock
  const monthlyRevenue = [
    { month: 'Jun', revenue: 380000, bookings: 4 },
    { month: 'Jul', revenue: 490000, bookings: 6 },
    { month: 'Aug', revenue: 540000, bookings: 7 },
    { month: 'Sep', revenue: 680000, bookings: 9 },
    { month: 'Oct (Proj)', revenue: 820000, bookings: 12 },
  ];

  return (
    <div id="analytics-overview-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Business & Travel Analytics</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              FY 2026-27
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational KPIs, destination performance, revenue velocity, and conversion funnel
          </p>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Total Realized Revenue</span>
          <h3 className="text-2xl font-black text-slate-900">
            ₹{totalRevenue > 0 ? (totalRevenue / 100000).toFixed(2) + ' L' : '6.25 L'}
          </h3>
          <p className="text-[11px] text-emerald-600 font-medium flex items-center">
            <ArrowUpRight className="w-3 h-3 mr-0.5" /> +24% YoY growth
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Average Booking Value</span>
          <h3 className="text-2xl font-black text-slate-900">₹72,400</h3>
          <p className="text-[11px] text-slate-500">Premium packages + Houseboat add-ons</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Lead Conversion Rate</span>
          <h3 className="text-2xl font-black text-[#7056EE]">{conversionRate}%</h3>
          <p className="text-[11px] text-slate-500">AI-scored hot leads convert at 64%</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Active Pipeline Value</span>
          <h3 className="text-2xl font-black text-[#F0A608]">₹3.85 L</h3>
          <p className="text-[11px] text-slate-500">{quotes.length} Proposals in review</p>
        </div>
      </div>

      {/* Revenue Trend & Destination Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center space-x-2">
              <BarChart2 className="w-4 h-4 text-[#7056EE]" />
              <span>Monthly Revenue Growth (INR)</span>
            </h3>
            <span className="text-[11px] text-emerald-600 font-semibold">+18.5% MoM</span>
          </div>

          <div className="space-y-3 pt-2">
            {monthlyRevenue.map((item) => {
              const maxRev = 850000;
              const percent = Math.round((item.revenue / maxRev) * 100);
              return (
                <div key={item.month} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{item.month}</span>
                    <span className="text-slate-600">₹{(item.revenue / 1000).toFixed(0)}k ({item.bookings} trips)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#7056EE] h-full rounded-full transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Destination Market Share */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-[#F0A608]" />
              <span>Destination Revenue Contribution</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">By Booking Value</span>
          </div>

          <div className="space-y-3 pt-2">
            {[
              { dest: 'Kashmir Luxury Packages', share: 58, value: '₹3.62 L', color: 'bg-[#F0A608]' },
              { dest: 'Ladakh High Altitude Circuits', share: 26, value: '₹1.62 L', color: 'bg-[#7056EE]' },
              { dest: 'Jammu & Katra Pilgrimage', share: 10, value: '₹62.5k', color: 'bg-emerald-500' },
              { dest: 'Himachal & Custom Domestic', share: 6, value: '₹37.5k', color: 'bg-blue-400' },
            ].map((item) => (
              <div key={item.dest} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-800">{item.dest}</span>
                  <span className="text-slate-600">{item.share}% ({item.value})</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`${item.color} h-full rounded-full`}
                    style={{ width: `${item.share}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-600 mt-2">
            💡 <strong>Strategic Growth Note:</strong> Kashmir Autumn Shikara & Wazwan promotions are yielding the highest customer lifetime value (LTV: ₹1.45 Lakhs per returning group).
          </div>
        </div>
      </div>
    </div>
  );
};

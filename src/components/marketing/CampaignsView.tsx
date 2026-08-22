import React from 'react';
import { useData } from '../../context/DataContext';
import { Megaphone, DollarSign, TrendingUp, Users, Target, ArrowUpRight } from 'lucide-react';

export const CampaignsView: React.FC = () => {
  const { campaigns } = useData();

  const totalSpent = campaigns.reduce((sum, c) => sum + c.spent, 0);
  const totalLeads = campaigns.reduce((sum, c) => sum + c.leadsGenerated, 0);
  const totalBookings = campaigns.reduce((sum, c) => sum + c.bookingsCount, 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenueGenerated, 0);
  const avgRoas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(1) : '5.2';

  return (
    <div id="campaigns-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Paid Ad Campaigns</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Meta Ads & Google Ads
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Real-time spend, ROAS tracking, and cost per qualified inquiry</p>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Total Ad Spend</span>
          <h3 className="text-xl font-black text-slate-900">₹{(totalSpent / 1000).toFixed(0)}k</h3>
          <p className="text-[11px] text-slate-400">Across 3 active campaigns</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Qualified Inquiries</span>
          <h3 className="text-xl font-black text-slate-900">{totalLeads} Leads</h3>
          <p className="text-[11px] text-emerald-600 font-medium">Avg CPL: ₹{Math.round(totalSpent / (totalLeads || 1))}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Campaign Revenue</span>
          <h3 className="text-xl font-black text-slate-900">₹{(totalRevenue / 100000).toFixed(2)} L</h3>
          <p className="text-[11px] text-emerald-600 font-medium">{totalBookings} Confirmed Bookings</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-slate-500 text-xs font-semibold">Blended ROAS</span>
          <h3 className="text-xl font-black text-[#7056EE]">{avgRoas}x</h3>
          <p className="text-[11px] text-emerald-600 font-medium flex items-center">
            <ArrowUpRight className="w-3 h-3 mr-0.5" /> High Margin Luxury Focus
          </p>
        </div>
      </div>

      {/* Campaign Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campaigns.map((camp) => (
          <div
            key={camp.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-800 rounded uppercase">
                  {camp.platform}
                </span>
                <h3 className="font-bold text-slate-900 text-sm mt-1">{camp.name}</h3>
                <p className="text-xs text-slate-500">{camp.targetDestination} • {camp.objective}</p>
              </div>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                camp.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
              }`}>
                {camp.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs">
              <div>
                <span className="text-slate-400 text-[10px]">Spend</span>
                <p className="font-bold text-slate-900">₹{(camp.spent / 1000).toFixed(0)}k</p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">Inquiries</span>
                <p className="font-bold text-slate-900">{camp.leadsGenerated}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[10px]">ROAS</span>
                <p className="font-bold text-[#7056EE]">{camp.roas}x</p>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
              <span>Budget: ₹{camp.budget.toLocaleString('en-IN')}</span>
              <span>Revenue: ₹{(camp.revenueGenerated / 1000).toFixed(0)}k</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

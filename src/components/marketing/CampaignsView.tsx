import React from 'react';
import { useData } from '../../context/DataContext';
import { APP_CONFIG } from '../../config';
import { calculateCampaignMetrics } from '../../services/marketing/marketingTruthfulness';
import { Megaphone } from 'lucide-react';

export const MarketingCampaignSummary = ({ campaigns }: { campaigns: ReturnType<typeof useData>['campaigns'] }) => {
  const metrics = calculateCampaignMetrics(campaigns);
  const cpl = metrics.averageCostPerLead === null ? null : Math.round(metrics.averageCostPerLead);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="campaign-summary">
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
        <span className="text-slate-500 text-xs font-semibold">Total Ad Spend</span>
        <h3 className="text-xl font-black text-slate-900">₹{metrics.totalSpent.toLocaleString('en-IN')}</h3>
        <p className="text-[11px] text-slate-400">{metrics.activeCampaigns} active {metrics.activeCampaigns === 1 ? 'campaign' : 'campaigns'}</p>
      </div>
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
        <span className="text-slate-500 text-xs font-semibold">Qualified Inquiries</span>
        <h3 className="text-xl font-black text-slate-900">{metrics.totalLeads}</h3>
        <p className="text-[11px] text-slate-500 font-medium">Average CPL: {cpl === null ? 'Unavailable' : `₹${cpl.toLocaleString('en-IN')}`}</p>
      </div>
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
        <span className="text-slate-500 text-xs font-semibold">Attributed Revenue</span>
        <h3 className="text-xl font-black text-slate-900">₹{metrics.totalRevenue.toLocaleString('en-IN')}</h3>
        <p className="text-[11px] text-slate-500 font-medium">{metrics.totalBookings} confirmed {metrics.totalBookings === 1 ? 'booking' : 'bookings'}</p>
      </div>
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
        <span className="text-slate-500 text-xs font-semibold">Blended ROAS</span>
        <h3 className="text-xl font-black text-[#7056EE]">{metrics.blendedRoas === null ? 'Unavailable' : `${metrics.blendedRoas.toFixed(1)}x`}</h3>
        <p className="text-[11px] text-slate-500 font-medium">Calculated only from loaded campaign data</p>
      </div>
    </div>
  );
};

export const CampaignsView: React.FC = () => {
  const { campaigns } = useData();

  return (
    <div id="campaigns-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Paid Ad Campaigns</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {APP_CONFIG.DEMO_MODE ? 'Example data' : 'No live platform connection'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Campaign information loaded into BBOS. Live Meta and Google synchronization is not implemented.</p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div data-testid="campaign-empty-state" className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No campaign data is available</h3>
          <p className="mx-auto mt-1 max-w-lg text-xs text-slate-500">BBOS is not connected to a live advertising account. Spend, inquiries, bookings, and ROAS remain unavailable until an authorized integration supplies real records.</p>
        </div>
      ) : (
        <>
          {APP_CONFIG.DEMO_MODE && <p data-testid="campaign-example-warning" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Illustrative demo records are shown. They are not live campaign results.</p>}
          <MarketingCampaignSummary campaigns={campaigns} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map(campaign => (
              <div key={campaign.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-800 rounded uppercase">{campaign.platform}</span>
                    <h3 className="font-bold text-slate-900 text-sm mt-1">{campaign.name}</h3>
                    <p className="text-xs text-slate-500">{campaign.targetDestination} · {campaign.objective}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${campaign.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{campaign.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-center text-xs">
                  <div><span className="text-slate-400 text-[10px]">Spend</span><p className="font-bold text-slate-900">₹{campaign.spent.toLocaleString('en-IN')}</p></div>
                  <div><span className="text-slate-400 text-[10px]">Inquiries</span><p className="font-bold text-slate-900">{campaign.leadsGenerated}</p></div>
                  <div><span className="text-slate-400 text-[10px]">ROAS</span><p className="font-bold text-[#7056EE]">{campaign.spent > 0 ? `${(campaign.revenueGenerated / campaign.spent).toFixed(1)}x` : 'Unavailable'}</p></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

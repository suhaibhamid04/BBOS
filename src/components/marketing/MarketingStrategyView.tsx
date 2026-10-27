import React from 'react';
import { useData } from '../../context/DataContext';
import { APP_CONFIG } from '../../config';
import { Compass } from 'lucide-react';

export const MarketingStrategyView: React.FC = () => {
  const { marketingPillars } = useData();

  return (
    <div id="marketing-strategy-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Marketing Strategy & Core Pillars</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {APP_CONFIG.DEMO_MODE ? 'Example strategy data' : 'No approved strategy loaded'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Approved target audiences, promotional angles, positioning, and brand messaging will appear here
          </p>
        </div>
      </div>

      {/* Strategic Marketing Pillars */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Approved Strategic Content & Positioning Pillars</h3>
        {marketingPillars.length === 0 ? (
          <div data-testid="marketing-strategy-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Compass className="mx-auto h-10 w-10 text-slate-300" />
            <h4 className="mt-3 text-sm font-bold text-slate-800">No approved marketing strategy is available</h4>
            <p className="mx-auto mt-1 max-w-lg text-xs text-slate-500">Strategy persistence and approval are not implemented yet. BBOS will not substitute seasonal claims or example plans for approved data.</p>
          </div>
        ) : <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {marketingPillars.map((pillar) => (
            <div
              key={pillar.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 bg-[#7056EE]/10 text-[#7056EE] rounded">
                  {pillar.destination}
                </span>
                <span className="text-xs text-slate-500 font-semibold">{pillar.primaryChannel}</span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">{pillar.pillarName}</h4>
                <p className="text-xs text-slate-600 mt-1">{pillar.theme}</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs">
                <p className="font-semibold text-slate-800">Target Audience:</p>
                <p className="text-slate-600">{pillar.targetAudience}</p>
              </div>

              <div className="space-y-1 text-xs">
                <p className="font-semibold text-slate-800">Sample Angles & Hooks:</p>
                <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
                  {pillar.sampleHooks.map((hook, hIdx) => (
                    <li key={hIdx}>{hook}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
};

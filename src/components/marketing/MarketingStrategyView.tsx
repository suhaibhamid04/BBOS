import React from 'react';
import { useData } from '../../context/DataContext';
import { Target, Compass, Sparkles, MapPin, Calendar, Award } from 'lucide-react';

export const MarketingStrategyView: React.FC = () => {
  const { marketingPillars } = useData();

  return (
    <div id="marketing-strategy-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Marketing Strategy & Core Pillars</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F0A608]/20 text-amber-900">
              Kashmir & Ladakh Focus
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Target audiences, seasonal promotional angles, luxury positioning, and brand messaging architecture
          </p>
        </div>
      </div>

      {/* Seasonal Campaign Strategy Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-5 rounded-2xl border border-amber-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-[#F0A608]" />
            <span>Autumn Season (Sept - Nov)</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900">Golden Chinar & Nigeen Houseboat Luxury</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Target high-income couple travelers in Mumbai, Delhi NCR, and Bangalore with quiet shikara sunsets, Wazwan dining, and crisp autumn foliage photography.
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-blue-900 font-bold text-xs uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span>Winter Season (Dec - Feb)</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900">Gulmarg Powder Snow & Ski Expeditions</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Position Booking Bridge as the premier provider with pre-booked Phase 2 Gondola tickets, heated luxury alpine huts, and private ski instructors.
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-5 rounded-2xl border border-purple-200 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-purple-900 font-bold text-xs uppercase tracking-wider">
            <Calendar className="w-4 h-4 text-[#7056EE]" />
            <span>Summer Season (May - Aug)</span>
          </div>
          <h3 className="text-sm font-bold text-slate-900">Ladakh High Altitude Passes & Pangong Tso</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Adventure luxury circuits featuring Nubra Valley glamping, Khardung La passes, and seamless altitude acclimatization itineraries.
          </p>
        </div>
      </div>

      {/* Strategic Marketing Pillars */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Strategic Content & Positioning Pillars</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      </div>
    </div>
  );
};

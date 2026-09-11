import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Sparkles, ActivitySquare, CalendarDays } from 'lucide-react';

type TabKey = 'masters' | 'rates';

export const ActivityInventoryView: React.FC = () => {
  const { permissions } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('masters');

  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: 'masters', label: 'Activity Masters', icon: ActivitySquare, show: true },
    { key: 'rates', label: 'Activity Rates', icon: CalendarDays, show: permissions.canViewSupplierRates },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <Sparkles className="w-6 h-6 text-[#7056EE]" />
              Activity Inventory
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage activities, excursions, and flexible pricing models.</p>
          </div>
        </div>

        <div className="flex items-center gap-6 mt-6">
          {tabs.filter(t => t.show).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-bold border-b-2 transition-colors ${
                  isActive 
                    ? 'border-[#7056EE] text-[#7056EE]' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'masters' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
            <ActivitySquare className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Activity Master Manager coming soon...</p>
          </div>
        )}

        {activeTab === 'rates' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
            <CalendarDays className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Activity Rate Manager coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
};

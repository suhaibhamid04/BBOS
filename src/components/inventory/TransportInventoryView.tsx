import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Plane, Car, MapPin, Route, CalendarDays, Receipt } from 'lucide-react';
import { VehicleCategoryManager } from './VehicleCategoryManager';
import { DestinationManager } from './DestinationManager';
import { TransportRouteManager } from './TransportRouteManager';

type TabKey = 'vehicles' | 'destinations' | 'routes' | 'rates' | 'supplements';

export const TransportInventoryView: React.FC = () => {
  const { permissions } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('vehicles');

  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: 'vehicles', label: 'Vehicle Categories', icon: Car, show: true },
    { key: 'destinations', label: 'Destinations', icon: MapPin, show: true },
    { key: 'routes', label: 'Transport Routes', icon: Route, show: true },
    { key: 'rates', label: 'Transport Rates', icon: CalendarDays, show: permissions.canViewSupplierRates },
    { key: 'supplements', label: 'Supplements', icon: Receipt, show: permissions.canViewSupplierRates },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="px-6 py-5 border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
              <Plane className="w-6 h-6 text-[#7056EE]" />
              Transport Inventory
            </h1>
            <p className="text-slate-500 text-sm mt-1">Manage vehicles, routes, destinations, and transport rates.</p>
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
        {activeTab === 'vehicles' && <VehicleCategoryManager />}
        {activeTab === 'destinations' && <DestinationManager />}
        {activeTab === 'routes' && <TransportRouteManager />}

        {activeTab === 'rates' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
            <CalendarDays className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Transport Rate Manager coming soon...</p>
          </div>
        )}

        {activeTab === 'supplements' && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center min-h-[300px]">
            <Receipt className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Transport Supplement Manager coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
};

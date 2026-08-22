import React from 'react';
import { useData } from '../../context/DataContext';
import { Building2, Plus, Mail, Phone, MapPin, FileSpreadsheet } from 'lucide-react';

export const CompaniesView: React.FC = () => {
  const { companies } = useData();

  return (
    <div id="companies-view" className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Corporate & Agency Accounts</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
              {companies.length} Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">B2B corporate clients, incentive tour organizers, and travel agency partners</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {companies.map((comp) => (
          <div
            key={comp.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{comp.name}</h3>
                  <p className="text-xs text-slate-500">{comp.industry}</p>
                </div>
              </div>
              {comp.gstNumber && (
                <span className="text-[10px] bg-slate-100 text-slate-600 font-mono px-2 py-0.5 rounded">
                  GST: {comp.gstNumber}
                </span>
              )}
            </div>

            <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <p className="font-semibold text-slate-900">Key Contact: {comp.contactPerson}</p>
              <div className="flex items-center space-x-4 text-[11px] text-slate-500">
                <span className="flex items-center space-x-1"><Mail className="w-3.5 h-3.5" /> <span>{comp.email}</span></span>
                <span className="flex items-center space-x-1"><Phone className="w-3.5 h-3.5" /> <span>{comp.phone}</span></span>
              </div>
              <p className="flex items-center space-x-1 text-[11px] text-slate-400">
                <MapPin className="w-3.5 h-3.5" /> <span>{comp.city}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

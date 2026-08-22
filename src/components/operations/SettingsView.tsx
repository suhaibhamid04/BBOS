import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Settings, Building2, Shield, MapPin, Mail, Phone, Check, RefreshCw } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { currentUser } = useAuth();

  const [companyName, setCompanyName] = useState('Booking Bridge Private Limited');
  const [tagline, setTagline] = useState('AI-Powered Kashmir & Ladakh Travel Operating System');
  const [headquarters, setHeadquarters] = useState('Rajbagh, Srinagar, Jammu & Kashmir 190008');
  const [supportPhone, setSupportPhone] = useState('+91 94190 12345');
  const [supportEmail, setSupportEmail] = useState('concierge@bookingbridge.com');
  const [gstin, setGstin] = useState('01AAAAA0000A1Z5');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div id="settings-view" className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <div className="flex items-center space-x-2">
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Operating System Settings</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
            Organization Profile
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          Company legal identifiers, regional hubs, operational defaults, and GST configuration
        </p>
      </div>

      <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Company Legal Entity</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Subtitle / Operating Mission</label>
          <input
            type="text"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">HQ / Destination Hub</label>
            <input
              type="text"
              value={headquarters}
              onChange={(e) => setHeadquarters(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">GSTIN Number</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-[#7056EE]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Support Phone</label>
            <input
              type="text"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Concierge Email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
          {savedSuccess ? (
            <span className="text-emerald-600 font-bold flex items-center">
              <Check className="w-4 h-4 mr-1" /> Settings saved successfully
            </span>
          ) : <span />}

          <button
            type="submit"
            className="px-5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white font-bold rounded-xl shadow-xs transition-colors"
          >
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
};

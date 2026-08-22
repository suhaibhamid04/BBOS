import React from 'react';
import { Layers, CheckCircle2, AlertCircle, RefreshCw, Key, Shield } from 'lucide-react';

export const IntegrationsView: React.FC = () => {
  const integrations = [
    {
      name: 'Google Gemini 2.5 API',
      category: 'Artificial Intelligence',
      status: 'CONNECTED',
      description: 'Powers Sales AI Copilot, Lead Scoring, Marketing GenAI, and Natural Language Command Center.',
      iconText: 'AI',
    },
    {
      name: 'Firebase Firestore & Auth',
      category: 'Persistence & Security',
      status: 'CONNECTED',
      description: 'Persistent cloud state storage, team authentication, and role-based rule security.',
      iconText: 'DB',
    },
    {
      name: 'WhatsApp Cloud Business API',
      category: 'Messaging & Omnichannel',
      status: 'CONNECTED',
      description: 'Inbound chat routing, automated high-intent replies, and itinerary PDF transmissions.',
      iconText: 'WA',
    },
    {
      name: 'Meta Ads Marketing API',
      category: 'Advertising',
      status: 'CONNECTED',
      description: 'Live campaign sync, CPL tracking, lead form webhooks, and creative deployment.',
      iconText: 'FB',
    },
    {
      name: 'Razorpay / UPI Payment Gateway',
      category: 'Payments & Banking',
      status: 'CONNECTED',
      description: 'Automatic advance payment link generation, GST tax invoices, and payment webhooks.',
      iconText: 'RZP',
    },
    {
      name: 'SMS Gateway (GupShup / Twilio)',
      category: 'Operational SMS',
      status: 'READY',
      description: 'Driver assignment alerts, airport pickup SMS, and emergency itinerary updates.',
      iconText: 'SMS',
    },
  ];

  return (
    <div id="integrations-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Integrations & External APIs</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Active Gateway
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            External API connections, messaging channels, ad networks, and AI foundation models
          </p>
        </div>
      </div>

      {/* Grid of integrations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item) => (
          <div
            key={item.name}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                  {item.iconText}
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{item.status}</span>
                </span>
              </div>

              <h3 className="font-bold text-slate-900 text-xs sm:text-sm">{item.name}</h3>
              <p className="text-[11px] font-semibold text-[#7056EE]">{item.category}</p>
              <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span className="text-[10px]">Production Mode</span>
              <span className="font-bold text-emerald-600">Healthy</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

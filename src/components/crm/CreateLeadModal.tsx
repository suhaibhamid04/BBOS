import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { DestinationRegion, TripType, Priority, LeadStatus } from '../../types';
import { X, Flame, Sparkles } from 'lucide-react';
import { PRESET_USERS } from '../../services/permissions';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateLeadModal: React.FC<CreateLeadModalProps> = ({ isOpen, onClose }) => {
  const { createLead, customers } = useData();
  const { currentUser } = useAuth();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [destination, setDestination] = useState<DestinationRegion>('Kashmir');
  const [tripType, setTripType] = useState<TripType>('Honeymoon');
  const [travelerCount, setTravelerCount] = useState(2);
  const [travelStartDate, setTravelStartDate] = useState('2026-10-15');
  const [travelEndDate, setTravelEndDate] = useState('2026-10-21');
  const [budget, setBudget] = useState(65000);
  const [sourcePlatform, setSourcePlatform] = useState<'Meta Ads' | 'Google Ads' | 'Instagram Direct' | 'WhatsApp Inbound' | 'Website Form' | 'Referral' | 'Direct Call'>('WhatsApp Inbound');
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(currentUser.id);
  const [priority, setPriority] = useState<Priority>('HIGH');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone) return;

    const assignedUser = PRESET_USERS.find(u => u.id === assignedEmployeeId) || currentUser;

    await createLead({
      customerId: `cust-${Date.now()}`,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      source: `Inbound Direct (${sourcePlatform})`,
      sourcePlatform,
      destination,
      travelStartDate,
      travelEndDate,
      travelerCount: Number(travelerCount),
      tripType,
      budget: Number(budget),
      status: 'NEW',
      leadScore: 78,
      assignedEmployeeId: assignedUser.id,
      assignedEmployeeName: assignedUser.name,
      priority,
      lastContactAt: new Date().toISOString(),
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      notes: notes || 'New inquiry logged by sales team.',
      keyInterests: [destination, tripType]
    });

    onClose();
  };

  return (
    <div id="create-lead-modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="create-lead-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F0A608] text-slate-950 flex items-center justify-center font-bold">
              <Flame className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">Create New Travel Lead</h2>
              <p className="text-xs text-slate-400">Register new inbound customer requirement for Kashmir/Ladakh tour</p>
            </div>
          </div>
          <button id="close-create-lead-modal" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[75vh] overflow-y-auto space-y-4 text-xs">
          {/* Customer Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer / Group Name *</label>
              <input
                id="lead-customer-name"
                required
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Sahil Kapoor"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Phone Number *</label>
              <input
                id="lead-customer-phone"
                required
                type="text"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Destination</label>
              <select
                id="lead-destination-select"
                value={destination}
                onChange={(e) => setDestination(e.target.value as DestinationRegion)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              >
                <option value="Kashmir">Kashmir (Srinagar, Gulmarg, Pahalgam)</option>
                <option value="Ladakh">Ladakh (Leh, Nubra, Pangong)</option>
                <option value="Jammu">Jammu & Vaishno Devi / Patnitop</option>
                <option value="Himachal">Himachal (Manali, Shimla)</option>
                <option value="Kerala">Kerala</option>
                <option value="Goa">Goa</option>
                <option value="Golden Triangle">Golden Triangle</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Trip Type</label>
              <select
                id="lead-trip-type-select"
                value={tripType}
                onChange={(e) => setTripType(e.target.value as TripType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              >
                <option value="Honeymoon">Honeymoon</option>
                <option value="Family Vacation">Family Vacation</option>
                <option value="Luxury Houseboat & Resort">Luxury Houseboat & Resort</option>
                <option value="Adventure & Trekking">Adventure & Trekking</option>
                <option value="Corporate Group">Corporate Group</option>
                <option value="Pilgrimage">Pilgrimage</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Travelers (Pax)</label>
              <input
                id="lead-traveler-count"
                type="number"
                min="1"
                max="100"
                value={travelerCount}
                onChange={(e) => setTravelerCount(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Travel Start Date</label>
              <input
                id="lead-start-date"
                type="date"
                value={travelStartDate}
                onChange={(e) => setTravelStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Travel End Date</label>
              <input
                id="lead-end-date"
                type="date"
                value={travelEndDate}
                onChange={(e) => setTravelEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Budget (₹ INR)</label>
              <input
                id="lead-budget-input"
                type="number"
                step="1000"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Source Platform</label>
              <select
                id="lead-source-platform"
                value={sourcePlatform}
                onChange={(e) => setSourcePlatform(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              >
                <option value="WhatsApp Inbound">WhatsApp Inbound</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Instagram Direct">Instagram Direct</option>
                <option value="Website Form">Website Form</option>
                <option value="Referral">Referral</option>
                <option value="Direct Call">Direct Call</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Assign Lead To</label>
              <select
                id="lead-assignee-select"
                value={assignedEmployeeId}
                onChange={(e) => setAssignedEmployeeId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              >
                {PRESET_USERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Priority</label>
              <select
                id="lead-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH (Hot Lead)</option>
                <option value="URGENT">URGENT (Immediate Close)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Requirement Notes & Specific Preferences</label>
            <textarea
              id="lead-notes-input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Requested private houseboat in Nigeen lake, vegetarian dining, Gulmarg gondola tickets assistance..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              id="cancel-create-lead-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              id="submit-create-lead-btn"
              type="submit"
              className="px-5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white font-bold rounded-lg shadow-sm"
            >
              Create Lead Record
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

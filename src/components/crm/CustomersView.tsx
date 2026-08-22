import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { Customer, CustomerType } from '../../types';
import { Users, Plus, Search, Phone, Mail, MapPin, Sparkles, X, ChevronRight } from 'lucide-react';

export const CustomersView: React.FC = () => {
  const { customers, createCustomer } = useData();
  const [searchQuery, setSearchQuery] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'B2C' | 'B2B'>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // New customer form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('Mumbai');
  const [customerType, setCustomerType] = useState<CustomerType>('B2C');
  const [preferences, setPreferences] = useState('Luxury Houseboat, Gulmarg Skiing, Vegetarian Wazwan');
  const [notes, setNotes] = useState('');

  const filteredCustomers = customers.filter((c) => {
    const matchQuery =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchType = customerTypeFilter === 'ALL' || c.customerType === customerTypeFilter;
    return matchQuery && matchType;
  });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    await createCustomer({
      name,
      phone,
      whatsApp: phone,
      email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      city,
      customerType,
      preferences: preferences.split(',').map((p) => p.trim()).filter(Boolean),
      notes: notes || 'Registered in Booking Bridge customer directory.',
    });

    setIsCreateOpen(false);
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
  };

  return (
    <div id="customers-view" className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Customer Directory</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {customers.length} Accounts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Central client profiles, travel preferences, and lifetime booking value</p>
        </div>

        <button
          id="create-customer-trigger"
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="search-customers-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name, phone, city..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#7056EE] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center space-x-2">
          {(['ALL', 'B2C', 'B2B'] as const).map((type) => (
            <button
              key={type}
              id={`filter-cust-type-${type}`}
              onClick={() => setCustomerTypeFilter(type)}
              className={`px-3 py-2 rounded-xl font-bold transition-colors ${
                customerTypeFilter === type
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type === 'ALL' ? 'All Customers' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((cust) => (
          <div
            key={cust.id}
            id={`customer-card-${cust.id}`}
            onClick={() => setSelectedCustomer(cust)}
            className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-[#7056EE] shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-3 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                    {cust.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 truncate max-w-[180px]">{cust.name}</h3>
                    <div className="flex items-center space-x-1 text-[11px] text-slate-500">
                      <MapPin className="w-3 h-3 text-slate-400" />
                      <span>{cust.city}</span>
                    </div>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                  cust.customerType === 'B2B' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                }`}>
                  {cust.customerType}
                </span>
              </div>

              <div className="space-y-1 text-xs text-slate-600 pt-1">
                <p className="flex items-center space-x-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{cust.phone}</span>
                </p>
                <p className="flex items-center space-x-1.5 truncate">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">{cust.email}</span>
                </p>
              </div>

              {cust.preferences && cust.preferences.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {cust.preferences.slice(0, 2).map((pref, pIdx) => (
                    <span key={pIdx} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md truncate max-w-[180px]">
                      {pref}
                    </span>
                  ))}
                  {cust.preferences.length > 2 && (
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                      +{cust.preferences.length - 2}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px]">
                {cust.totalBookings} Bookings
              </span>
              <span className="font-bold text-slate-900">
                LTV: ₹{(cust.lifetimeValue / 1000).toFixed(0)}k
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Create Customer Modal */}
      {isCreateOpen && (
        <div id="create-customer-backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div id="create-customer-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-[#F0A608]" />
                <h3 className="text-sm font-bold text-white">Create Customer Profile</h3>
              </div>
              <button id="close-create-cust-btn" onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vikramaditya Oberoi"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    required
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vikram@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City / Region</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#7056EE]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer Category</label>
                  <select
                    value={customerType}
                    onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="B2C">B2C (Individual Traveler)</option>
                    <option value="B2B">B2B (Corporate / Travel Agent)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Travel Preferences (comma-separated)</label>
                <input
                  type="text"
                  value={preferences}
                  onChange={(e) => setPreferences(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Internal Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special food preferences, hotel tiers, past travel habits..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#7056EE] text-white font-bold rounded-lg"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

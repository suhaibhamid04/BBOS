import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { Lead, LeadStatus, DestinationRegion, Priority } from '../../types';
import {
  Flame,
  Plus,
  Search,
  Filter,
  Kanban,
  Table as TableIcon,
  Phone,
  Sparkles,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  MoreVertical,
  ChevronRight,
  UserCheck
} from 'lucide-react';
import { CreateLeadModal } from './CreateLeadModal';
import { LeadDetailDrawer } from './LeadDetailDrawer';

interface LeadsViewProps {
  onNavigate?: (section: any, targetId?: string) => void;
}

export const LeadsView: React.FC<LeadsViewProps> = ({ onNavigate }) => {
  const { leads, updateLeadStatus } = useData();
  const { currentUser, permissions } = useAuth();

  const [viewMode, setViewMode] = useState<'TABLE' | 'KANBAN'>('TABLE');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDestination, setSelectedDestination] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const statuses: LeadStatus[] = [
    'NEW',
    'CONTACTED',
    'QUALIFIED',
    'QUOTE_SENT',
    'NEGOTIATION',
    'BOOKED',
    'LOST',
    'NURTURE',
  ];

  // RBAC lead scope filter: If user is Sales Executive and leadAccessScope is ASSIGNED_ONLY
  const scopedLeads = useMemo(() => {
    let result = leads;
    if (permissions.leadAccessScope === 'ASSIGNED_ONLY') {
      result = result.filter(l => l.assignedEmployeeId === currentUser.id);
    }
    return result;
  }, [leads, permissions, currentUser]);

  const filteredLeads = useMemo(() => {
    return scopedLeads.filter((lead) => {
      const matchesSearch =
        lead.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.customerPhone.includes(searchQuery) ||
        (lead.customerEmail && lead.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesDest = selectedDestination === 'ALL' || lead.destination === selectedDestination;
      const matchesStatus = selectedStatus === 'ALL' || lead.status === selectedStatus;

      return matchesSearch && matchesDest && matchesStatus;
    });
  }, [scopedLeads, searchQuery, selectedDestination, selectedStatus]);

  const getStatusColor = (status: LeadStatus) => {
    switch (status) {
      case 'NEW':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'CONTACTED':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'QUALIFIED':
        return 'bg-amber-100 text-amber-900 border-amber-200';
      case 'QUOTE_SENT':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'NEGOTIATION':
        return 'bg-orange-100 text-orange-900 border-orange-200';
      case 'BOOKED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'LOST':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'NURTURE':
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-rose-500 text-white';
      case 'HIGH':
        return 'bg-[#F0A608] text-slate-950 font-bold';
      case 'MEDIUM':
        return 'bg-amber-100 text-amber-900';
      case 'LOW':
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div id="leads-view" className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Leads & Inquiries</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#7056EE]/10 text-[#7056EE]">
              {filteredLeads.length} active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {permissions.leadAccessScope === 'ASSIGNED_ONLY'
              ? `Showing leads assigned directly to ${currentUser.name}`
              : 'Managing complete high-intent pipeline across Kashmir, Ladakh & India'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* View Toggle */}
          <div className="bg-slate-200/80 p-0.5 rounded-xl flex items-center text-xs">
            <button
              id="view-table-mode"
              onClick={() => setViewMode('TABLE')}
              className={`p-1.5 px-3 rounded-lg font-medium transition-all flex items-center space-x-1 ${
                viewMode === 'TABLE' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
            <button
              id="view-kanban-mode"
              onClick={() => setViewMode('KANBAN')}
              className={`p-1.5 px-3 rounded-lg font-medium transition-all flex items-center space-x-1 ${
                viewMode === 'KANBAN' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pipeline</span>
            </button>
          </div>

          <button
            id="create-lead-trigger"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create Lead</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="search-leads-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client name, destination, phone..."
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#7056EE] focus:outline-hidden"
          />
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
          <select
            id="filter-destination"
            value={selectedDestination}
            onChange={(e) => setSelectedDestination(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-medium text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">All Destinations</option>
            <option value="Kashmir">Kashmir</option>
            <option value="Ladakh">Ladakh</option>
            <option value="Jammu">Jammu</option>
            <option value="Himachal">Himachal</option>
          </select>

          <select
            id="filter-status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-xl bg-slate-50 font-medium text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">All Stages</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* View Content: Table or Kanban */}
      {viewMode === 'TABLE' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Customer & Group</th>
                  <th className="py-3.5 px-4">Destination & Dates</th>
                  <th className="py-3.5 px-4">Budget & Pax</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Score</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No matching leads found.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      id={`lead-row-${lead.id}`}
                      onClick={() => setSelectedLeadId(lead.id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="font-bold text-slate-900">{lead.customerName}</div>
                          {lead.isDemo && (
                            <span className="text-[9px] px-1 py-0.2 bg-amber-100 text-amber-900 rounded font-semibold">
                              DEMO
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center space-x-2 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{lead.customerPhone}</span>
                          <span>•</span>
                          <span className="text-slate-400">{lead.sourcePlatform}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">{lead.destination}</span>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {lead.tripType} ({lead.travelStartDate.substring(5)})
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">₹{lead.budget.toLocaleString('en-IN')}</div>
                        <div className="text-[11px] text-slate-500">{lead.travelerCount} Travelers</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                            lead.leadScore >= 80 ? 'bg-emerald-100 text-emerald-800' :
                            lead.leadScore >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {lead.leadScore}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${getPriorityColor(lead.priority)}`}>
                            {lead.priority}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1.5">
                          <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                            {lead.assignedEmployeeName.charAt(0)}
                          </div>
                          <span className="text-xs text-slate-700 truncate max-w-[120px]">{lead.assignedEmployeeName}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            id={`open-lead-btn-${lead.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLeadId(lead.id);
                            }}
                            className="p-1.5 text-slate-400 hover:text-[#7056EE] rounded-lg hover:bg-slate-100"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kanban Pipeline View */
        <div className="overflow-x-auto pb-4">
          <div className="flex space-x-4 min-w-[1200px]">
            {statuses.map((status) => {
              const columnLeads = filteredLeads.filter((l) => l.status === status);
              const columnValue = columnLeads.reduce((sum, l) => sum + l.budget, 0);

              return (
                <div
                  key={status}
                  id={`kanban-col-${status.toLowerCase()}`}
                  className="w-72 bg-slate-200/50 rounded-2xl p-3 flex flex-col space-y-3 shrink-0 border border-slate-200/80"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-bold text-slate-800">{status}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white text-slate-600 font-bold">
                        {columnLeads.length}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      ₹{(columnValue / 1000).toFixed(0)}k
                    </span>
                  </div>

                  <div className="flex-1 space-y-2.5 min-h-[300px]">
                    {columnLeads.map((lead) => (
                      <div
                        key={lead.id}
                        id={`kanban-card-${lead.id}`}
                        onClick={() => setSelectedLeadId(lead.id)}
                        className="bg-white p-3.5 rounded-xl border border-slate-200 hover:border-[#7056EE] shadow-2xs hover:shadow-xs cursor-pointer transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <span className="text-xs font-bold text-slate-900 leading-tight">{lead.customerName}</span>
                          <span className={`text-[9px] font-black px-1.5 py-0.2 rounded ${getPriorityColor(lead.priority)}`}>
                            {lead.priority}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 space-y-0.5">
                          <p className="font-semibold text-[#7056EE]">{lead.destination} • {lead.tripType}</p>
                          <p>₹{lead.budget.toLocaleString('en-IN')} • {lead.travelerCount} Pax</p>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[10px]">
                          <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                            Score: {lead.leadScore}
                          </span>
                          <span className="text-slate-400">{lead.assignedEmployeeName.split(' ')[0]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <CreateLeadModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onNavigate={onNavigate}
      />
    </div>
  );
};

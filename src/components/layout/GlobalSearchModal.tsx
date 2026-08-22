import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Search, Flame, Users, Building2, CheckSquare, FileText, X, ArrowRight, Compass } from 'lucide-react';
import { NavSectionKey } from './Sidebar';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: NavSectionKey, targetId?: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const { leads, customers, companies, tasks, quotes } = useData();
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();

    const results: Array<{
      id: string;
      title: string;
      subtitle: string;
      category: 'LEAD' | 'CUSTOMER' | 'COMPANY' | 'TASK' | 'QUOTE';
      section: NavSectionKey;
    }> = [];

    // Search Leads
    leads.forEach((l) => {
      if (
        l.customerName.toLowerCase().includes(q) ||
        l.destination.toLowerCase().includes(q) ||
        l.tripType.toLowerCase().includes(q) ||
        l.notes.toLowerCase().includes(q)
      ) {
        results.push({
          id: l.id,
          title: l.customerName,
          subtitle: `${l.destination} • ${l.tripType} (₹${l.budget.toLocaleString('en-IN')}) [${l.status}]`,
          category: 'LEAD',
          section: 'leads',
        });
      }
    });

    // Search Customers
    customers.forEach((c) => {
      if (
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
      ) {
        results.push({
          id: c.id,
          title: c.name,
          subtitle: `${c.city} • ${c.phone} (${c.customerType})`,
          category: 'CUSTOMER',
          section: 'customers',
        });
      }
    });

    // Search Companies
    companies.forEach((comp) => {
      if (
        comp.name.toLowerCase().includes(q) ||
        comp.contactPerson.toLowerCase().includes(q) ||
        comp.city.toLowerCase().includes(q)
      ) {
        results.push({
          id: comp.id,
          title: comp.name,
          subtitle: `${comp.industry} • Contact: ${comp.contactPerson}`,
          category: 'COMPANY',
          section: 'companies',
        });
      }
    });

    // Search Tasks
    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) {
        results.push({
          id: t.id,
          title: t.title,
          subtitle: `Assigned: ${t.assignedToName} • Due: ${new Date(t.dueAt).toLocaleDateString()}`,
          category: 'TASK',
          section: 'tasks',
        });
      }
    });

    // Search Quotes
    quotes.forEach((quo) => {
      if (quo.customerName.toLowerCase().includes(q) || quo.destination.toLowerCase().includes(q)) {
        results.push({
          id: quo.id,
          title: `Quote for ${quo.customerName}`,
          subtitle: `${quo.destination} • Final: ₹${quo.finalAmount.toLocaleString('en-IN')} [${quo.status}]`,
          category: 'QUOTE',
          section: 'quotes',
        });
      }
    });

    return results.slice(0, 10);
  }, [query, leads, customers, companies, tasks, quotes]);

  if (!isOpen) return null;

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'LEAD':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F0A608]/15 text-amber-900 flex items-center space-x-1"><Flame className="w-3 h-3 text-[#F0A608]" /> <span>Lead</span></span>;
      case 'CUSTOMER':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 flex items-center space-x-1"><Users className="w-3 h-3 text-blue-600" /> <span>Customer</span></span>;
      case 'COMPANY':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center space-x-1"><Building2 className="w-3 h-3 text-purple-600" /> <span>Company</span></span>;
      case 'TASK':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center space-x-1"><CheckSquare className="w-3 h-3 text-emerald-600" /> <span>Task</span></span>;
      case 'QUOTE':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 flex items-center space-x-1"><FileText className="w-3 h-3 text-indigo-600" /> <span>Quote</span></span>;
      default:
        return null;
    }
  };

  return (
    <div id="global-search-backdrop" className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/60 backdrop-blur-xs">
      <div id="global-search-modal" className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-slate-200 flex items-center space-x-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            id="global-search-input"
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search leads, customers, packages, quotes, companies, tasks..."
            className="w-full text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
          />
          {query && (
            <button id="clear-search-query" onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <button id="close-search-modal" onClick={onClose} className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded">
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2">
          {query.trim() === '' ? (
            <div className="p-6 text-center text-slate-400 space-y-2">
              <Compass className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs">Type a customer name, destination, phone number, or quote amount.</p>
              <div className="flex justify-center space-x-2 pt-2">
                <span className="text-[11px] bg-slate-100 px-2 py-1 rounded text-slate-600">e.g. Rohit Sharma</span>
                <span className="text-[11px] bg-slate-100 px-2 py-1 rounded text-slate-600">e.g. Kashmir</span>
                <span className="text-[11px] bg-slate-100 px-2 py-1 rounded text-slate-600">e.g. Ladakh</span>
              </div>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-6 text-center text-slate-400">
              <p className="text-xs">No records found matching "{query}".</p>
            </div>
          ) : (
            <div className="space-y-1">
              {searchResults.map((item) => (
                <button
                  key={`${item.category}-${item.id}`}
                  id={`search-result-${item.id}`}
                  onClick={() => {
                    onNavigate(item.section, item.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors text-left group border border-transparent hover:border-slate-200"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div>{getCategoryBadge(item.category)}</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                      <p className="text-[11px] text-slate-500 truncate">{item.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

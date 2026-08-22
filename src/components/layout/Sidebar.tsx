import React, { useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  CheckSquare,
  Bell,
  Users,
  Building2,
  MessageSquare,
  GitPullRequest,
  FileText,
  Sparkles,
  TrendingUp,
  Calendar,
  Megaphone,
  Palette,
  BarChart3,
  PieChart,
  LineChart,
  UserCheck,
  ShieldCheck,
  Cpu,
  Boxes,
  ShieldAlert,
  History,
  Settings,
  ChevronDown,
  ChevronRight,
  Flame,
  Plane,
  Compass
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';

export type NavSectionKey =
  | 'dashboard'
  | 'ai-command'
  | 'tasks'
  | 'notifications'
  | 'leads'
  | 'customers'
  | 'companies'
  | 'conversations'
  | 'sales-pipeline'
  | 'quotes'
  | 'sales-ai'
  | 'marketing-strategy'
  | 'content-calendar'
  | 'campaigns'
  | 'marketing-ai'
  | 'analytics-overview'
  | 'analytics-sales'
  | 'analytics-marketing'
  | 'employees'
  | 'roles-permissions'
  | 'ai-permissions'
  | 'integrations'
  | 'approvals'
  | 'audit-logs'
  | 'settings';

interface SidebarProps {
  activeNav: NavSectionKey;
  onNavigate: (section: NavSectionKey) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavGroup {
  title: string;
  items: {
    key: NavSectionKey;
    label: string;
    icon: React.ElementType;
    badge?: number | string;
    badgeColor?: string;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeNav,
  onNavigate,
  isOpen,
  onClose
}) => {
  const { currentUser, permissions } = useAuth();
  const { tasks, approvals, leads } = useData();

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'COMMAND CENTER': true,
    'CRM': true,
    'SALES': true,
    'MARKETING': true,
    'ANALYTICS': false,
    'ADMIN': true,
  });

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const pendingTasksCount = tasks.filter(t => t.status !== 'COMPLETED').length;
  const pendingApprovalsCount = approvals.filter(a => a.status === 'PENDING').length;
  const hotLeadsCount = leads.filter(l => l.priority === 'HIGH' || l.priority === 'URGENT').length;

  const navGroups: NavGroup[] = [
    {
      title: 'COMMAND CENTER',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { key: 'ai-command', label: 'AI Command Center', icon: Bot, badge: 'Live AI', badgeColor: 'bg-[#7056EE]/15 text-[#7056EE]' },
        { key: 'tasks', label: 'Tasks', icon: CheckSquare, badge: pendingTasksCount > 0 ? pendingTasksCount : undefined, badgeColor: 'bg-amber-100 text-amber-800' },
        { key: 'notifications', label: 'Notifications', icon: Bell },
      ]
    },
    {
      title: 'CRM',
      items: [
        { key: 'leads', label: 'Leads', icon: Flame, badge: hotLeadsCount > 0 ? `${hotLeadsCount} hot` : undefined, badgeColor: 'bg-[#F0A608]/15 text-amber-900 font-semibold' },
        { key: 'customers', label: 'Customers', icon: Users },
        { key: 'companies', label: 'Companies', icon: Building2 },
        { key: 'conversations', label: 'Conversations', icon: MessageSquare },
      ]
    },
    {
      title: 'SALES',
      items: [
        { key: 'sales-pipeline', label: 'Sales Pipeline', icon: GitPullRequest },
        { key: 'quotes', label: 'Quotes', icon: FileText },
        { key: 'sales-ai', label: 'Sales AI', icon: Sparkles, badge: 'Agent', badgeColor: 'bg-[#7056EE]/15 text-[#7056EE]' },
      ]
    },
    {
      title: 'MARKETING',
      items: [
        { key: 'marketing-strategy', label: 'Strategy', icon: TrendingUp },
        { key: 'content-calendar', label: 'Content Calendar', icon: Calendar },
        { key: 'campaigns', label: 'Campaigns', icon: Megaphone },
        { key: 'marketing-ai', label: 'Marketing AI', icon: Palette, badge: 'GenAI', badgeColor: 'bg-[#F0A608]/15 text-amber-900' },
      ]
    },
    {
      title: 'ANALYTICS',
      items: [
        { key: 'analytics-overview', label: 'Business Overview', icon: BarChart3 },
        { key: 'analytics-sales', label: 'Sales Analytics', icon: LineChart },
        { key: 'analytics-marketing', label: 'Marketing Analytics', icon: PieChart },
      ]
    },
    {
      title: 'ADMIN',
      items: [
        { key: 'employees', label: 'Employees', icon: UserCheck },
        { key: 'roles-permissions', label: 'Roles & Permissions', icon: ShieldCheck },
        { key: 'ai-permissions', label: 'AI Permissions', icon: Cpu },
        { key: 'integrations', label: 'Integrations', icon: Boxes },
        { key: 'approvals', label: 'Approval Center', icon: ShieldAlert, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined, badgeColor: 'bg-rose-500 text-white font-bold' },
        { key: 'audit-logs', label: 'Audit Logs', icon: History },
        { key: 'settings', label: 'Settings', icon: Settings },
      ]
    }
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          id="sidebar-backdrop"
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white text-slate-900 flex flex-col border-r border-slate-200 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg bg-[#F0A608] flex items-center justify-center font-bold text-white text-xs shadow-xs">
            BB
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-lg tracking-tight text-slate-900 block leading-tight">
              Booking Bridge <span className="text-[#7056EE]">OS</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide">Himalayan Ops</span>
          </div>
        </div>

        {/* Scrollable Navigation List */}
        <nav className="flex-1 px-4 py-4 space-y-4 overflow-y-auto custom-scrollbar select-none">
          {navGroups.map((group) => {
            const isExpanded = expandedGroups[group.title] !== false;
            return (
              <div key={group.title} className="space-y-1">
                <button
                  id={`nav-group-${group.title.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span>{group.title}</span>
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-slate-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="space-y-0.5 pt-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeNav === item.key;
                      return (
                        <button
                          key={item.key}
                          id={`nav-item-${item.key}`}
                          onClick={() => {
                            onNavigate(item.key);
                            onClose();
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-slate-100 text-[#7056EE] font-semibold'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#7056EE]' : 'text-slate-400'}`} />
                            <span className="truncate">{item.label}</span>
                          </div>
                          {item.badge !== undefined && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap leading-none shrink-0 ${
                                isActive ? 'bg-[#7056EE]/15 text-[#7056EE]' : item.badgeColor || 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Current Active Persona Footer */}
        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-100">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-2xs">
              <div className="w-full h-full bg-gradient-to-br from-[#7056EE] to-[#F0A608] flex items-center justify-center text-white font-bold text-xs">
                {currentUser.name.charAt(0)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                <p className="text-[10px] text-slate-500 font-medium truncate">{currentUser.role}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

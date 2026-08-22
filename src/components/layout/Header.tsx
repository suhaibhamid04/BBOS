import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import {
  Menu,
  Search,
  Bot,
  Bell,
  Sparkles,
  Shield,
  RefreshCw,
  Trash2,
  ChevronDown,
  Layers
} from 'lucide-react';
import { NavSectionKey } from './Sidebar';

interface HeaderProps {
  onToggleSidebar: () => void;
  onOpenSearch: () => void;
  onOpenAiDrawer: () => void;
  onOpenRoleSwitcher: () => void;
  onNavigate: (section: NavSectionKey) => void;
  activeNavTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  onOpenSearch,
  onOpenAiDrawer,
  onOpenRoleSwitcher,
  onNavigate,
  activeNavTitle,
}) => {
  const { currentUser, isFirebaseAuthenticated } = useAuth();
  const { seedDemoData, clearDemoData, approvals, tasks } = useData();
  const [showDemoMenu, setShowDemoMenu] = useState(false);

  const pendingApprovalsCount = approvals.filter(a => a.status === 'PENDING').length;
  const pendingTasksCount = tasks.filter(t => t.status !== 'COMPLETED').length;

  return (
    <header
      id="app-header"
      className="sticky top-0 z-30 bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 lg:px-8 shadow-xs"
    >
      {/* Left section: Hamburger (Mobile) + Current Page Breadcrumb */}
      <div className="flex items-center space-x-3">
        <button
          id="toggle-sidebar-button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-400 hidden sm:inline uppercase tracking-wider">Booking Bridge OS</span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight capitalize">
            {activeNavTitle}
          </h1>
        </div>
      </div>

      {/* Middle & Right Section: Global Search, Ask AI, Demo Data Menu, Role Switcher */}
      <div className="flex items-center space-x-3">
        {/* Global Search Button */}
        <button
          id="global-search-trigger"
          onClick={onOpenSearch}
          className="flex items-center gap-3 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 rounded-lg text-xs font-medium transition-colors border border-transparent"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden md:inline">Search customers, leads, or tasks...</span>
          <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-white border border-slate-200 rounded text-slate-500 shadow-2xs">
            ⌘K
          </kbd>
        </button>

        {/* Global AI Assistant Trigger */}
        <button
          id="global-ai-assistant-trigger"
          onClick={onOpenAiDrawer}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#7056EE] hover:bg-[#5e43dc] text-white rounded-lg text-xs sm:text-sm font-medium transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-white" />
          <span>Ask AI Bridge</span>
        </button>

        {/* Demo Data Management Dropdown */}
        <div className="relative">
          <button
            id="demo-data-menu-trigger"
            onClick={() => setShowDemoMenu(!showDemoMenu)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-[#F0A608]" />
            <span className="hidden xl:inline">Demo</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showDemoMenu && (
            <div
              id="demo-data-dropdown"
              className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 text-xs z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="font-semibold text-slate-800">Sample Travel Data</p>
                <p className="text-[11px] text-slate-500">Kashmir & Ladakh tour records</p>
              </div>
              <button
                id="seed-demo-data-button"
                onClick={() => {
                  seedDemoData();
                  setShowDemoMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center space-x-2"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#7056EE]" />
                <span>Re-seed Sample Data</span>
              </button>
              <button
                id="clear-demo-data-button"
                onClick={() => {
                  clearDemoData();
                  setShowDemoMenu(false);
                }}
                className="w-full px-3 py-2 text-left text-rose-600 hover:bg-rose-50 flex items-center space-x-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Sample Records</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Icon with pending count */}
        <button
          id="header-notifications-button"
          onClick={() => onNavigate('notifications')}
          className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {(pendingApprovalsCount > 0 || pendingTasksCount > 0) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          )}
        </button>

        {/* Persona Switcher / Active Profile Pill */}
        <button
          id="header-role-switcher-trigger"
          onClick={onOpenRoleSwitcher}
          className="flex items-center space-x-2 pl-1.5 pr-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-left"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7056EE] to-[#F0A608] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
            {currentUser.name.charAt(0)}
          </div>
          <div className="hidden md:block text-left">
            <span className="text-xs font-bold text-slate-900 leading-tight block">{currentUser.name}</span>
            <p className="text-[10px] font-semibold text-[#7056EE] leading-tight">{currentUser.role}</p>
          </div>
        </button>
      </div>
    </header>
  );
};

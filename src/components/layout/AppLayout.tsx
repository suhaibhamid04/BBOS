import React, { useState, useEffect } from 'react';
import { Sidebar, NavSectionKey } from './Sidebar';
import { Header } from './Header';
import { GlobalSearchModal } from './GlobalSearchModal';
import { GlobalAiAssistantDrawer } from './GlobalAiAssistantDrawer';
import { RoleSwitcherModal } from './RoleSwitcherModal';
import { Sparkles } from 'lucide-react';

interface AppLayoutProps {
  activeNav: NavSectionKey;
  onNavigate: (section: NavSectionKey, targetId?: string) => void;
  children: React.ReactNode;
}

const SECTION_TITLES: Record<NavSectionKey, string> = {
  dashboard: 'Command Center Dashboard',
  'ai-command': 'AI Command Center',
  tasks: 'Operational Tasks',
  notifications: 'System Notifications',
  'sales-workspace': 'My Workspace',
  'lead-detail': 'Lead Detail',
  leads: 'Leads Management',
  customers: 'Customer Directory',
  companies: 'Corporate & Agency Accounts',
  conversations: 'Conversations & Omnichannel Chat',
  'sales-pipeline': 'Sales Pipeline Kanban',
  quotes: 'Travel Quotes & Itineraries',
  'sales-ai': 'Sales AI Agent & Copilot',
  'marketing-strategy': 'Marketing Strategy & Pillars',
  'content-calendar': 'Content Calendar',
  campaigns: 'Ad Campaigns',
  'marketing-ai': 'Marketing GenAI Engine',
  'analytics-overview': 'Business Overview Analytics',
  'analytics-sales': 'Sales Performance Analytics',
  'analytics-marketing': 'Marketing ROI Analytics',
  trips: 'Trip Builder',
  bookings: 'Bookings Registry',
  'operations-dashboard': 'Operations Dashboard',
  vouchers: 'Vouchers',
  employees: 'Team & Employee Directory',
  'roles-permissions': 'Role-Based Access Control Matrix',
  'ai-permissions': 'AI Access & Permissions',
  'integrations': 'App Integrations',
  'approvals': 'Approval Center',
  'audit-logs': 'System Audit Logs',
  'settings': 'System Settings',
  'accommodation': 'Accommodation Inventory',
  'transport': 'Transport Management',
  'activities': 'Activities Inventory'
};

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeNav,
  onNavigate,
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  // Keyboard shortcut listener (Cmd/Ctrl + K for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-slate-900 flex flex-col antialiased font-sans">
      {/* Navigation Sidebar */}
      <Sidebar
        activeNav={activeNav}
        onNavigate={onNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        <Header
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenAiDrawer={() => setAiDrawerOpen(true)}
          onOpenRoleSwitcher={() => setRoleSwitcherOpen(true)}
          onNavigate={onNavigate}
          activeNavTitle={SECTION_TITLES[activeNav] || activeNav}
        />

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Floating Action Button (Ask AI Bridge) */}
      <button
        id="floating-ai-bridge-button"
        onClick={() => setAiDrawerOpen(true)}
        aria-label="Open AI Assistant"
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#F0A608] hover:bg-[#d89405] text-white rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform z-40"
      >
        <Sparkles className="w-6 h-6 text-white" />
      </button>

      {/* Global Modals and Drawers */}
      <GlobalSearchModal
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={onNavigate}
      />

      <GlobalAiAssistantDrawer
        isOpen={aiDrawerOpen}
        onClose={() => setAiDrawerOpen(false)}
        onNavigate={onNavigate}
      />

      <RoleSwitcherModal
        isOpen={roleSwitcherOpen}
        onClose={() => setRoleSwitcherOpen(false)}
      />
    </div>
  );
};

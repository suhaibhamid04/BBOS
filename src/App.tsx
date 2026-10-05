import React, { useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { AppLayout } from './components/layout/AppLayout';
import { NavSectionKey } from './components/layout/Sidebar';

// Views
import { CommandCenterDashboard } from './components/dashboard/CommandCenterDashboard';
import { AiCommandCenterView } from './components/command/AiCommandCenterView';
import { LeadsView } from './components/crm/LeadsView';
import { CustomersView } from './components/crm/CustomersView';
import { CompaniesView } from './components/crm/CompaniesView';
import { ConversationsView } from './components/crm/ConversationsView';
import { SalesPipelineView } from './components/sales/SalesPipelineView';
import { MyWorkspaceView } from './components/sales/MyWorkspace';
import { LeadDetailView } from './components/crm/LeadDetailView';
import { QuotesView } from './components/sales/QuotesView';
import { SalesAiView } from './components/sales/SalesAiView';
import { TripBuilderView } from './components/trips/TripBuilderView';
import { BookingsView } from './components/trips/BookingsView';
import { MarketingStrategyView } from './components/marketing/MarketingStrategyView';
import { ContentCalendarView } from './components/marketing/ContentCalendarView';
import { CampaignsView } from './components/marketing/CampaignsView';
import { MarketingAiView } from './components/marketing/MarketingAiView';
import { AnalyticsOverviewView } from './components/analytics/AnalyticsOverviewView';
import { EmployeesView } from './components/governance/EmployeesView';
import { RolesPermissionsView } from './components/governance/RolesPermissionsView';
import { AiPermissionsView } from './components/governance/AiPermissionsView';
import { ApprovalsView } from './components/governance/ApprovalsView';
import { AuditLogsView } from './components/governance/AuditLogsView';
import { TasksView } from './components/operations/TasksView';
import { NotificationsView } from './components/operations/NotificationsView';
import { OperationsDashboard } from './components/operations/OperationsDashboard';
import { VouchersView } from './components/operations/VouchersView';
import { IntegrationsView } from './components/operations/IntegrationsView';
import { SettingsView } from './components/operations/SettingsView';
import { AccommodationInventoryView } from './components/inventory/AccommodationInventoryView';
import { TransportInventoryView } from './components/inventory/TransportInventoryView';
import { ActivityInventoryView } from './components/inventory/ActivityInventoryView';
import { SupplierPayablesView } from './components/finance/SupplierPayablesView';
import { LeadDistributionSettingsView } from './components/governance/LeadDistributionSettingsView';

interface BrowserRouteState {
  activeNav: NavSectionKey;
  targetId?: string;
}

function readBrowserRoute(): BrowserRouteState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const targetId = params.get('id') || undefined;
  if (view === 'lead-detail' && targetId) return { activeNav: 'lead-detail', targetId };
  if (view === 'sales-workspace') return { activeNav: 'sales-workspace' };
  return { activeNav: 'dashboard' };
}

function writeBrowserRoute(section: NavSectionKey, id?: string) {
  const url = new URL(window.location.href);
  if (section === 'lead-detail' && id) {
    url.searchParams.set('view', 'lead-detail');
    url.searchParams.set('id', id);
  } else if (section === 'sales-workspace') {
    url.searchParams.set('view', 'sales-workspace');
    url.searchParams.delete('id');
  } else {
    url.searchParams.delete('view');
    url.searchParams.delete('id');
  }
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

export function AppContent() {
  const [route, setRoute] = useState<BrowserRouteState>(() => readBrowserRoute());
  const { activeNav, targetId } = route;

  useEffect(() => {
    const handlePopState = () => setRoute(readBrowserRoute());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (section: NavSectionKey, id?: string) => {
    setRoute({ activeNav: section, targetId: id });
    writeBrowserRoute(section, id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderActiveView = () => {
    switch (activeNav) {
      case 'dashboard':
        return <CommandCenterDashboard onNavigate={handleNavigate} />;
      case 'ai-command':
        return <AiCommandCenterView onNavigate={handleNavigate} />;
      case 'sales-workspace':
        return <MyWorkspaceView onNavigate={handleNavigate} />;
      case 'lead-detail':
        return <LeadDetailView leadId={targetId!} onNavigate={handleNavigate} />;
      case 'leads':
        return <LeadsView onNavigate={handleNavigate} />;
      case 'customers':
        return <CustomersView />;
      case 'companies':
        return <CompaniesView />;
      case 'conversations':
        return <ConversationsView />;
      case 'sales-pipeline':
        return <SalesPipelineView />;
      case 'quotes':
        return <QuotesView initialQuoteId={targetId} onNavigate={handleNavigate} />;
      case 'sales-ai':
        return <SalesAiView />;
      case 'trips':
        return <TripBuilderView initialTripId={targetId} onNavigate={handleNavigate} />;
      case 'trips-new':
        return <TripBuilderView initialLeadId={targetId} onNavigate={handleNavigate} />;
      case 'bookings':
        return <BookingsView initialBookingId={targetId} />;
      case 'supplier-payables':
        return <SupplierPayablesView />;
      case 'marketing-strategy':
        return <MarketingStrategyView />;
      case 'content-calendar':
        return <ContentCalendarView />;
      case 'campaigns':
        return <CampaignsView />;
      case 'marketing-ai':
        return <MarketingAiView />;
      case 'analytics-overview':
      case 'analytics-sales':
      case 'analytics-marketing':
        return <AnalyticsOverviewView />;
      case 'employees':
        return <EmployeesView />;
      case 'lead-distribution':
        return <LeadDistributionSettingsView />;
      case 'roles-permissions':
        return <RolesPermissionsView />;
      case 'ai-permissions':
        return <AiPermissionsView />;
      case 'approvals':
        return <ApprovalsView onNavigate={handleNavigate} />;
      case 'audit-logs':
        return <AuditLogsView />;
      case 'tasks':
        return <TasksView />;
      case 'operations-dashboard':
        return <OperationsDashboard />;
      case 'vouchers':
        return <VouchersView />;
      case 'notifications':
        return <NotificationsView />;
      case 'integrations':
        return <IntegrationsView />;
      case 'settings':
        return <SettingsView />;
      case 'accommodation':
        return <AccommodationInventoryView />;
      case 'transport':
        return <TransportInventoryView />;
      case 'activities':
        return <ActivityInventoryView />;
      default:
        return <CommandCenterDashboard onNavigate={handleNavigate} />;
    }
  };

  return (
    <AppLayout activeNav={activeNav} onNavigate={handleNavigate}>
      {renderActiveView()}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </AuthProvider>
  );
}

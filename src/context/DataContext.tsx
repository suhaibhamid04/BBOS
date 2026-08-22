import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Lead,
  Customer,
  Company,
  Task,
  Conversation,
  Message,
  Quote,
  Booking,
  AiRecommendation,
  AiAction,
  ApprovalItem,
  AuditLog,
  TravelPackage,
  Integration,
  LeadStatus,
  SalesAiAnalysisResult,
  MarketingAiStrategyResult,
  ContentItem,
  MarketingPillar,
  AdCampaign,
  AiAgentConfig,
  MarketingAiGenerateResult
} from '../types';
import {
  INITIAL_PACKAGES,
  DEMO_CUSTOMERS,
  DEMO_COMPANIES,
  DEMO_LEADS,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
  DEMO_TASKS,
  DEMO_QUOTES,
  DEMO_BOOKINGS,
  DEMO_RECOMMENDATIONS,
  DEMO_ACTIONS,
  DEMO_APPROVALS,
  DEMO_AUDIT_LOGS,
  SYSTEM_INTEGRATIONS,
  DEMO_CONTENT_CALENDAR,
  DEMO_PILLARS,
  DEMO_CAMPAIGNS,
  DEMO_AI_AGENTS,
} from '../services/demoData';
import { useAuth } from './AuthContext';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

interface DataContextType {
  leads: Lead[];
  customers: Customer[];
  companies: Company[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Message[];
  quotes: Quote[];
  bookings: Booking[];
  packages: TravelPackage[];
  recommendations: AiRecommendation[];
  aiActions: AiAction[];
  approvals: ApprovalItem[];
  auditLogs: AuditLog[];
  integrations: Integration[];
  contentCalendar: ContentItem[];
  marketingPillars: MarketingPillar[];
  campaigns: AdCampaign[];
  aiAgents: AiAgentConfig[];

  // Lead actions
  createLead: (lead: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Lead>;
  updateLead: (id: string, updates: Partial<Lead>) => Promise<void>;
  updateLeadStatus: (id: string, status: LeadStatus) => Promise<void>;
  addLeadNote: (id: string, note: string) => Promise<void>;
  assignLead: (id: string, employeeId: string, employeeName: string) => Promise<void>;

  // Customer actions
  createCustomer: (customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalBookings' | 'lifetimeValue'>) => Promise<Customer>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;

  // Task actions
  createTask: (task: Omit<Task, 'id' | 'createdAt'>) => Promise<Task>;
  toggleTaskStatus: (id: string) => Promise<void>;

  // Content actions
  createContentItem: (item: Omit<ContentItem, 'id' | 'createdAt'>) => Promise<ContentItem>;

  // Conversation & Messaging actions
  sendMessage: (conversationId: string, content: string, senderType?: 'EMPLOYEE' | 'CUSTOMER' | 'AI' | 'SYSTEM') => Promise<void>;

  // Quote actions
  createQuote: (quote: Omit<Quote, 'id' | 'createdAt'>) => Promise<Quote>;

  // AI & Approvals
  approveAction: (approvalId: string, feedback?: string) => Promise<void>;
  rejectAction: (approvalId: string, feedback?: string) => Promise<void>;
  approveApproval: (approvalId: string, feedback?: string) => Promise<void>;
  rejectApproval: (approvalId: string, feedback?: string) => Promise<void>;
  submitForApproval: (item: Omit<ApprovalItem, 'id' | 'createdAt' | 'status'>) => Promise<ApprovalItem>;
  dismissRecommendation: (recId: string) => Promise<void>;
  acceptRecommendation: (recId: string) => Promise<void>;

  // AI Service Calls
  runSalesAiAnalysis: (leadId: string) => Promise<SalesAiAnalysisResult>;
  runMarketingStrategy: (destination: string, season: string, objective: string) => Promise<MarketingAiStrategyResult>;
  runMarketingAiGenerate: (params: { destination: string; audience: string; campaignGoal: string; format: string }) => Promise<MarketingAiGenerateResult>;
  askCommandCenterAi: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;
  queryCommandCenter: (question: string) => Promise<{ answer: string; suggestedActions: any[] }>;

  // Demo state controls
  seedDemoData: () => void;
  clearDemoData: () => void;
  isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // Local state with persistence cache
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem('bb_leads');
    return saved ? JSON.parse(saved) : DEMO_LEADS;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('bb_customers');
    return saved ? JSON.parse(saved) : DEMO_CUSTOMERS;
  });

  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('bb_companies');
    return saved ? JSON.parse(saved) : DEMO_COMPANIES;
  });

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('bb_tasks');
    return saved ? JSON.parse(saved) : DEMO_TASKS;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem('bb_conversations');
    return saved ? JSON.parse(saved) : DEMO_CONVERSATIONS;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('bb_messages');
    return saved ? JSON.parse(saved) : DEMO_MESSAGES;
  });

  const [quotes, setQuotes] = useState<Quote[]>(() => {
    const saved = localStorage.getItem('bb_quotes');
    return saved ? JSON.parse(saved) : DEMO_QUOTES;
  });

  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('bb_bookings');
    return saved ? JSON.parse(saved) : DEMO_BOOKINGS;
  });

  const [packages] = useState<TravelPackage[]>(INITIAL_PACKAGES);

  const [recommendations, setRecommendations] = useState<AiRecommendation[]>(() => {
    const saved = localStorage.getItem('bb_recommendations');
    return saved ? JSON.parse(saved) : DEMO_RECOMMENDATIONS;
  });

  const [aiActions, setAiActions] = useState<AiAction[]>(() => {
    const saved = localStorage.getItem('bb_actions');
    return saved ? JSON.parse(saved) : DEMO_ACTIONS;
  });

  const [approvals, setApprovals] = useState<ApprovalItem[]>(() => {
    const saved = localStorage.getItem('bb_approvals');
    return saved ? JSON.parse(saved) : DEMO_APPROVALS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('bb_audit_logs');
    return saved ? JSON.parse(saved) : DEMO_AUDIT_LOGS;
  });

  const [integrations] = useState<Integration[]>(SYSTEM_INTEGRATIONS);
  const [contentCalendar, setContentCalendar] = useState<ContentItem[]>(() => {
    const saved = localStorage.getItem('bb_content_calendar');
    return saved ? JSON.parse(saved) : DEMO_CONTENT_CALENDAR;
  });
  const [marketingPillars] = useState<MarketingPillar[]>(DEMO_PILLARS);
  const [campaigns] = useState<AdCampaign[]>(DEMO_CAMPAIGNS);
  const [aiAgents] = useState<AiAgentConfig[]>(DEMO_AI_AGENTS);

  // Sync to local storage for instant responsiveness
  useEffect(() => {
    localStorage.setItem('bb_leads', JSON.stringify(leads));
  }, [leads]);
  useEffect(() => {
    localStorage.setItem('bb_customers', JSON.stringify(customers));
  }, [customers]);
  useEffect(() => {
    localStorage.setItem('bb_tasks', JSON.stringify(tasks));
  }, [tasks]);
  useEffect(() => {
    localStorage.setItem('bb_conversations', JSON.stringify(conversations));
  }, [conversations]);
  useEffect(() => {
    localStorage.setItem('bb_messages', JSON.stringify(messages));
  }, [messages]);
  useEffect(() => {
    localStorage.setItem('bb_quotes', JSON.stringify(quotes));
  }, [quotes]);
  useEffect(() => {
    localStorage.setItem('bb_bookings', JSON.stringify(bookings));
  }, [bookings]);
  useEffect(() => {
    localStorage.setItem('bb_recommendations', JSON.stringify(recommendations));
  }, [recommendations]);
  useEffect(() => {
    localStorage.setItem('bb_actions', JSON.stringify(aiActions));
  }, [aiActions]);
  useEffect(() => {
    localStorage.setItem('bb_approvals', JSON.stringify(approvals));
  }, [approvals]);
  useEffect(() => {
    localStorage.setItem('bb_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);
  useEffect(() => {
    localStorage.setItem('bb_content_calendar', JSON.stringify(contentCalendar));
  }, [contentCalendar]);

  // Helper to log audit events
  const logAuditEvent = (action: string, entityType: string, entityId: string, before?: any, after?: any, reason?: string) => {
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      actorType: 'HUMAN',
      actorId: currentUser.id,
      actorName: `${currentUser.name} (${currentUser.role})`,
      action,
      entityType,
      entityId,
      before: before || null,
      after: after || null,
      reason: reason || `Updated by ${currentUser.name}`
    };
    setAuditLogs(prev => [newLog, ...prev]);

    // Async push to Firestore if available
    if (db) {
      try {
        const logDoc = doc(db, 'audit_logs', newLog.id);
        setDoc(logDoc, newLog).catch(e => console.warn('Firestore log write notice:', e));
      } catch (e) {
        // quiet fallback
      }
    }
  };

  // Lead CRUD
  const createLead = async (leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>): Promise<Lead> => {
    const newLead: Lead = {
      ...leadData,
      id: `lead-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setLeads(prev => [newLead, ...prev]);
    logAuditEvent('LEAD_CREATED', 'LEAD', newLead.id, null, newLead, 'New inbound lead registered');

    if (db) {
      try {
        await setDoc(doc(db, 'leads', newLead.id), newLead);
      } catch (err) {
        console.warn('Firestore lead create fallback:', err);
      }
    }
    return newLead;
  };

  const updateLead = async (id: string, updates: Partial<Lead>) => {
    const prevLead = leads.find(l => l.id === id);
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l))
    );
    logAuditEvent('LEAD_UPDATED', 'LEAD', id, prevLead, updates, 'Lead details updated');
  };

  const updateLeadStatus = async (id: string, status: LeadStatus) => {
    const prevLead = leads.find(l => l.id === id);
    setLeads(prev =>
      prev.map(l => (l.id === id ? { ...l, status, updatedAt: new Date().toISOString() } : l))
    );
    logAuditEvent('LEAD_STATUS_CHANGED', 'LEAD', id, { status: prevLead?.status }, { status }, `Status changed to ${status}`);
  };

  const addLeadNote = async (id: string, note: string) => {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    const timestamp = new Date().toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const formattedNote = `${lead.notes ? lead.notes + '\n\n' : ''}[${timestamp} - ${currentUser.name}]: ${note}`;
    await updateLead(id, { notes: formattedNote });
  };

  const assignLead = async (id: string, employeeId: string, employeeName: string) => {
    const prevLead = leads.find(l => l.id === id);
    await updateLead(id, { assignedEmployeeId: employeeId, assignedEmployeeName: employeeName });
    logAuditEvent('LEAD_REASSIGNED', 'LEAD', id, { assignedEmployee: prevLead?.assignedEmployeeName }, { assignedEmployee: employeeName }, `Reassigned to ${employeeName}`);
  };

  // Customer CRUD
  const createCustomer = async (custData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'totalBookings' | 'lifetimeValue'>): Promise<Customer> => {
    const newCustomer: Customer = {
      ...custData,
      id: `cust-${Date.now()}`,
      totalBookings: 0,
      lifetimeValue: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setCustomers(prev => [newCustomer, ...prev]);
    logAuditEvent('CUSTOMER_CREATED', 'CUSTOMER', newCustomer.id, null, newCustomer);
    return newCustomer;
  };

  const updateCustomer = async (id: string, updates: Partial<Customer>) => {
    setCustomers(prev =>
      prev.map(c => (c.id === id ? { ...c, ...updates, updatedAt: new Date().toISOString() } : c))
    );
  };

  // Task CRUD
  const createTask = async (taskData: Omit<Task, 'id' | 'createdAt'>): Promise<Task> => {
    const newTask: Task = {
      ...taskData,
      id: `task-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setTasks(prev => [newTask, ...prev]);
    logAuditEvent('TASK_CREATED', 'TASK', newTask.id, null, newTask, `Task created: ${newTask.title}`);
    return newTask;
  };

  const toggleTaskStatus = async (id: string) => {
    setTasks(prev =>
      prev.map(t => {
        if (t.id === id) {
          const nextStatus = t.status === 'COMPLETED' ? 'TODO' : 'COMPLETED';
          return {
            ...t,
            status: nextStatus,
            completedAt: nextStatus === 'COMPLETED' ? new Date().toISOString() : undefined
          };
        }
        return t;
      })
    );
  };

  // Content Calendar CRUD
  const createContentItem = async (itemData: Omit<ContentItem, 'id' | 'createdAt'>): Promise<ContentItem> => {
    const newItem: ContentItem = {
      ...itemData,
      id: `content-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setContentCalendar(prev => [newItem, ...prev]);
    logAuditEvent('CONTENT_CREATED', 'CONTENT', newItem.id, null, newItem, `Scheduled ${newItem.contentType} on ${newItem.channel}`);
    return newItem;
  };

  // Messaging
  const sendMessage = async (conversationId: string, content: string, senderType: 'EMPLOYEE' | 'CUSTOMER' | 'AI' | 'SYSTEM' = 'EMPLOYEE') => {
    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      conversationId,
      senderType,
      senderId: currentUser.id,
      senderName: senderType === 'EMPLOYEE' ? currentUser.name : (senderType === 'AI' ? 'Booking Bridge AI Copilot' : 'Client'),
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMsg]);
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, lastMessage: content, lastMessageTimestamp: new Date().toISOString() } : c))
    );
  };

  // Quotes
  const createQuote = async (quoteData: Omit<Quote, 'id' | 'createdAt'>): Promise<Quote> => {
    const newQuote: Quote = {
      ...quoteData,
      id: `quote-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    setQuotes(prev => [newQuote, ...prev]);
    logAuditEvent('QUOTE_CREATED', 'QUOTE', newQuote.id, null, newQuote, `Generated quote of ₹${newQuote.finalAmount.toLocaleString('en-IN')}`);
    return newQuote;
  };

  // Approvals
  const approveAction = async (approvalId: string, feedback?: string) => {
    const approval = approvals.find(a => a.id === approvalId);
    if (!approval) return;

    setApprovals(prev =>
      prev.map(a => (a.id === approvalId ? { ...a, status: 'APPROVED', reviewedBy: currentUser.name, reviewedByName: currentUser.name, reviewedAt: new Date().toISOString(), feedback } : a))
    );

    if (approval.actionId) {
      setAiActions(prev =>
        prev.map(act => (act.id === approval.actionId ? { ...act, status: 'APPROVED', approvedBy: currentUser.id, approvedByName: currentUser.name, approvedAt: new Date().toISOString() } : act))
      );
    }

    logAuditEvent('APPROVAL_GRANTED', 'APPROVAL', approvalId, null, approval.proposedData || approval.details, `Approved by ${currentUser.name}. ${feedback || ''}`);
  };

  const rejectAction = async (approvalId: string, feedback?: string) => {
    const approval = approvals.find(a => a.id === approvalId);
    if (!approval) return;

    setApprovals(prev =>
      prev.map(a => (a.id === approvalId ? { ...a, status: 'REJECTED', reviewedBy: currentUser.name, reviewedByName: currentUser.name, reviewedAt: new Date().toISOString(), feedback } : a))
    );

    if (approval.actionId) {
      setAiActions(prev =>
        prev.map(act => (act.id === approval.actionId ? { ...act, status: 'REJECTED' } : act))
      );
    }

    logAuditEvent('APPROVAL_REJECTED', 'APPROVAL', approvalId, null, null, `Rejected by ${currentUser.name}: ${feedback || 'Declined'}`);
  };

  const submitForApproval = async (itemData: Omit<ApprovalItem, 'id' | 'createdAt' | 'status'>): Promise<ApprovalItem> => {
    const newItem: ApprovalItem = {
      ...itemData,
      id: `appr-${Date.now()}`,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };
    setApprovals(prev => [newItem, ...prev]);
    logAuditEvent('APPROVAL_REQUESTED', 'APPROVAL', newItem.id, null, newItem, `Requested review by ${newItem.requiresRole || 'Management'}`);
    return newItem;
  };

  const dismissRecommendation = async (recId: string) => {
    setRecommendations(prev =>
      prev.map(r => (r.id === recId ? { ...r, status: 'DISMISSED' } : r))
    );
  };

  const acceptRecommendation = async (recId: string) => {
    setRecommendations(prev =>
      prev.map(r => (r.id === recId ? { ...r, status: 'ACCEPTED' } : r))
    );
  };

  // Server AI Calls
  const runSalesAiAnalysis = async (leadId: string): Promise<SalesAiAnalysisResult> => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error('Lead not found');

    const leadMessages = messages.filter(m => m.conversationId === `demo-conv-01` || m.conversationId === leadId);

    const response = await fetch('/api/ai/sales-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead, messages: leadMessages })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: Failed to analyze lead`);
    }

    const data = await response.json();
    const result: SalesAiAnalysisResult = data.data;

    // Update lead score and reasoning in state
    updateLead(leadId, {
      leadScore: result.leadScore,
      scoreReasoning: result.summary
    });

    logAuditEvent('AI_LEAD_ANALYSIS_COMPLETED', 'LEAD', leadId, { score: lead.leadScore }, { score: result.leadScore, recommendations: result.recommendedAction }, 'Sales AI completed real-time analysis');

    return result;
  };

  const runMarketingStrategy = async (destination: string, season: string, objective: string): Promise<MarketingAiStrategyResult> => {
    const response = await fetch('/api/ai/marketing-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination, targetMonthOrSeason: season, primaryObjective: objective })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: Failed to generate marketing strategy`);
    }

    const data = await response.json();
    return data.data;
  };

  const runMarketingAiGenerate = async (params: { destination: string; audience: string; campaignGoal: string; format: string }): Promise<MarketingAiGenerateResult> => {
    const strategyResult = await runMarketingStrategy(params.destination, 'Current Season', `${params.campaignGoal} for ${params.audience}`);
    
    return {
      campaignTitle: strategyResult.campaignIdea || `${params.destination} Luxury Experience`,
      targetAudienceRecommendation: strategyResult.audience || params.audience,
      videoHooks: strategyResult.contentIdeas?.map(c => c.hook || c.title) || [
        `Why booking standard hotels in ${params.destination} ruins the trip`,
        `The secret local experience most travel packages miss`
      ],
      adCopies: [
        `Escape to ${params.destination} with Booking Bridge OS curated luxury stays and dedicated private concierge. Guaranteed hassle-free permits and premium stays.`,
        `Discover majestic landscapes and handcrafted itineraries. Inquire today for custom package quotations.`
      ],
      instagramCaptions: strategyResult.contentIdeas?.map(c => `${c.title}: ${c.angle} #BookingBridge #${params.destination}`) || [
        `Golden views and unforgettable memories in ${params.destination}. 🌟 Tap the link in bio to plan your getaway.`
      ],
      visualPrompts: [
        `Cinematic sunset over calm waters with traditional wooden boats and majestic snow peaks in background`,
        `Warm lighting inside a luxury cedar wooden suite with traditional carpets and scenic mountain view`
      ]
    };
  };

  const askCommandCenterAi = async (question: string) => {
    const contextData = {
      userRole: currentUser.role,
      userName: currentUser.name,
      totalLeads: leads.length,
      leadStatuses: leads.reduce((acc: any, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {}),
      highPriorityLeads: leads.filter(l => l.priority === 'HIGH' || l.priority === 'URGENT').map(l => ({ name: l.customerName, dest: l.destination, budget: l.budget, status: l.status })),
      pendingTasks: tasks.filter(t => t.status !== 'COMPLETED').map(t => ({ title: t.title, assignedTo: t.assignedToName, dueAt: t.dueAt, priority: t.priority })),
      pendingApprovals: approvals.filter(a => a.status === 'PENDING').map(a => ({ title: a.title, risk: a.riskLevel, summary: a.summary })),
      openQuotesCount: quotes.filter(q => q.status === 'SENT' || q.status === 'DRAFT').length
    };

    const response = await fetch('/api/ai/command-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        userRole: currentUser.role,
        userName: currentUser.name,
        contextData
      })
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: AI Command Center error`);
    }

    const data = await response.json();
    return data.data;
  };

  // Demo Controls
  const seedDemoData = () => {
    setLeads(DEMO_LEADS);
    setCustomers(DEMO_CUSTOMERS);
    setCompanies(DEMO_COMPANIES);
    setTasks(DEMO_TASKS);
    setConversations(DEMO_CONVERSATIONS);
    setMessages(DEMO_MESSAGES);
    setQuotes(DEMO_QUOTES);
    setBookings(DEMO_BOOKINGS);
    setRecommendations(DEMO_RECOMMENDATIONS);
    setAiActions(DEMO_ACTIONS);
    setApprovals(DEMO_APPROVALS);
    setAuditLogs(DEMO_AUDIT_LOGS);
    setContentCalendar(DEMO_CONTENT_CALENDAR);
    logAuditEvent('DEMO_DATA_SEEDED', 'SYSTEM', 'system-demo-seed', null, null, 'Demo data re-seeded by user');
  };

  const clearDemoData = () => {
    setLeads(prev => prev.filter(l => !l.isDemo));
    setCustomers(prev => prev.filter(c => !c.isDemo));
    setCompanies(prev => prev.filter(c => !c.isDemo));
    setTasks(prev => prev.filter(t => !t.isDemo));
    setConversations(prev => prev.filter(c => !c.isDemo));
    setMessages(prev => prev.filter(m => !m.id.startsWith('msg-')));
    setQuotes(prev => prev.filter(q => !q.isDemo));
    setBookings(prev => prev.filter(b => !b.isDemo));
    setRecommendations(prev => prev.filter(r => !r.isDemo));
    setAiActions(prev => prev.filter(a => !a.isDemo));
    setApprovals(prev => prev.filter(a => !a.id.includes('demo')));
    setContentCalendar(prev => prev.filter(c => c.id.startsWith('content-custom')));
    logAuditEvent('DEMO_DATA_CLEARED', 'SYSTEM', 'system-demo-clear', null, null, 'Demo data purged from active views');
  };

  return (
    <DataContext.Provider
      value={{
        leads,
        customers,
        companies,
        tasks,
        conversations,
        messages,
        quotes,
        bookings,
        packages,
        recommendations,
        aiActions,
        approvals,
        auditLogs,
        integrations,
        contentCalendar,
        marketingPillars,
        campaigns,
        aiAgents,
        createLead,
        updateLead,
        updateLeadStatus,
        addLeadNote,
        assignLead,
        createCustomer,
        updateCustomer,
        createTask,
        toggleTaskStatus,
        createContentItem,
        sendMessage,
        createQuote,
        approveAction,
        rejectAction,
        approveApproval: approveAction,
        rejectApproval: rejectAction,
        submitForApproval,
        dismissRecommendation,
        acceptRecommendation,
        runSalesAiAnalysis,
        runMarketingStrategy,
        runMarketingAiGenerate,
        askCommandCenterAi,
        queryCommandCenter: askCommandCenterAi,
        seedDemoData,
        clearDemoData,
        isLoading
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}

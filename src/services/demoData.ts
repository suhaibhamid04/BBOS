import {
  Customer,
  Company,
  Lead,
  Conversation,
  Message,
  Task,
  Quote,
  Booking,
  AiRecommendation,
  AiAction,
  ApprovalItem,
  AuditLog,
  TravelPackage,
  Integration,
  ContentItem,
  MarketingPillar,
  AdCampaign,
  AiAgentConfig
} from '../types';

export const INITIAL_PACKAGES: TravelPackage[] = [
  {
    id: 'pkg-kashmir-honeymoon-6d',
    title: 'Kashmir Royal Honeymoon & Houseboat Luxury (5N/6D)',
    destination: 'Kashmir',
    durationDays: 6,
    durationNights: 5,
    basePrice: 58000,
    highlights: [
      'Private Nigeen Lake Luxury Cedar Houseboat',
      'Gulmarg Gondola Phase 1 & 2 priority assistance',
      'Pahalgam Betaab Valley & Aru Valley private 4x4 tour',
      'Romantic Shikara ride with authentic Kashmiri Kahwa'
    ],
    inclusions: [
      '5 Nights Deluxe / Heritage Accommodation',
      'Daily Breakfast & 4-Course Dinner',
      'Exclusive Chauffeur-driven Innova Crysta throughout',
      'All toll, fuel, parking, and driver allowances',
      '24/7 On-ground Kashmiri concierge support'
    ],
    itinerary: [
      { day: 1, title: 'Arrival in Srinagar & Nigeen Houseboat Check-in', description: 'Traditional Kashmiri welcome with saffron Kahwa. Evening sunset Shikara ride on tranquil Nigeen Lake.' },
      { day: 2, title: 'Srinagar to Gulmarg (Meadow of Flowers)', description: 'Scenic drive to Gulmarg. Gondola cable car ride up to Apharwat peak with snow activities.' },
      { day: 3, title: 'Gulmarg to Pahalgam (Valley of Shepherds)', description: 'Drive via saffron fields of Pampore and Apple orchards. Check-in at riverside luxury resort.' },
      { day: 4, title: 'Pahalgam Exploration: Betaab & Chandanwari', description: 'Explore Betaab Valley and picturesque Baisaran valley (Mini Switzerland).' },
      { day: 5, title: 'Pahalgam to Srinagar & Mughal Gardens', description: 'Visit Nishat Bagh, Shalimar Bagh, and Shankaracharya Temple. Evening old city heritage walk.' },
      { day: 6, title: 'Departure from Srinagar Airport', description: 'Souvenir shopping for pure Pashmina and walnuts, followed by airport drop.' }
    ]
  },
  {
    id: 'pkg-ladakh-high-passes-7d',
    title: 'Ladakh High Altitude Passes & Pangong Tso (6N/7D)',
    destination: 'Ladakh',
    durationDays: 7,
    durationNights: 6,
    basePrice: 74000,
    highlights: [
      'Khardung La Pass (17,982 ft) highest motorable road',
      'Nubra Valley Hunder sand dunes double-humped camel safari',
      'Pangong Tso high-altitude lake luxury glamping dome',
      'Ancient Thiksey and Hemis Monastery spiritual sunrise'
    ],
    inclusions: [
      '6 Nights Boutique Stays & Glamping Tents with Oxygen Support',
      'All Meals (MAP plan tailored for acclimatization)',
      'Dedicated 4x4 Scorpio / Innova with oxygen cylinder',
      'Inner Line Permits and environmental green fees'
    ],
    itinerary: [
      { day: 1, title: 'Arrival in Leh & Mandatory Acclimatization', description: 'Rest day in Leh hotel. Evening light walk to Leh Market and Shanti Stupa.' },
      { day: 2, title: 'Leh Sham Valley Excursion', description: 'Visit Magnetic Hill, Gurudwara Pathar Sahib, and Confluence of Indus and Zanskar rivers.' },
      { day: 3, title: 'Leh to Nubra Valley via Khardung La', description: 'Drive across Khardung La. Sunset camel ride across white sand dunes at Hunder.' },
      { day: 4, title: 'Nubra Valley to Pangong Tso via Shyok River', description: 'Direct picturesque route to Pangong Lake. Stargazing at night.' },
      { day: 5, title: 'Pangong Tso to Leh via Chang La', description: 'Sunrise photography at the lake. Return to Leh via Chang La pass.' },
      { day: 6, title: 'Monasteries & Cultural Day in Leh', description: 'Visit Shey Palace and Thiksey monastery. Traditional Ladakhi dinner.' },
      { day: 7, title: 'Departure from Leh Kushok Bakula Airport', description: 'Transfer to Leh Airport with fond Himalayan memories.' }
    ]
  },
  {
    id: 'pkg-jammu-vaishnodevi-patnitop',
    title: 'Divine Jammu, Vaishno Devi Shrine & Pine Hills of Patnitop (4N/5D)',
    destination: 'Jammu',
    durationDays: 5,
    durationNights: 4,
    basePrice: 32000,
    highlights: [
      'Mata Vaishno Devi VIP Darshan & Battery Car coordination',
      'Patnitop cedar forests & Sanasar meadow paragliding',
      'Katra luxury stay with pure vegetarian dining'
    ],
    inclusions: [
      '4 Nights 4-Star Accommodation',
      'Breakfast and Dinner Included',
      'Dedicated AC Sedan / SUV from Jammu Railway / Airport',
      'Helicopter / Yatra slip coordination assistance'
    ],
    itinerary: [
      { day: 1, title: 'Arrival at Jammu & Transfer to Katra', description: 'Pick up from Jammu Tawi / Airport, drive to Katra base camp.' },
      { day: 2, title: 'Holy Trek / Darshan at Mata Vaishno Devi Shrine', description: 'Full day pilgrimage to Bhawan with return by evening.' },
      { day: 3, title: 'Katra to Patnitop Hill Station', description: 'Scenic uphill drive to Patnitop. Visit Nag Temple and Pine view park.' },
      { day: 4, title: 'Sanasar Lake & Skyview Gondola Experience', description: 'Day trip to Sanasar lake and adventure park.' },
      { day: 5, title: 'Patnitop to Jammu Departure', description: 'Drop-off at Jammu Airport / Railway station.' }
    ]
  }
];

export const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'cust-demo-01',
    name: 'Rohit Sharma',
    phone: '+91 98201 44521',
    whatsApp: '+91 98201 44521',
    email: 'rohit.sharma@gmail.com',
    city: 'Mumbai',
    customerType: 'B2C',
    preferences: ['Luxury 5-Star', 'Private Chauffeur', 'Houseboat Stay', 'Gondola Phase 2'],
    notes: 'Planning honeymoon in mid-October. Prefers quiet luxury over crowded tourist spots.',
    totalBookings: 1,
    lifetimeValue: 68000,
    createdAt: '2026-08-10T10:00:00Z',
    updatedAt: '2026-08-20T14:30:00Z',
    isDemo: true
  },
  {
    id: 'cust-demo-02',
    name: 'Dr. Ananya Sen',
    phone: '+91 98310 99882',
    whatsApp: '+91 98310 99882',
    email: 'ananya.sen@aiims.edu',
    city: 'Kolkata',
    customerType: 'B2C',
    preferences: ['Family Friendly', 'Senior Citizen Accessibility', 'Pahalgam Resort', 'Wazwan Food'],
    notes: 'Traveling with parents (aged 68+). Requires ground-floor rooms and wheelchair friendly locations.',
    totalBookings: 2,
    lifetimeValue: 145000,
    createdAt: '2026-07-15T09:00:00Z',
    updatedAt: '2026-08-19T11:20:00Z',
    isDemo: true
  },
  {
    id: 'cust-demo-03',
    name: 'Vikram Malhotra',
    phone: '+91 98112 33445',
    whatsApp: '+91 98112 33445',
    email: 'vikram.m@apextechnologies.com',
    city: 'Bangalore',
    customerType: 'B2B',
    preferences: ['Corporate Retreat', 'Conference Hall', 'Nubra Glamping', 'Team Building'],
    notes: 'HR Director at Apex Tech. Planning 18-member executive leadership offsite to Leh & Nubra Valley.',
    totalBookings: 0,
    lifetimeValue: 0,
    companyId: 'comp-demo-01',
    createdAt: '2026-08-18T16:00:00Z',
    updatedAt: '2026-08-21T09:45:00Z',
    isDemo: true
  },
  {
    id: 'cust-demo-04',
    name: 'Pooja Hegde',
    phone: '+91 97400 12890',
    whatsApp: '+91 97400 12890',
    email: 'pooja.travels@yahoo.com',
    city: 'Hyderabad',
    customerType: 'B2C',
    preferences: ['Adventure', 'Trek to Great Lakes', 'Photography', 'Homestays'],
    notes: 'Solo traveler interested in high-altitude landscape photography and Gurez Valley.',
    totalBookings: 1,
    lifetimeValue: 42000,
    createdAt: '2026-08-01T12:00:00Z',
    updatedAt: '2026-08-18T10:00:00Z',
    isDemo: true
  }
];

export const DEMO_COMPANIES: Company[] = [
  {
    id: 'comp-demo-01',
    name: 'Apex Technologies Pvt Ltd',
    industry: 'Enterprise Software & Cloud',
    gstNumber: '29ABCDE1234F1Z5',
    contactPerson: 'Vikram Malhotra',
    email: 'offsite@apextechnologies.com',
    phone: '+91 80 4123 9900',
    city: 'Bangalore',
    createdAt: '2026-08-18T16:00:00Z',
    isDemo: true
  },
  {
    id: 'comp-demo-02',
    name: 'Zenith Global Wealth Consultants',
    industry: 'Financial Advisory',
    gstNumber: '27AABCT9988H1Z8',
    contactPerson: 'Meera Deshmukh',
    email: 'events@zenithwealth.in',
    phone: '+91 22 6789 0011',
    city: 'Mumbai',
    createdAt: '2026-07-10T14:00:00Z',
    isDemo: true
  }
];

export const DEMO_LEADS: Lead[] = [
  {
    id: 'demo-lead-01',
    customerId: 'cust-demo-01',
    customerName: 'Rohit Sharma',
    customerPhone: '+91 98201 44521',
    customerEmail: 'rohit.sharma@gmail.com',
    source: 'Meta Ads - Kashmir Autumn Special',
    sourcePlatform: 'Meta Ads',
    campaignId: 'camp-kashmir-autumn-2026',
    destination: 'Kashmir',
    travelStartDate: '2026-10-12',
    travelEndDate: '2026-10-17',
    travelerCount: 2,
    tripType: 'Honeymoon',
    budget: 85000,
    status: 'QUOTE_SENT',
    leadScore: 92,
    assignedEmployeeId: 'emp-sales-01',
    assignedEmployeeName: 'Tariq Bhat',
    priority: 'HIGH',
    lastContactAt: '2026-08-21T15:30:00Z',
    nextFollowUpAt: '2026-08-23T11:00:00Z',
    createdAt: '2026-08-20T10:15:00Z',
    updatedAt: '2026-08-21T15:30:00Z',
    notes: 'Sent quote of ₹68,000 for 5N/6D Royal Honeymoon. Client requested confirmation of Gondola Phase 2 tickets availability.',
    isDemo: true,
    scoreReasoning: 'High intent: honeymoon date fixed, responsive on WhatsApp within 5 minutes, budget aligns with premium package.'
  },
  {
    id: 'demo-lead-02',
    customerId: 'cust-demo-02',
    customerName: 'Dr. Ananya Sen',
    customerPhone: '+91 98310 99882',
    customerEmail: 'ananya.sen@aiims.edu',
    source: 'Google Ads - Luxury Kashmir Family Tour',
    sourcePlatform: 'Google Ads',
    destination: 'Kashmir',
    travelStartDate: '2026-09-24',
    travelEndDate: '2026-09-30',
    travelerCount: 4,
    tripType: 'Family Vacation',
    budget: 140000,
    status: 'NEGOTIATION',
    leadScore: 88,
    assignedEmployeeId: 'emp-sales-02',
    assignedEmployeeName: 'Ayesha Zargar',
    priority: 'HIGH',
    lastContactAt: '2026-08-21T18:00:00Z',
    nextFollowUpAt: '2026-08-22T16:00:00Z',
    createdAt: '2026-08-19T08:45:00Z',
    updatedAt: '2026-08-21T18:00:00Z',
    notes: 'Client wants 2 rooms at The Khyber or Pine N Peak Pahalgam with wheelchair support.',
    isDemo: true,
    scoreReasoning: 'Repeat customer inquiry, verified senior travelers, clear itinerary preference.'
  },
  {
    id: 'demo-lead-03',
    customerId: 'cust-demo-03',
    customerName: 'Vikram Malhotra (Apex Tech)',
    customerPhone: '+91 98112 33445',
    customerEmail: 'vikram.m@apextechnologies.com',
    source: 'Direct WhatsApp Inbound - Corporate Offsite',
    sourcePlatform: 'WhatsApp Inbound',
    destination: 'Ladakh',
    travelStartDate: '2026-09-15',
    travelEndDate: '2026-09-21',
    travelerCount: 18,
    tripType: 'Corporate Group',
    budget: 950000,
    status: 'QUALIFIED',
    leadScore: 95,
    assignedEmployeeId: 'emp-mgr-01',
    assignedEmployeeName: 'Sameer Mir',
    priority: 'URGENT',
    lastContactAt: '2026-08-22T08:30:00Z',
    nextFollowUpAt: '2026-08-22T14:00:00Z',
    createdAt: '2026-08-18T16:00:00Z',
    updatedAt: '2026-08-22T08:30:00Z',
    notes: 'Large ticket B2B corporate offsite. Needs formal corporate pitch deck, oxygen logistics, and conference dinner at Pangong glamping.',
    isDemo: true,
    scoreReasoning: 'Massive deal value (₹9.5L), founder/sales manager attention required, immediate September departure date.'
  },
  {
    id: 'demo-lead-04',
    customerId: 'cust-demo-04',
    customerName: 'Pooja Hegde',
    customerPhone: '+91 97400 12890',
    customerEmail: 'pooja.travels@yahoo.com',
    source: 'Instagram Direct Message - Gurez Autumn',
    sourcePlatform: 'Instagram Direct',
    destination: 'Kashmir',
    travelStartDate: '2026-10-05',
    travelEndDate: '2026-10-11',
    travelerCount: 1,
    tripType: 'Custom Private Tour',
    budget: 45000,
    status: 'NEW',
    leadScore: 65,
    assignedEmployeeId: 'emp-sales-01',
    assignedEmployeeName: 'Tariq Bhat',
    priority: 'MEDIUM',
    lastContactAt: '2026-08-22T07:10:00Z',
    nextFollowUpAt: '2026-08-22T12:00:00Z',
    createdAt: '2026-08-22T07:10:00Z',
    updatedAt: '2026-08-22T07:10:00Z',
    notes: 'Inquired about solo permits for Gurez Valley and Tulail border village.',
    isDemo: true,
    scoreReasoning: 'New inbound DM, budget moderate, requires permit verification.'
  }
];

export const DEMO_CONVERSATIONS: Conversation[] = [
  {
    id: 'demo-conv-01',
    customerId: 'cust-demo-01',
    customerName: 'Rohit Sharma',
    customerPhone: '+91 98201 44521',
    leadId: 'demo-lead-01',
    channel: 'WhatsApp',
    assignedEmployeeId: 'emp-sales-01',
    assignedEmployeeName: 'Tariq Bhat',
    status: 'ACTIVE',
    unreadCount: 0,
    lastMessage: 'Can you guarantee that we will get Phase 2 Gondola tickets without waiting in long queues?',
    lastMessageTimestamp: '2026-08-21T15:28:00Z',
    createdAt: '2026-08-20T10:20:00Z',
    updatedAt: '2026-08-21T15:28:00Z',
    isDemo: true
  },
  {
    id: 'demo-conv-02',
    customerId: 'cust-demo-03',
    customerName: 'Vikram Malhotra',
    customerPhone: '+91 98112 33445',
    leadId: 'demo-lead-03',
    channel: 'WhatsApp',
    assignedEmployeeId: 'emp-mgr-01',
    assignedEmployeeName: 'Sameer Mir',
    status: 'ACTIVE',
    unreadCount: 1,
    lastMessage: 'Please share the detailed medical and oxygen backup protocol for our 18 team members in Nubra.',
    lastMessageTimestamp: '2026-08-22T08:25:00Z',
    createdAt: '2026-08-18T16:10:00Z',
    updatedAt: '2026-08-22T08:25:00Z',
    isDemo: true
  }
];

export const DEMO_MESSAGES: Message[] = [
  {
    id: 'msg-01',
    conversationId: 'demo-conv-01',
    senderType: 'CUSTOMER',
    senderId: 'cust-demo-01',
    senderName: 'Rohit Sharma',
    content: 'Hi Booking Bridge, I saw your Instagram ad for Kashmir Royal Honeymoon. We are planning for mid October.',
    timestamp: '2026-08-20T10:22:00Z'
  },
  {
    id: 'msg-02',
    conversationId: 'demo-conv-01',
    senderType: 'EMPLOYEE',
    senderId: 'emp-sales-01',
    senderName: 'Tariq Bhat',
    content: 'Hello Rohit Ji! Warm greetings from Srinagar. Mid-October is the magical Golden Autumn season when Chinar trees turn amber. Let me share our signature 5N/6D Royal Honeymoon itinerary with luxury houseboat stay.',
    timestamp: '2026-08-20T10:28:00Z'
  },
  {
    id: 'msg-03',
    conversationId: 'demo-conv-01',
    senderType: 'CUSTOMER',
    senderId: 'cust-demo-01',
    senderName: 'Rohit Sharma',
    content: 'Can you guarantee that we will get Phase 2 Gondola tickets without waiting in long queues?',
    timestamp: '2026-08-21T15:28:00Z',
    metadata: {
      intent: 'OBJECTION_REASSURANCE',
      sentiment: 'hesitant',
      suggestedAction: 'Send confirmation that our Srinagar concierge directly secures Phase 2 slots via official portal 10 days in advance.'
    }
  }
];

export const DEMO_TASKS: Task[] = [
  {
    id: 'task-demo-01',
    title: 'Confirm Gulmarg Gondola slot allocation for Rohit Sharma',
    description: 'Pre-book Phase 1 and Phase 2 tickets for Oct 13 date to ensure hassle-free honeymoon experience.',
    assignedToId: 'emp-sales-01',
    assignedToName: 'Tariq Bhat',
    createdByName: 'System Sales AI',
    priority: 'HIGH',
    status: 'TODO',
    dueAt: '2026-08-23T18:00:00Z',
    source: 'AI',
    createdAt: '2026-08-21T15:35:00Z',
    isDemo: true
  },
  {
    id: 'task-demo-02',
    title: 'Send customized corporate offsite proposal to Apex Tech',
    description: 'Prepare B2B pitch deck with 4x4 transport, Nubra dome stays, and oxygen safety backup for 18 passengers.',
    assignedToId: 'emp-mgr-01',
    assignedToName: 'Sameer Mir',
    createdByName: 'Suhaib Hamid (Founder)',
    priority: 'URGENT',
    status: 'TODO',
    dueAt: '2026-08-22T14:00:00Z',
    source: 'HUMAN',
    createdAt: '2026-08-22T08:15:00Z',
    isDemo: true
  }
];

export const DEMO_QUOTES: Quote[] = [
  {
    id: 'quote-demo-01',
    leadId: 'demo-lead-01',
    customerId: 'cust-demo-01',
    customerName: 'Rohit Sharma',
    destination: 'Kashmir',
    travelerCount: 2,
    packageId: 'pkg-kashmir-honeymoon-6d',
    packageName: 'Kashmir Royal Honeymoon (5N/6D)',
    totalAmount: 72000,
    discountAmount: 4000,
    finalAmount: 68000,
    status: 'SENT',
    validUntil: '2026-08-28',
    createdAt: '2026-08-21T15:30:00Z',
    isDemo: true
  }
];

export const DEMO_BOOKINGS: Booking[] = [
  {
    id: 'book-demo-01',
    quoteId: 'quote-demo-historical-01',
    leadId: 'lead-demo-past-01',
    customerId: 'cust-demo-02',
    customerName: 'Dr. Ananya Sen',
    destination: 'Kashmir',
    travelStartDate: '2026-05-10',
    travelEndDate: '2026-05-16',
    travelerCount: 4,
    totalAmount: 145000,
    paidAmount: 145000,
    status: 'COMPLETED',
    createdAt: '2026-04-12T10:00:00Z',
    isDemo: true
  }
];

export const DEMO_RECOMMENDATIONS: AiRecommendation[] = [
  {
    id: 'rec-demo-01',
    category: 'SALES',
    title: 'High Conversion Window: Rohit Sharma Honeymoon',
    description: 'Lead score is 92/100. Replying to Gondola concern within 2 hours increases booking probability by 48%.',
    priority: 'HIGH',
    relatedEntityType: 'LEAD',
    relatedEntityId: 'demo-lead-01',
    recommendedAction: 'Send AI-drafted WhatsApp reassurance message regarding Gondola concierge queue pass.',
    riskLevel: 'LOW',
    requiresApproval: false,
    status: 'PENDING',
    confidenceScore: 0.94,
    createdAt: '2026-08-21T15:35:00Z',
    isDemo: true
  },
  {
    id: 'rec-demo-02',
    category: 'MARKETING',
    title: 'Scale Meta Ads for "Golden Autumn in Kashmir"',
    description: 'Ad set "Chinar Autumn Season" is generating qualified leads at ₹142 CPL (target ₹280). Recommend increasing daily spend.',
    priority: 'HIGH',
    relatedEntityType: 'CAMPAIGN',
    relatedEntityId: 'camp-kashmir-autumn-2026',
    recommendedAction: 'Increase daily ad budget from ₹2,500 to ₹3,000.',
    riskLevel: 'HIGH',
    requiresApproval: true,
    status: 'PENDING',
    confidenceScore: 0.89,
    createdAt: '2026-08-22T06:00:00Z',
    isDemo: true
  }
];

export const DEMO_ACTIONS: AiAction[] = [
  {
    id: 'act-demo-01',
    agent: 'Marketing AI Agent',
    actionType: 'META_CAMPAIGN_BUDGET_UPDATE',
    targetType: 'CAMPAIGN',
    targetId: 'camp-kashmir-autumn-2026',
    parameters: { currentBudget: 2500, proposedBudget: 3000 },
    riskLevel: 'HIGH',
    approvalRequired: true,
    status: 'PENDING_APPROVAL',
    reasoning: 'ROAS is 4.8x over the last 7 days. Increasing budget will yield estimated 18 additional high-intent leads before autumn slots fill up.',
    createdAt: '2026-08-22T06:05:00Z',
    isDemo: true
  }
];

export const DEMO_APPROVALS: ApprovalItem[] = [
  {
    id: 'appr-demo-01',
    actionId: 'act-demo-01',
    title: 'Scale "Golden Autumn Kashmir" Ad Campaign Budget (+20%)',
    category: 'PAID MARKETING',
    summary: 'Increase daily Meta ad spend from ₹2,500/day to ₹3,000/day for high-converting Chinar autumn campaign.',
    reason: 'Campaign is yielding 35% higher return on ad spend than historical benchmarks.',
    riskLevel: 'HIGH',
    requiresRole: 'FOUNDER',
    proposedData: { currentDailyBudget: 2500, newDailyBudget: 3000, expectedWeeklyLeads: '+18 leads' },
    status: 'PENDING',
    submittedBy: 'AI_AGENT',
    createdAt: '2026-08-22T06:05:00Z'
  },
  {
    id: 'appr-demo-02',
    actionId: 'act-demo-02',
    title: 'Special Corporate Discount for Apex Technologies (₹45,000)',
    category: 'SALES DISCOUNT',
    summary: 'Apply 5% bulk offsite discount for 18-member Ladakh expedition.',
    reason: 'Deal total is ₹9.50 Lakhs. Bulk discount secures commitment against competing vendor.',
    riskLevel: 'HIGH',
    requiresRole: 'FOUNDER',
    proposedData: { grossAmount: 950000, discount: 45000, netPayable: 905000 },
    status: 'PENDING',
    submittedBy: 'Sameer Mir (Sales Manager)',
    createdAt: '2026-08-22T08:35:00Z'
  }
];

export const DEMO_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'audit-01',
    timestamp: '2026-08-22T08:15:00Z',
    actorType: 'HUMAN',
    actorId: 'emp-founder-01',
    actorName: 'Suhaib Hamid (Founder)',
    action: 'TASK_CREATED',
    entityType: 'TASK',
    entityId: 'task-demo-02',
    after: { title: 'Send customized corporate offsite proposal to Apex Tech', priority: 'URGENT' },
    reason: 'Direct founder assignment for high-ticket corporate opportunity'
  },
  {
    id: 'audit-02',
    timestamp: '2026-08-22T06:05:00Z',
    actorType: 'AI',
    actorId: 'ai-marketing-agent',
    actorName: 'Marketing AI Agent',
    action: 'ACTION_PROPOSED',
    entityType: 'AI_ACTION',
    entityId: 'act-demo-01',
    after: { actionType: 'META_CAMPAIGN_BUDGET_UPDATE', proposedDailyBudget: 3000 },
    reason: 'High-performing ROAS threshold triggered automated scale proposal'
  },
  {
    id: 'audit-03',
    timestamp: '2026-08-21T15:35:00Z',
    actorType: 'AI',
    actorId: 'ai-sales-agent',
    actorName: 'Sales AI Agent',
    action: 'LEAD_SCORED',
    entityType: 'LEAD',
    entityId: 'demo-lead-01',
    before: { leadScore: 75 },
    after: { leadScore: 92 },
    reason: 'Customer affirmed specific dates, luxury preferences, and prompt replies'
  }
];

export const SYSTEM_INTEGRATIONS: Integration[] = [
  {
    id: 'int-meta-ads',
    name: 'Meta Ads Marketing API',
    category: 'ADVERTISING',
    status: 'CONNECTED',
    description: 'Synchronize Facebook & Instagram Lead Ads, auto-create leads in CRM, and manage campaign budgets with AI approval gates.',
    iconName: 'Megaphone',
    features: ['Instant Lead Ingestion', 'Ad Spend Optimization', 'ROAS Attribution Tracking']
  },
  {
    id: 'int-whatsapp-cloud',
    name: 'WhatsApp Cloud Business API',
    category: 'MESSAGING',
    status: 'CONNECTED',
    description: 'Official WhatsApp Business Platform for verified green badge messaging, automated quotes, and AI agent copilot replies.',
    iconName: 'MessageSquare',
    features: ['Template Messages', 'Interactive Buttons', 'Two-Way Agent Chat']
  },
  {
    id: 'int-canva-creative',
    name: 'Canva Enterprise Creative API',
    category: 'CREATIVE',
    status: 'CONNECTED',
    description: 'Generate high-resolution Kashmir/Ladakh travel brochures, social reels banners, and branded PDF itineraries automatically.',
    iconName: 'Image',
    features: ['Automated Banner Generation', 'Branded Travel PDF Exports', 'Asset Library Sync']
  },
  {
    id: 'int-razorpay-payments',
    name: 'Razorpay Payment Gateway & Links',
    category: 'PAYMENTS',
    status: 'CONNECTED',
    description: 'Generate instant booking advance payment links, UPI QR codes, and automated payment receipt reconciliation.',
    iconName: 'CreditCard',
    features: ['Instant UPI Links', 'Automatic Booking Status Update', 'GST Invoicing Support']
  }
];

export const DEMO_CONTENT_CALENDAR: ContentItem[] = [
  {
    id: 'content-01',
    title: 'Chinar Amber Fall in Nishat Bagh',
    channel: 'Instagram',
    contentType: 'Reel',
    destination: 'Kashmir',
    caption: 'When autumn whispers in Srinagar, every leaf turns into a golden flame. 🍂 Book your private luxury Shikara sunset with Kashmiri Kahwa.',
    hashtags: ['#KashmirAutumn', '#SrinagarDiaries', '#LuxuryTravelIndia', '#BookingBridge'],
    status: 'SCHEDULED',
    approvalStatus: 'APPROVED',
    scheduledFor: '2026-08-25T17:00:00Z',
    generatedBy: 'AI'
  },
  {
    id: 'content-02',
    title: 'Top 5 Acclimatization Tips for Ladakh High Altitude',
    channel: 'Blog',
    contentType: 'Static Post',
    destination: 'Ladakh',
    caption: 'Planning Leh-Ladakh? Why your Day 1 rest protocol is the secret to a headache-free Pangong adventure.',
    hashtags: ['#LadakhDiaries', '#LehTravelGuide', '#HimalayanAdventure'],
    status: 'DRAFT',
    approvalStatus: 'PENDING',
    scheduledFor: '2026-08-27T10:00:00Z',
    generatedBy: 'AI'
  }
];

export const DEMO_PILLARS: MarketingPillar[] = [
  {
    id: 'pillar-01',
    pillarName: 'Romantic Kashmir & Houseboat Luxury',
    destination: 'Kashmir',
    theme: 'Couples, Honeymoon, Private Shikara, Candlelit Wazwan',
    targetAudience: 'Newlywed couples (Ages 24-36), Tier 1 metro cities',
    primaryChannel: 'Instagram Reels & Meta Ads',
    sampleHooks: [
      'Why 80% of couples regret booking standard hotels in Srinagar instead of cedar houseboats',
      'The 3 secret spots in Gulmarg that tour buses never take you to'
    ]
  },
  {
    id: 'pillar-02',
    pillarName: 'Himalayan High Passes & Glamping',
    destination: 'Ladakh',
    theme: 'Nubra Dunes, Stargazing, Pangong Luxury Domes, Monasteries',
    targetAudience: 'Adventure seekers, photography enthusiasts, corporate offsites',
    primaryChannel: 'YouTube Shorts & Google Search Ads',
    sampleHooks: [
      'What Khardung La at 17,982 ft looks like when you reach before the tourist crowds',
      'How to plan a luxury Ladakh trip with on-demand oxygen support'
    ]
  }
];

export const DEMO_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'camp-kashmir-autumn-2026',
    name: 'Kashmir Golden Autumn & Shikara Season',
    platform: 'Meta Ads',
    targetDestination: 'Kashmir',
    objective: 'High-Intent Honeymoon & Luxury Lead Gen',
    budget: 65000,
    spent: 24800,
    leadsGenerated: 42,
    bookingsCount: 6,
    revenueGenerated: 410000,
    roas: 4.8,
    status: 'ACTIVE',
    startDate: '2026-08-01'
  },
  {
    id: 'camp-ladakh-expedition-2026',
    name: 'Ladakh High Passes B2B & Corporate Retreat',
    platform: 'Google Ads',
    targetDestination: 'Ladakh',
    objective: 'B2B & Group Offsite Inquiries',
    budget: 45000,
    spent: 18200,
    leadsGenerated: 14,
    bookingsCount: 2,
    revenueGenerated: 280000,
    roas: 3.9,
    status: 'ACTIVE',
    startDate: '2026-08-05'
  }
];

export const DEMO_AI_AGENTS: AiAgentConfig[] = [
  {
    id: 'agent-sales-copilot',
    name: 'Sales AI Copilot',
    purpose: 'Real-time inquiry parsing, intent scoring, objection handling, and personalized WhatsApp reply synthesis',
    autonomyLevel: 'SEMI_AUTONOMOUS',
    permittedTools: ['crm_lead_score', 'itinerary_match', 'quote_draft', 'whatsapp_reply_draft'],
    requiresHumanApproval: false,
    status: 'ACTIVE'
  },
  {
    id: 'agent-marketing-genius',
    name: 'Marketing & Ad Strategy AI',
    purpose: 'Destination trend forecasting, Instagram viral reels copy generation, and Meta Ads budget scaling proposals',
    autonomyLevel: 'SEMI_AUTONOMOUS',
    permittedTools: ['meta_ads_analyze', 'creative_brief_generate', 'budget_scale_proposal'],
    requiresHumanApproval: true,
    status: 'ACTIVE'
  },
  {
    id: 'agent-command-center',
    name: 'Command Center Orchestrator',
    purpose: 'Executive intelligence, cross-module KPI queries, risk analysis, and role-grounded operational guidance',
    autonomyLevel: 'SUGGEST_ONLY',
    permittedTools: ['global_kpi_query', 'risk_monitor', 'approval_triage'],
    requiresHumanApproval: false,
    status: 'ACTIVE'
  }
];

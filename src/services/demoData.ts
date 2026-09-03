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
  AiAgentConfig,
  Trip,
  ItineraryDay,
  Hotel,
  HotelRoom,
  Transport,
  Driver,
  Activity,
  Supplier,
  Voucher
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
    companyName: 'Apex Technologies Pvt Ltd',
    contactPerson: 'Vikram Malhotra',
    email: 'offsite@apextechnologies.com',
    phone: '+91 80 4123 9900',
    city: 'Bangalore',
    agencyType: 'Corporate',
    status: 'ACTIVE',
    totalBookings: 5,
    totalRevenue: 450000,
    createdAt: '2026-08-18T16:00:00Z',
    updatedAt: '2026-08-18T16:00:00Z',
    isDemo: true
  },
  {
    id: 'comp-demo-02',
    companyName: 'Zenith Global Wealth Consultants',
    contactPerson: 'Meera Deshmukh',
    email: 'events@zenithwealth.in',
    phone: '+91 22 6789 0011',
    city: 'Mumbai',
    agencyType: 'Corporate',
    status: 'PROSPECT',
    totalBookings: 0,
    totalRevenue: 0,
    createdAt: '2026-07-10T14:00:00Z',
    updatedAt: '2026-07-10T14:00:00Z',
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
    customerPhone: '+91 99061 23456',
    customerEmail: 'rohit.sharma@gmail.com',
    destination: 'Kashmir',
    tripId: 'trip-kashmir-honeymoon-01',
    travelerCount: 2,
    adults: 2,
    children: 0,
    packageId: 'pkg-kashmir-honeymoon-6d',
    packageName: 'Kashmir Royal Honeymoon (5N/6D)',
    durationDays: 6,
    durationNights: 5,
    totalAmount: 95000,
    discountAmount: 5000,
    finalAmount: 90000,
    totalCost: 65000,
    grossProfit: 25000,
    grossMargin: 27.8,
    status: 'SENT',
    validUntil: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    createdAt: '2026-08-21T15:30:00Z',
    updatedAt: '2026-08-21T15:30:00Z',
    version: 1,
    versionHistory: [],
    salesEmployeeId: 'emp-01',
    salesEmployeeName: 'Suhaib Hamid',
    hotels: [
      {
        hotelId: 'hotel-lalit-srinagar',
        hotelName: 'The Lalit Grand Palace',
        roomType: 'Deluxe Palace Room',
        mealPlan: 'CP (Breakfast)',
        nights: 2,
        rate: 36000,
        supplierCost: 26000
      },
      {
        hotelId: 'hotel-khyber-gulmarg',
        hotelName: 'The Khyber Himalayan Resort & Spa',
        roomType: 'Premier Pine View Room',
        mealPlan: 'MAP (Breakfast + Dinner)',
        nights: 2,
        rate: 40000,
        supplierCost: 28000
      },
      {
        hotelId: 'hotel-mascot-houseboats',
        hotelName: 'Mascot Houseboats (Nigeen Lake)',
        roomType: 'Royal Cedar Wood Suite',
        mealPlan: 'MAP (Breakfast + Dinner)',
        nights: 1,
        rate: 14000,
        supplierCost: 9500
      }
    ],
    transports: [
      {
        transportId: 'trans-innova-crysta',
        vehicleType: 'Innova Crysta AC Dedicated Chauffeur',
        route: 'Srinagar Airport → Gulmarg → Pahalgam → Nigeen Lake',
        days: 6,
        rate: 28800,
        supplierCost: 20400
      }
    ],
    activities: [
      {
        activityId: 'act-gondola-phase1-2',
        name: 'Gulmarg Gondola Tickets (Phase 1 & Phase 2)',
        pax: 2,
        rate: 4900,
        supplierCost: 3700
      },
      {
        activityId: 'act-shikara-ride-sunset',
        name: 'Private Sunset Shikara Ride on Nigeen Lake',
        pax: 2,
        rate: 2000,
        supplierCost: 1200
      }
    ],
    inclusions: [
      '5 Nights Luxury Accommodation across Srinagar, Gulmarg & Houseboat',
      'Daily Gourmet Breakfast and Chef Curated Dinners (MAP Plan)',
      'Dedicated AC Innova Crysta throughout with expert Himalayan Chauffeur',
      'Private Sunset Shikara Ride on Nigeen Lake (2 Hours)',
      'Gulmarg Gondola Phase 1 & 2 Fast-track tickets for 2 adults',
      'All toll taxes, parking fees, driver allowances, and fuel surcharges',
      '24/7 dedicated local concierge and on-ground operational liaison'
    ],
    exclusions: [
      'Airfare to and from Srinagar International Airport (SXR)',
      'Personal expenses, laundry, tips, and room mini-bar charges',
      'Pony rides or ATV quad biking in Baisaran / Gulmarg',
      'Camera fees at heritage monuments and national parks',
      'Any additional services or detour outside the agreed itinerary'
    ],
    termsAndConditions: 'Booking Confirmation requires 30% advance deposit. 70% balance payable 7 days prior to arrival. Free cancellation up to 14 days before check-in. In case of flight cancellations due to weather, dates can be rescheduled without penalty.',
    notes: 'Special honeymoon cake and floral room decoration arranged at Mascot Houseboat on Day 5.',
    internalNotes: 'VIP Honeymoon couple. Chauffeur Tariq advised to arrive 20 mins prior at SXR.',
    isDemo: true
  }
];

export const DEMO_BOOKINGS: Booking[] = [
  {
    id: 'book-demo-01',
    quoteId: 'quote-demo-historical-01',
    leadId: 'lead-demo-past-01',
    customerId: 'cust-demo-02',
    tripId: 'trip-demo-01',
    bookingReference: 'BKG-KAS-01',
    travelStartDate: '2026-05-10',
    travelEndDate: '2026-05-16',
    totalAmount: 145000,
    amountReceived: 145000,
    amountPending: 0,
    status: 'COMPLETED',
    createdAt: '2026-04-12T10:00:00Z',
    updatedAt: '2026-05-16T10:00:00Z',
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

export const DEMO_TRIPS: Trip[] = [
  {
    id: 'trip-demo-01',
    customerId: 'cust-demo-01',
    leadId: 'lead-demo-01',
    title: 'Kashmir Luxury Honeymoon & Houseboat Stays',
    destination: 'Kashmir',
    startDate: '2026-10-12',
    endDate: '2026-10-16',
    travelerCount: 2,
    adults: 2,
    children: 0,
    tripType: 'Honeymoon',
    status: 'DRAFT',
    currency: 'INR',
    totalCost: 55400,
    totalSellingPrice: 82500,
    grossProfit: 27100,
    grossMargin: 32.8,
    budget: 120000,
    assignedSalesEmployeeId: 'emp-sales-01',
    createdAt: '2026-08-20T10:00:00Z',
    updatedAt: '2026-08-20T10:00:00Z',
    isDemo: true
  }
];

export const DEMO_ITINERARIES: ItineraryDay[] = [
  {
    id: 'day-demo-1',
    tripId: 'trip-demo-01',
    dayNumber: 1,
    date: '2026-10-12',
    title: 'Arrival in Srinagar & Sunset Shikara Ride',
    location: 'Srinagar (Nigeen Lake)',
    description: 'Airport pickup, transfer to Nigeen Lake luxury houseboat. Evening Shikara ride with authentic Kashmiri saffron Kahwa.',
    notes: 'Check-in at 2:00 PM. Welcome Kahwa pre-arranged.',
    items: [
      {
        id: 'item-101',
        dayId: 'day-demo-1',
        tripId: 'trip-demo-01',
        type: 'HOTEL',
        title: 'Mascot Houseboats - Royal Cedar Suite',
        description: 'MAP Plan (Breakfast + 4-Course Dinner). Nigeen Lake waterfront view.',
        referenceId: 'demo-hotel-03',
        supplierCost: 6500,
        sellingPrice: 10500,
        metadata: { hotelId: 'demo-hotel-03', roomType: 'Royal Cedar Suite', mealPlan: 'MAP', rooms: 1, guests: 2 }
      },
      {
        id: 'item-102',
        dayId: 'day-demo-1',
        tripId: 'trip-demo-01',
        type: 'TRANSPORT',
        title: 'Innova Crysta AC - Airport to Nigeen Lake',
        description: 'Dedicated vehicle & chauffeur for Srinagar airport pickup.',
        referenceId: 'demo-trans-01',
        supplierCost: 3400,
        sellingPrice: 4800,
        metadata: { vehicleType: 'Innova Crysta AC', pickup: 'Srinagar Airport', dropoff: 'Nigeen Lake' }
      },
      {
        id: 'item-103',
        dayId: 'day-demo-1',
        tripId: 'trip-demo-01',
        type: 'ACTIVITY',
        title: 'Private Sunset Shikara Ride with Kahwa',
        description: '1.5-hour peaceful cruise across serene Nigeen Lake.',
        referenceId: 'demo-act-02',
        supplierCost: 700,
        sellingPrice: 1300,
        metadata: { activityId: 'demo-act-02', participants: 2 }
      }
    ]
  },
  {
    id: 'day-demo-2',
    tripId: 'trip-demo-01',
    dayNumber: 2,
    date: '2026-10-13',
    title: 'Srinagar to Gulmarg & Gondola Ride',
    location: 'Gulmarg',
    description: 'Scenic drive to Gulmarg. Gondola cable car ride to Apharwat peak.',
    notes: 'Carry warm jackets; Phase 2 temperature can drop below freezing.',
    items: [
      {
        id: 'item-201',
        dayId: 'day-demo-2',
        tripId: 'trip-demo-01',
        type: 'HOTEL',
        title: 'The Khyber Himalayan Resort & Spa - Premier Pine View Room',
        description: 'MAP Plan (Breakfast + Dinner). Heated indoor pool & luxury amenities.',
        referenceId: 'demo-hotel-01',
        supplierCost: 14000,
        sellingPrice: 20000,
        metadata: { hotelId: 'demo-hotel-01', roomType: 'Premier Pine View Room', mealPlan: 'MAP', rooms: 1, guests: 2 }
      },
      {
        id: 'item-202',
        dayId: 'day-demo-2',
        tripId: 'trip-demo-01',
        type: 'TRANSPORT',
        title: 'Innova Crysta AC - Srinagar to Gulmarg Excursion',
        description: 'Full-day vehicle with snow chains if needed.',
        referenceId: 'demo-trans-01',
        supplierCost: 3400,
        sellingPrice: 4800,
        metadata: { vehicleType: 'Innova Crysta AC', pickup: 'Srinagar', dropoff: 'Gulmarg' }
      },
      {
        id: 'item-203',
        dayId: 'day-demo-2',
        tripId: 'trip-demo-01',
        type: 'ACTIVITY',
        title: 'Gulmarg Gondola Phase 1 & 2 Cable Car Ticket Assistance',
        description: 'High-altitude cable car up to 13,780 ft Apharwat peak.',
        referenceId: 'demo-act-01',
        supplierCost: 3700,
        sellingPrice: 4900,
        metadata: { activityId: 'demo-act-01', participants: 2 }
      }
    ]
  },
  {
    id: 'day-demo-3',
    tripId: 'trip-demo-01',
    dayNumber: 3,
    date: '2026-10-14',
    title: 'Gulmarg to Pahalgam Valley of Shepherds',
    location: 'Pahalgam',
    description: 'Drive via saffron fields of Pampore and Apple valley. Check-in at riverside luxury resort.',
    items: [
      {
        id: 'item-301',
        dayId: 'day-demo-3',
        tripId: 'trip-demo-01',
        type: 'HOTEL',
        title: 'Pine N Peak Hotel by ITC - Superior Valley Room',
        description: 'MAP Plan (Breakfast + Dinner). Overlooking Lidder river.',
        referenceId: 'demo-hotel-04',
        supplierCost: 9000,
        sellingPrice: 13500,
        metadata: { hotelId: 'demo-hotel-04', roomType: 'Superior Valley Room', mealPlan: 'MAP', rooms: 1, guests: 2 }
      },
      {
        id: 'item-302',
        dayId: 'day-demo-3',
        tripId: 'trip-demo-01',
        type: 'TRANSPORT',
        title: 'Innova Crysta AC - Gulmarg to Pahalgam Transit',
        description: 'Dedicated transit with stops at Pampore saffron farms.',
        referenceId: 'demo-trans-01',
        supplierCost: 3400,
        sellingPrice: 4800,
        metadata: { vehicleType: 'Innova Crysta AC', pickup: 'Gulmarg', dropoff: 'Pahalgam' }
      }
    ]
  },
  {
    id: 'day-demo-4',
    tripId: 'trip-demo-01',
    dayNumber: 4,
    date: '2026-10-15',
    title: 'Pahalgam Local Exploration: Betaab & Aru Valley',
    location: 'Pahalgam',
    description: 'Excursion to Betaab Valley and picturesque Aru Valley.',
    items: [
      {
        id: 'item-401',
        dayId: 'day-demo-4',
        tripId: 'trip-demo-01',
        type: 'HOTEL',
        title: 'Pine N Peak Hotel by ITC - Superior Valley Room',
        description: 'MAP Plan (Breakfast + Dinner).',
        referenceId: 'demo-hotel-04',
        supplierCost: 9000,
        sellingPrice: 13500,
        metadata: { hotelId: 'demo-hotel-04', roomType: 'Superior Valley Room', mealPlan: 'MAP', rooms: 1, guests: 2 }
      },
      {
        id: 'item-402',
        dayId: 'day-demo-4',
        tripId: 'trip-demo-01',
        type: 'ACTIVITY',
        title: 'Pahalgam Betaab Valley & Aru Valley Private 4x4 Excursion',
        description: 'Private 4x4 union jeep covering Betaab Valley and Chandanwari.',
        referenceId: 'demo-act-03',
        supplierCost: 2400,
        sellingPrice: 3500,
        metadata: { activityId: 'demo-act-03', participants: 2 }
      }
    ]
  },
  {
    id: 'day-demo-5',
    tripId: 'trip-demo-01',
    dayNumber: 5,
    date: '2026-10-16',
    title: 'Pahalgam to Srinagar Airport Departure',
    location: 'Srinagar Airport',
    description: 'Breakfast at hotel, transfer to Srinagar airport for departure flight.',
    items: [
      {
        id: 'item-501',
        dayId: 'day-demo-5',
        tripId: 'trip-demo-01',
        type: 'TRANSPORT',
        title: 'Innova Crysta AC - Pahalgam to Srinagar Airport Drop',
        description: 'Timely airport departure transfer.',
        referenceId: 'demo-trans-01',
        supplierCost: 3400,
        sellingPrice: 4800,
        metadata: { vehicleType: 'Innova Crysta AC', pickup: 'Pahalgam', dropoff: 'Srinagar Airport' }
      }
    ]
  }
];

export const DEMO_HOTELS: Hotel[] = [
  {
    id: 'demo-hotel-01',
    name: 'The Khyber Himalayan Resort & Spa',
    destination: 'Gulmarg',
    category: '5 Star Luxury',
    address: 'Gulmarg, Jammu and Kashmir 193403',
    contact: '+91 99066 88888',
    supplierId: 'demo-supplier-01',
    description: 'Premier world-class luxury resort with heated pool and Pir Panjal views.',
    amenities: ['Indoor Heated Pool', 'L\'Occitane Spa', 'Ski Assistance', 'Fine Dining', 'WiFi'],
    active: true,
    isDemo: true
  },
  {
    id: 'demo-hotel-02',
    name: 'The Lalit Grand Palace Srinagar',
    destination: 'Srinagar',
    category: 'Heritage 5 Star',
    address: 'Gupkar Road, Srinagar 190001',
    contact: '+91 194 250 1001',
    supplierId: 'demo-supplier-01',
    description: 'Historic royal residence built by Maharaja Pratap Singh overlooking Dal Lake.',
    amenities: ['Heritage Gardens', 'Golf Course', 'Fine Dining', 'Luxury Spa', 'Lake View'],
    active: true,
    isDemo: true
  },
  {
    id: 'demo-hotel-03',
    name: 'Mascot Houseboats - Nigeen Lake',
    destination: 'Srinagar',
    category: 'Luxury Cedar Houseboat',
    address: 'Nigeen Lake West Bank, Srinagar 190006',
    contact: '+91 94190 22334',
    supplierId: 'demo-supplier-01',
    description: 'Handcrafted walnut and cedar wood houseboat offering peaceful waters and private butler service.',
    amenities: ['Private Sun Deck', 'Kashmiri Cuisine', 'Private Shikara Access', 'Wi-Fi', 'Heating'],
    active: true,
    isDemo: true
  },
  {
    id: 'demo-hotel-04',
    name: 'Pine N Peak Hotel by ITC',
    destination: 'Pahalgam',
    category: '4 Star Premium Resort',
    address: 'Aru Road, Pahalgam 192126',
    contact: '+91 1936 243 210',
    supplierId: 'demo-supplier-01',
    description: 'Scenic mountain resort nestled on the Rajwas plateau overlooking Lidder Valley.',
    amenities: ['Lidder View Lawn', 'Multi-Cuisine Dining', 'Bonfire', 'Activity Center'],
    active: true,
    isDemo: true
  },
  {
    id: 'demo-hotel-05',
    name: 'The Grand Dragon Ladakh',
    destination: 'Ladakh',
    category: '5 Star Deluxe',
    address: 'Old Road Sheynam, Leh 194101',
    contact: '+91 1982 255 886',
    supplierId: 'demo-supplier-01',
    description: 'Centrally heated luxury hotel equipped with solar panels and oxygen support.',
    amenities: ['Oxygen Concentrators', 'Central Heating', 'Cultural Shows', 'Bakery', 'Mountain View'],
    active: true,
    isDemo: true
  }
];

export const DEMO_HOTEL_ROOMS: HotelRoom[] = [
  {
    id: 'room-khyber-01',
    hotelId: 'demo-hotel-01',
    roomType: 'Premier Pine View Room',
    mealPlan: 'MAP (Breakfast + Dinner)',
    supplierCost: 14000,
    sellingPrice: 20000,
    currency: 'INR'
  },
  {
    id: 'room-khyber-02',
    hotelId: 'demo-hotel-01',
    roomType: 'Luxury Heritage Suite',
    mealPlan: 'MAP (Breakfast + Dinner)',
    supplierCost: 22000,
    sellingPrice: 32000,
    currency: 'INR'
  },
  {
    id: 'room-lalit-01',
    hotelId: 'demo-hotel-02',
    roomType: 'Palace Room Lake View',
    mealPlan: 'CP (Breakfast Only)',
    supplierCost: 12000,
    sellingPrice: 17500,
    currency: 'INR'
  },
  {
    id: 'room-mascot-01',
    hotelId: 'demo-hotel-03',
    roomType: 'Royal Cedar Suite',
    mealPlan: 'MAP (Breakfast + Dinner)',
    supplierCost: 6500,
    sellingPrice: 10500,
    currency: 'INR'
  },
  {
    id: 'room-pine-01',
    hotelId: 'demo-hotel-04',
    roomType: 'Superior Valley Room',
    mealPlan: 'MAP (Breakfast + Dinner)',
    supplierCost: 9000,
    sellingPrice: 13500,
    currency: 'INR'
  },
  {
    id: 'room-dragon-01',
    hotelId: 'demo-hotel-05',
    roomType: 'Deluxe Mountain View',
    mealPlan: 'MAP (Breakfast + Dinner)',
    supplierCost: 10000,
    sellingPrice: 15000,
    currency: 'INR'
  }
];

export const DEMO_HOTEL_BOOKINGS: any[] = [];

export const DEMO_TRANSPORTS: Transport[] = [
  {
    id: 'demo-trans-01',
    tripId: 'trip-demo-01',
    date: '2026-10-12',
    pickup: 'Srinagar Airport',
    dropoff: 'Srinagar / Gulmarg / Pahalgam Circuit',
    vehicleType: 'Innova Crysta AC (6 Seater)',
    supplierId: 'demo-supplier-02',
    supplierCost: 3400,
    sellingPrice: 4800,
    profit: 1400,
    status: 'CONFIRMED',
    notes: 'Clean vehicle with verified mountain chauffeur.'
  },
  {
    id: 'demo-trans-02',
    tripId: 'trip-demo-01',
    date: '2026-10-13',
    pickup: 'Leh Kushok Bakula Airport',
    dropoff: 'Nubra Valley & Pangong Tso 4x4 Circuit',
    vehicleType: 'Toyota Fortuner 4x4 (High Passes)',
    supplierId: 'demo-supplier-02',
    supplierCost: 5500,
    sellingPrice: 7800,
    profit: 2300,
    status: 'CONFIRMED',
    notes: 'Oxygen cylinder equipped.'
  },
  {
    id: 'demo-trans-03',
    tripId: 'trip-demo-01',
    date: '2026-10-14',
    pickup: 'Jammu Railway Station / Airport',
    dropoff: 'Katra Vaishno Devi & Patnitop',
    vehicleType: 'Force Tempo Traveller (12 Seater)',
    supplierId: 'demo-supplier-02',
    supplierCost: 5800,
    sellingPrice: 8200,
    profit: 2400,
    status: 'CONFIRMED',
    notes: 'Group transit with AC & pushback seats.'
  },
  {
    id: 'demo-trans-04',
    tripId: 'trip-demo-01',
    date: '2026-10-15',
    pickup: 'Srinagar Local Stays',
    dropoff: 'Mughal Gardens & Old City Circuit',
    vehicleType: 'Toyota Etios / Dzire AC (4 Seater)',
    supplierId: 'demo-supplier-02',
    supplierCost: 2200,
    sellingPrice: 3200,
    profit: 1000,
    status: 'CONFIRMED',
    notes: 'Comfortable sedan for couples and city touring.'
  }
];

export const DEMO_DRIVERS: Driver[] = [
  {
    id: 'demo-driver-01',
    name: 'Tariq Ahmed Bhat',
    phone: '+91 94190 12345',
    vehicleType: 'Innova Crysta AC',
    vehicleNumber: 'JK01AB1234',
    supplierId: 'demo-supplier-02',
    active: true,
    notes: 'Senior chauffeur with 12 years Himalayan mountain driving experience. Polite and fluent in Hindi/English.',
    isDemo: true
  },
  {
    id: 'demo-driver-02',
    name: 'Stanzin Dorjey',
    phone: '+91 94191 88776',
    vehicleType: 'Toyota Fortuner 4x4',
    vehicleNumber: 'LA02C9988',
    supplierId: 'demo-supplier-02',
    active: true,
    notes: 'High-altitude specialist for Khardung La, Chang La and Zanskar tracks.',
    isDemo: true
  }
];

export const DEMO_ACTIVITIES: Activity[] = [
  {
    id: 'demo-act-01',
    name: 'Gulmarg Gondola Phase 1 & 2 Cable Car Ticket Assistance',
    destination: 'Gulmarg',
    supplierId: 'demo-supplier-01',
    description: 'High-altitude cable car up to 13,780 ft Apharwat peak with snow activity support.',
    supplierCost: 1850,
    sellingPrice: 2450,
    active: true,
    isDemo: true
  },
  {
    id: 'demo-act-02',
    name: 'Private Sunset Shikara Ride on Nigeen Lake with Kahwa',
    destination: 'Srinagar',
    supplierId: 'demo-supplier-01',
    description: '1.5-hour peaceful wooden boat cruise across tranquil waters with authentic saffron tea.',
    supplierCost: 700,
    sellingPrice: 1300,
    active: true,
    isDemo: true
  },
  {
    id: 'demo-act-03',
    name: 'Pahalgam Betaab Valley & Aru Valley Private 4x4 Excursion',
    destination: 'Pahalgam',
    supplierId: 'demo-supplier-02',
    description: 'Local union jeep tour covering Betaab Valley, Aru Valley, and Chandanwari.',
    supplierCost: 2400,
    sellingPrice: 3500,
    active: true,
    isDemo: true
  },
  {
    id: 'demo-act-04',
    name: 'Hunder Sand Dunes Double-Humped Bactrian Camel Safari',
    destination: 'Ladakh',
    supplierId: 'demo-supplier-02',
    description: '30-minute camel safari across high-altitude white sand dunes of Nubra Valley.',
    supplierCost: 750,
    sellingPrice: 1200,
    active: true,
    isDemo: true
  },
  {
    id: 'demo-act-05',
    name: 'Authentic 7-Course Kashmiri Wazwan Experience',
    destination: 'Srinagar',
    supplierId: 'demo-supplier-01',
    description: 'Traditional feast with Rogan Josh, Rista, Gushtaba, and Tabak Maaz served on copper Traem.',
    supplierCost: 1800,
    sellingPrice: 2600,
    active: true,
    isDemo: true
  }
];

export const DEMO_ACTIVITY_BOOKINGS: any[] = [];

export const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: 'demo-supplier-01',
    name: 'Himalayan Hospitality & Resorts Alliance',
    type: 'HOTEL',
    contactPerson: 'Nasir Mir',
    phone: '+91 99066 88888',
    email: 'contracts@himalayanalliancestays.com',
    city: 'Srinagar',
    paymentTerms: '30% Advance, Balance on Check-in',
    active: true,
    isDemo: true
  },
  {
    id: 'demo-supplier-02',
    name: 'J&K Royal Transport Fleet Syndicate',
    type: 'TRANSPORT',
    contactPerson: 'Showkat Ali Dar',
    phone: '+91 94190 99999',
    email: 'fleet@jkroyaltransport.com',
    city: 'Srinagar',
    paymentTerms: 'Weekly Settlement (Postpaid)',
    active: true,
    isDemo: true
  }
];

export const DEMO_VOUCHERS: Voucher[] = [
  {
    id: 'vouch-demo-01',
    bookingId: 'book-demo-01',
    tripId: 'trip-demo-01',
    type: 'HOTEL',
    status: 'GENERATED',
    generatedAt: '2026-08-22T14:00:00Z',
    fileUrl: '/vouchers/vouch-demo-01.pdf',
    isDemo: true
  }
];


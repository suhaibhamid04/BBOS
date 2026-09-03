# Booking Bridge OS — Current Architecture Audit

> **Generated:** 2026-09-03  
> **Source of truth:** GitHub repository at `c:\Users\user\Documents\BBOS`  
> **Methodology:** Full file-by-file inspection. No assumptions — every statement references actual code.

---

## 1. High-Level Architecture

Booking Bridge OS is a **monorepo full-stack TypeScript application**:

| Layer | Technology | Entry Point |
|---|---|---|
| Frontend | React 19 + Vite 6 + Tailwind CSS 4 | `src/main.tsx` → `src/App.tsx` |
| Backend | Express 4 (served via `tsx` in dev) | `server.ts` → `server/routes/api.ts` |
| AI Layer | Google Gemini (`@google/genai`) — server-side | `server/ai/*.ts` |
| Database | Firebase Firestore (via `firebase` SDK) | `src/lib/firebase.ts` |
| Auth | Firebase Auth (partial) + Mock Role Switcher | `src/context/AuthContext.tsx` |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite` plugin) | `src/index.css` |
| Animation | Motion (Framer Motion fork) | `motion` package in deps |
| Icons | Lucide React | Used across all components |
| Build (prod) | Vite (frontend) + ESBuild (backend → `dist/server.cjs`) | `package.json` scripts |

### Runtime Modes

The application has two runtime modes controlled by a **hardcoded constant**:

```typescript
// src/config.ts
export const APP_CONFIG = {
  DEMO_MODE: true, // Set to false to use live Firestore data
};
```

- **`DEMO_MODE: true`** (current default): All data loaded from `src/services/demoData.ts` and persisted to `localStorage`. Firestore repositories return empty arrays.
- **`DEMO_MODE: false`**: Data fetched from Firestore via generic repositories. Write operations also push to Firestore.

---

## 2. Folder Structure

```
BBOS/
├── index.html                          # SPA entry point (title: "My Google AI Studio App")
├── server.ts                           # Express server entry point
├── package.json                        # Dependencies & scripts
├── vite.config.ts                      # Vite config with Tailwind + React plugins
├── tsconfig.json                       # TypeScript config (ES2022, bundler resolution)
├── firebase-applet-config.json         # Firebase project credentials (CHECKED IN)
├── firebase-blueprint.json             # Firestore collection schemas (6 collections)
├── firestore.rules                     # Security rules (WIDE OPEN: allow read, write: if true)
├── metadata.json                       # AI Studio metadata
├── .env.example                        # GEMINI_API_KEY, APP_URL
├── .gitignore
├── bun.lock                            # Bun lockfile
├── HANDOFF.md                          # Previous agent handoff notes
├── BOOKING_BRIDGE_OS_CHECKPOINT.md     # Development checkpoint notes
│
├── server/
│   ├── ai/
│   │   ├── aiClient.ts                 # Gemini client singleton
│   │   ├── salesAgent.ts               # Sales AI analysis agent
│   │   ├── marketingAgent.ts           # Marketing strategy agent
│   │   ├── commandCenterAgent.ts       # Command center query agent
│   │   └── toolGateway.ts             # Tool access validation + registry
│   └── routes/
│       └── api.ts                      # Express API router (4 endpoints)
│
├── src/
│   ├── main.tsx                        # React root mount
│   ├── App.tsx                         # App shell: AuthProvider → DataProvider → AppContent
│   ├── config.ts                       # APP_CONFIG { DEMO_MODE }
│   ├── index.css                       # Single line: @import "tailwindcss"
│   │
│   ├── context/
│   │   ├── AuthContext.tsx             # Auth state, role switching, Firebase Auth bridge
│   │   └── DataContext.tsx             # Central data store (829 lines, ALL state + CRUD)
│   │
│   ├── types/
│   │   └── index.ts                    # ALL TypeScript interfaces (695 lines, 40+ types)
│   │
│   ├── lib/
│   │   └── firebase.ts                 # Firebase init (App, Auth, Firestore)
│   │
│   ├── services/
│   │   ├── permissions.ts              # Role definitions (7 roles) + Preset users (8 users)
│   │   ├── demoData.ts                 # All demo/seed data (807 lines)
│   │   └── db/
│   │       └── repositories.ts         # Generic FirestoreRepository<T> + 24 repo instances
│   │
│   ├── utils/
│   │   └── aiTools.ts                  # Client-side AI tool functions (CRM, sales, analytics)
│   │
│   └── components/
│       ├── layout/
│       │   ├── AppLayout.tsx           # Shell: Sidebar + Header + content + FAB + modals
│       │   ├── Sidebar.tsx             # Nav groups with permission gating (NavSectionKey type)
│       │   ├── Header.tsx              # Top bar: search, demo controls, role switcher
│       │   ├── GlobalSearchModal.tsx   # Cmd+K search modal
│       │   ├── GlobalAiAssistantDrawer.tsx  # Floating AI chat drawer
│       │   └── RoleSwitcherModal.tsx   # Mock role/user switching modal
│       │
│       ├── dashboard/
│       │   └── CommandCenterDashboard.tsx   # Main dashboard with KPIs + pipeline + tasks
│       │
│       ├── command/
│       │   └── AiCommandCenterView.tsx     # AI Command Center chat interface
│       │
│       ├── crm/
│       │   ├── LeadsView.tsx               # Leads table + kanban view
│       │   ├── LeadDetailView.tsx          # Lead detail page (tabs: Summary, AI, Conversation)
│       │   ├── LeadDetailDrawer.tsx         # Inline lead detail drawer (from leads list)
│       │   ├── CreateLeadModal.tsx          # Lead creation form modal
│       │   ├── CustomersView.tsx            # Customer directory table
│       │   ├── CompaniesView.tsx            # B2B company accounts table
│       │   ├── ConversationsView.tsx        # Omnichannel conversation list + chat
│       │   └── AiSalesHeadTab.tsx           # AI Sales Head analysis tab (within lead detail)
│       │
│       ├── sales/
│       │   ├── MyWorkspace.tsx              # Sales executive personal workspace
│       │   ├── SalesPipelineView.tsx        # Pipeline kanban (all statuses)
│       │   ├── QuotesView.tsx               # Quotes list view
│       │   └── SalesAiView.tsx              # Sales AI copilot interface
│       │
│       ├── trips/
│       │   ├── TripBuilderView.tsx          # Trip builder with day-by-day itinerary editor
│       │   └── BookingsView.tsx             # Bookings registry table
│       │
│       ├── marketing/
│       │   ├── MarketingStrategyView.tsx    # Strategy pillars + destination matrix
│       │   ├── ContentCalendarView.tsx      # Content calendar management
│       │   ├── CampaignsView.tsx            # Ad campaign tracking
│       │   └── MarketingAiView.tsx          # Marketing AI generation engine
│       │
│       ├── operations/
│       │   ├── OperationsDashboard.tsx      # Ops KPIs + upcoming arrivals + pending actions
│       │   ├── TasksView.tsx                # Task management
│       │   ├── VouchersView.tsx             # Voucher generation/management
│       │   ├── NotificationsView.tsx        # System notifications
│       │   ├── IntegrationsView.tsx         # External API integrations view
│       │   └── SettingsView.tsx             # System settings
│       │
│       ├── analytics/
│       │   └── AnalyticsOverviewView.tsx    # Business overview analytics (shared for 3 nav items)
│       │
│       └── governance/
│           ├── EmployeesView.tsx            # Employee directory
│           ├── RolesPermissionsView.tsx     # RBAC matrix display
│           ├── AiPermissionsView.tsx        # AI autonomy level settings
│           ├── ApprovalsView.tsx            # Approval center (approve/reject AI actions)
│           └── AuditLogsView.tsx            # System audit log viewer
```

---

## 3. Routing Architecture

**There is NO client-side router** (no React Router, no URL-based routing). Navigation is handled via a **useState-based switch statement** in `App.tsx`:

```typescript
const [activeNav, setActiveNav] = useState<NavSectionKey>('dashboard');
```

`NavSectionKey` is a union of 30 string literals defined in `Sidebar.tsx`. The `renderActiveView()` function in `App.tsx` maps each key to a component via a switch statement.

### Navigation Keys (30 total)

| Group | Keys |
|---|---|
| Command Center | `dashboard`, `ai-command`, `tasks`, `notifications` |
| CRM | `leads`, `customers`, `companies`, `conversations` |
| Sales | `sales-workspace`, `sales-pipeline`, `quotes`, `sales-ai`, `lead-detail` |
| Trips & Bookings | `trips`, `bookings` |
| Operations | `operations-dashboard`, `vouchers` |
| Marketing | `marketing-strategy`, `content-calendar`, `campaigns`, `marketing-ai` |
| Analytics | `analytics-overview`, `analytics-sales`, `analytics-marketing` |
| Admin | `employees`, `roles-permissions`, `ai-permissions`, `integrations`, `approvals`, `audit-logs`, `settings` |

> **Issue:** `analytics-sales` and `analytics-marketing` both render the same `AnalyticsOverviewView` component.

---

## 4. Data Models (TypeScript Types)

All types defined in `src/types/index.ts` (695 lines, 40+ interfaces/types):

### Core Business Entities

| Entity | Type | Key Fields | Firestore Collection |
|---|---|---|---|
| UserProfile | Interface | id, name, email, role, department | — (hardcoded preset) |
| Customer | Interface | id, name, phone, email, city, customerType (B2C/B2B) | `customers` |
| Company | Interface | id, companyName, contactPerson, status, totalRevenue | `companies` |
| Lead | Interface | id, customerId, destination, status, leadScore, assignedEmployeeId | `leads` |
| Conversation | Interface | id, customerId, channel, assignedEmployeeId, lastMessage | `conversations` |
| Message | Interface | id, conversationId, senderType, content | `messages` |
| Task | Interface | id, title, assignedToName, priority, status, dueAt | `tasks` |
| Quote | Interface | id, leadId, destination, totalAmount, status | `quotes` |
| Booking | Interface | id, tripId, customerId, status, totalAmount | `bookings` |

### Trip Builder Entities

| Entity | Type | Key Fields | Firestore Collection |
|---|---|---|---|
| Trip | Interface | id, customerId, destination, status, totalCost, grossMargin | `trips` |
| ItineraryDay | Interface | id, tripId, dayNumber, items[] | `itinerary_days` |
| ItineraryItem | Interface | id, dayId, type, referenceId | — (nested) |
| Hotel | Interface | id, name, destination, supplierId | `hotels` |
| HotelRoom | Interface | id, hotelId, roomType, supplierCost, sellingPrice | `hotel_rooms` |
| HotelBooking | Interface | id, tripId, hotelId, status, profit | `hotel_bookings` |
| Transport | Interface | id, tripId, vehicleType, driverId | `transports` |
| Driver | Interface | id, name, phone, vehicleNumber, supplierId | `drivers` |
| Activity | Interface | id, name, destination, supplierCost, sellingPrice | `activities` |
| ActivityBooking | Interface | id, tripId, activityId, status | `activity_bookings` |
| Supplier | Interface | id, name, type (HOTEL/TRANSPORT/ACTIVITY/OTHER) | `suppliers` |
| Voucher | Interface | id, bookingId, tripId, type, status | `vouchers` |

### AI & Governance Entities

| Entity | Type | Key Fields |
|---|---|---|
| AiRecommendation | Interface | id, category, title, riskLevel, confidenceScore |
| AiAction | Interface | id, agent, actionType, riskLevel, status |
| ApprovalItem | Interface | id, actionId, status (PENDING/APPROVED/REJECTED) |
| AuditLog | Interface | id, timestamp, actorType, action, entityType |

### Marketing Entities

| Entity | Type | Key Fields |
|---|---|---|
| ContentItem | Interface | id, channel, contentType, status, approvalStatus |
| MarketingPillar | Interface | id, pillarName, destination, theme |
| AdCampaign | Interface | id, name, platform, budget, roas |
| AiAgentConfig | Interface | id, name, autonomyLevel, permittedTools |

### Supporting Types

| Type | Values |
|---|---|
| UserRole | `Founder`, `Admin`, `Sales Manager`, `Sales Executive`, `Marketing`, `Operations`, `Accounts` |
| LeadStatus | `NEW`, `CONTACTED`, `QUALIFIED`, `QUOTE_SENT`, `NEGOTIATION`, `BOOKED`, `LOST`, `NURTURE` |
| TripStatus | `DRAFT`, `ITINERARY_READY`, `QUOTE_READY`, `QUOTE_SENT`, `ACCEPTED`, `BOOKED`, `IN_OPERATIONS`, `COMPLETED`, `CANCELLED` |
| BookingStatus | `PENDING_PAYMENT`, `CONFIRMED`, `IN_OPERATIONS`, `TRAVELLING`, `COMPLETED`, `CANCELLED` |
| DestinationRegion | `Kashmir`, `Jammu`, `Ladakh`, `Himachal`, `Kerala`, `Goa`, `Golden Triangle`, `General`, `Other Domestic` |
| Priority | `LOW`, `MEDIUM`, `HIGH`, `URGENT` |

---

## 5. Database Architecture

### Firestore Configuration

- **Project ID:** `universal-arcana-hfjbn`
- **Database ID:** `ai-studio-bookingbridgeos-8aefbd9f-1742-416b-a910-89af02f43af2` (non-default)
- **Credentials:** Hardcoded in `firebase-applet-config.json` (checked into git)

### Repository Layer

`src/services/db/repositories.ts` implements a generic `FirestoreRepository<T>` class with methods: `getById`, `getAll`, `create`, `update`, `delete`. All 24 repositories are instantiated with `<any>` type parameter, losing type safety:

```typescript
export const LeadRepo = new FirestoreRepository<any>('leads');
```

**24 Firestore Collections Registered:**
`employees`, `customers`, `companies`, `leads`, `conversations`, `messages`, `tasks`, `quotes`, `bookings`, `trips`, `itinerary_days`, `hotels`, `hotel_rooms`, `hotel_bookings`, `transports`, `drivers`, `activities`, `activity_bookings`, `suppliers`, `vouchers`, `packages`, `audit_logs`, `ai_recommendations`, `ai_actions`, `approvals`

### Firebase Blueprint (Documented Schema)

`firebase-blueprint.json` only documents **6 collections**: `leads`, `customers`, `companies`, `tasks`, `quotes`, `bookings`. The remaining 18+ collections have no documented schema.

### Security Rules

```
match /{document=**} {
  allow read, write: if true;
}
```

> **CRITICAL:** Firestore is completely open to all reads and writes. No authentication required.

---

## 6. Authentication & Authorization

### Current State

Authentication is **hybrid mock + Firebase**:

1. **Mock System (Primary):** 8 preset users defined in `src/services/permissions.ts` (`PRESET_USERS`). The `RoleSwitcherModal` allows instant persona switching. Active user persisted to `localStorage` key `booking_bridge_active_user`.

2. **Firebase Auth (Secondary/Optional):** `AuthContext.tsx` imports Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`). The `onAuthStateChanged` listener syncs Firebase user email/name to the current mock user. Firebase Auth status tracked via `isFirebaseAuthenticated` boolean but **not enforced** for any access control.

### RBAC System

7 roles defined in `ROLE_DEFINITIONS` with 14 permission flags:

| Permission | Founder | Admin | Sales Mgr | Sales Exec | Marketing | Operations | Accounts |
|---|---|---|---|---|---|---|---|
| canViewAllSales | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| canManageLeads | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| canSendQuotes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| canManageMarketing | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| canViewFinancials | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| canManageOperations | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| canManageUsers | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canAccessAiCommand | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| canApproveActions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| canViewAuditLogs | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| canManageSettings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| canManageTrips | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| canManageBookings | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| canViewMargins | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| leadAccessScope | ALL | ALL | ALL | ASSIGNED | NONE | NONE | ALL |

> **Issue:** Permissions are only enforced at the **UI navigation level** (sidebar visibility). There is no backend/API authorization middleware.

---

## 7. API & Service Layer

### Server API Endpoints (4 total)

| Method | Path | Handler | Purpose |
|---|---|---|---|
| GET | `/api/health` | Inline | Health check + AI configuration status |
| POST | `/api/ai/sales-analyze` | `salesAgent.ts` | Gemini-powered lead analysis |
| POST | `/api/ai/marketing-strategy` | `marketingAgent.ts` | Gemini-powered marketing strategy |
| POST | `/api/ai/command-center` | `commandCenterAgent.ts` | Gemini-powered business Q&A |
| POST | `/api/tools/execute` | `toolGateway.ts` | Tool invocation with role validation |

> **Issue:** `/api/tools/execute` validates role access but does NOT actually execute any tools — it returns a static success response.

### Frontend Service Calls (in DataContext.tsx)

All AI calls are `fetch()` calls to the backend API:
- `runSalesAiAnalysis(leadId)` → `POST /api/ai/sales-analyze`
- `runMarketingStrategy(dest, season, objective)` → `POST /api/ai/marketing-strategy`
- `runMarketingAiGenerate(params)` → Wraps `runMarketingStrategy` + transforms output
- `askCommandCenterAi(question)` → `POST /api/ai/command-center`
- `queryCommandCenter` → Alias for `askCommandCenterAi`

### Data CRUD Operations (in DataContext.tsx)

All CRUD is handled via React `useState` + inline functions in DataContext (829 lines):

| Operation | Entities Supported | Persistence |
|---|---|---|
| Create | Lead, Customer, Task, ContentItem, Quote, Approval | localStorage + optional Firestore |
| Read | All 18+ entities | localStorage (demo) or Firestore |
| Update | Lead, Customer, Task status | localStorage only |
| Delete | — | Not implemented for any entity |

> **Issue:** `approveApproval` and `rejectApproval` in the context interface are just aliases for `approveAction` and `rejectAction`. Similarly, `queryCommandCenter` is an alias for `askCommandCenterAi`.

---

## 8. AI Integrations

### Gemini Model Configuration

All AI agents use `gemini-2.5-flash` with `responseMimeType: 'application/json'`.

| Agent | File | System Persona | Function |
|---|---|---|---|
| Sales AI | `server/ai/salesAgent.ts` | "Sales AI specialist for Booking Bridge" | Lead scoring, objection analysis, WhatsApp reply drafts |
| Marketing AI | `server/ai/marketingAgent.ts` | "Chief Marketing Strategist for Booking Bridge" | Campaign ideas, content pillars, CPL targets |
| Command Center | `server/ai/commandCenterAgent.ts` | "Central intelligence assistant of Booking Bridge OS" | Business Q&A, entity identification, action suggestions |

### AI Tool Gateway

`server/ai/toolGateway.ts` defines a `TOOL_REGISTRY` with 7 registered tools:

| Tool | Risk | Requires Approval | Permitted Roles |
|---|---|---|---|
| `crm.getLead` | LOW | No | Founder, Admin, Sales Mgr, Sales Exec |
| `crm.updateLead` | MEDIUM | No | Founder, Admin, Sales Mgr, Sales Exec |
| `crm.createTask` | LOW | No | Founder, Admin, Sales Mgr, Sales Exec, Operations |
| `sales.generateQuote` | MEDIUM | No | Founder, Admin, Sales Mgr, Sales Exec |
| `marketing.createContentDraft` | LOW | No | Founder, Admin, Marketing |
| `meta.createCampaign` | HIGH | Yes | Founder, Marketing |
| `social.publishPost` | HIGH | Yes | Founder, Marketing |

> **Issue:** The tool gateway validates access but **never actually executes** any tools. The API endpoint returns a static success message.

### Client-Side AI Tools

`src/utils/aiTools.ts` has helper functions (`crmTools`, `salesTools`, `analyticsTools`) but they are **not imported or used anywhere** in the codebase.

---

## 9. DEMO_MODE Architecture

`DEMO_MODE` is controlled by `src/config.ts` and affects the entire data layer:

### How DEMO_MODE Works

1. **DataContext.tsx:** Each state variable initializes from `localStorage` with fallback to `DEMO_*` constants from `demoData.ts`
2. **repositories.ts:** All repository methods short-circuit and return empty arrays/null when `DEMO_MODE: true`
3. **localStorage sync:** 18 separate `useEffect` hooks sync each state array to its own `localStorage` key (`bb_leads`, `bb_customers`, etc.)
4. **Header.tsx:** Exposes "Seed Demo Data" and "Clear Demo Data" buttons via a dropdown menu
5. **Sidebar.tsx:** Shows a "DEMO MODE" badge next to the brand name

### Demo Data Entities (from `demoData.ts`, 807 lines)

| Export | Count | Description |
|---|---|---|
| `INITIAL_PACKAGES` | 3 | Kashmir, Ladakh, Jammu travel packages |
| `DEMO_CUSTOMERS` | 4 | B2C + B2B customers |
| `DEMO_COMPANIES` | 2+ | Corporate accounts |
| `DEMO_LEADS` | Multiple | Leads across various statuses |
| `DEMO_CONVERSATIONS` | Multiple | WhatsApp/Instagram conversations |
| `DEMO_MESSAGES` | Multiple | Chat messages |
| `DEMO_TASKS` | Multiple | Follow-up tasks |
| `DEMO_QUOTES` | Multiple | Travel quotes |
| `DEMO_BOOKINGS` | Multiple | Confirmed bookings |
| `DEMO_RECOMMENDATIONS` | Multiple | AI recommendations |
| `DEMO_ACTIONS` | Multiple | AI proposed actions |
| `DEMO_APPROVALS` | Multiple | Pending approval items |
| `DEMO_AUDIT_LOGS` | Multiple | System audit trail |
| `SYSTEM_INTEGRATIONS` | Multiple | Integration placeholders |
| `DEMO_CONTENT_CALENDAR` | Multiple | Marketing content items |
| `DEMO_PILLARS` | Multiple | Marketing pillars |
| `DEMO_CAMPAIGNS` | Multiple | Ad campaigns |
| `DEMO_AI_AGENTS` | Multiple | AI agent configs |
| `DEMO_TRIPS` | Multiple | Trip records |
| `DEMO_ITINERARIES` | Multiple | Day-by-day itineraries |
| `DEMO_HOTELS` | Multiple | Hotel inventory |
| `DEMO_HOTEL_ROOMS` | Multiple | Room types + rates |
| `DEMO_HOTEL_BOOKINGS` | Multiple | Hotel reservations |
| `DEMO_TRANSPORTS` | Multiple | Transport bookings |
| `DEMO_DRIVERS` | Multiple | Driver records |
| `DEMO_ACTIVITIES` | Multiple | Activity inventory |
| `DEMO_ACTIVITY_BOOKINGS` | Multiple | Activity reservations |
| `DEMO_SUPPLIERS` | Multiple | Supplier records |
| `DEMO_VOUCHERS` | Multiple | Voucher records |

---

## 10. Major Components Summary

### Layout Components (6 files)

| Component | Purpose | Size |
|---|---|---|
| `AppLayout` | Shell: sidebar + header + content + FAB + modals | 4.4 KB |
| `Sidebar` | Collapsible nav groups, permission-gated items | 12.2 KB |
| `Header` | Breadcrumb, search trigger, demo controls, role switcher | 7.0 KB |
| `GlobalSearchModal` | Cmd+K global search (leads, customers, tasks) | 8.2 KB |
| `GlobalAiAssistantDrawer` | Floating AI chat panel | 10.2 KB |
| `RoleSwitcherModal` | Mock user/role switching modal | 10.0 KB |

### CRM Components (8 files)

| Component | Purpose | Size |
|---|---|---|
| `LeadsView` | Lead table + kanban with search/filter | 17.1 KB |
| `LeadDetailView` | Multi-tab lead detail (Summary, AI, Conversation) | 17.6 KB |
| `LeadDetailDrawer` | Inline drawer version of lead detail | 24.0 KB |
| `CreateLeadModal` | Lead creation form | 12.6 KB |
| `CustomersView` | Customer directory with search/filter | 13.0 KB |
| `CompaniesView` | B2B company accounts table | 2.8 KB |
| `ConversationsView` | Omnichannel chat interface | 9.4 KB |
| `AiSalesHeadTab` | AI analysis tab within lead detail | 18.9 KB |

### Sales Components (4 files)

| Component | Purpose | Size |
|---|---|---|
| `MyWorkspace` | Sales executive personal dashboard | 9.8 KB |
| `SalesPipelineView` | Pipeline kanban board | 4.7 KB |
| `QuotesView` | Quote list + status management | 7.2 KB |
| `SalesAiView` | Sales AI copilot chat interface | 11.5 KB |

### Trip & Booking Components (2 files)

| Component | Purpose | Size |
|---|---|---|
| `TripBuilderView` | Day-by-day itinerary builder + costing engine | 19.1 KB |
| `BookingsView` | Booking registry table | 6.2 KB |

### Marketing Components (4 files)

| Component | Purpose | Size |
|---|---|---|
| `MarketingStrategyView` | Strategy pillars + destination matrix | 5.1 KB |
| `ContentCalendarView` | Content calendar with create/schedule | 9.1 KB |
| `CampaignsView` | Ad campaign tracking table | 5.2 KB |
| `MarketingAiView` | Marketing AI generation engine | 14.7 KB |

### Operations Components (6 files)

| Component | Purpose | Size |
|---|---|---|
| `OperationsDashboard` | Ops KPIs + arrivals + pending actions | 8.8 KB |
| `TasksView` | Task management with filters | 10.2 KB |
| `VouchersView` | Voucher generation/management | 5.3 KB |
| `NotificationsView` | System notifications list | 2.3 KB |
| `IntegrationsView` | External API integration cards | 4.0 KB |
| `SettingsView` | System settings form | 4.8 KB |

### Governance Components (5 files)

| Component | Purpose | Size |
|---|---|---|
| `EmployeesView` | Employee directory | 4.2 KB |
| `RolesPermissionsView` | RBAC permission matrix display | 4.5 KB |
| `AiPermissionsView` | AI autonomy level controls | 4.3 KB |
| `ApprovalsView` | Approve/reject AI actions | 8.2 KB |
| `AuditLogsView` | Audit log timeline viewer | 4.5 KB |

### Analytics Components (1 file)

| Component | Purpose | Size |
|---|---|---|
| `AnalyticsOverviewView` | Business overview with computed metrics | 7.1 KB |

---

## 11. Environment Variables

From `.env.example`:

| Variable | Purpose | Required |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for server-side AI | Yes (for AI features) |
| `APP_URL` | Cloud Run service URL | For production deployment |

Additional build-time env vars:
- `DISABLE_HMR` — Disables Vite HMR + file watching (AI Studio feature)
- `NODE_ENV` — Production vs development server behavior

---

## 12. Deployment Architecture

### Development
- `npm run dev` / `bun run dev` → `tsx server.ts` (Express + Vite middleware mode)
- Vite serves frontend with HMR at port 3000

### Production Build
- `npm run build` → `vite build` (frontend → `dist/`) + `esbuild server.ts` (backend → `dist/server.cjs`)
- `npm run start` → `node dist/server.cjs` (serves static `dist/` files)

### Target Platform
- **Google Cloud Run** (as noted in `metadata.json` and `HANDOFF.md`)
- Originally created in **Google AI Studio** (applet framework)

---

## 13. External Integrations

### Currently Connected
- **Firebase Firestore:** Data persistence (when `DEMO_MODE: false`)
- **Firebase Auth:** User authentication (partially implemented)
- **Google Gemini API:** AI agents (sales, marketing, command center)

### Planned but NOT Connected (listed in IntegrationsView UI)
- Meta Ads API
- Google Ads API
- WhatsApp Cloud API
- Instagram Graph API
- Razorpay (payments)
- Email/SMTP
- Canva (creative)

---

## 14. Known Incomplete Features

| Feature | Status | Details |
|---|---|---|
| Trip creation workflow | ❌ Incomplete | "New Trip" button exists but no form/modal wired |
| Component addition in Trip Builder | ❌ Incomplete | "Add Hotel", "Add Transport", "Add Activity" buttons exist but no action handlers |
| Save Draft / Generate Quote in Trip Builder | ❌ Incomplete | Buttons render but have no click handlers |
| Operations action buttons | ❌ Incomplete | "Mark Confirmed", "Assign Driver", "Generate" buttons not functional |
| Tool execution gateway | ❌ Incomplete | `/api/tools/execute` validates access but returns static response |
| Real authentication enforcement | ❌ Incomplete | Firebase Auth is set up but login is never required |
| Lead-to-Quote-to-Booking pipeline | ❌ Incomplete | No automated state propagation between entities |
| Delete operations | ❌ Missing | No delete functionality for any entity |
| Notification system | ❌ Stub | `NotificationsView` exists but no notification generation/delivery logic |
| Settings persistence | ❌ Stub | `SettingsView` renders a form but changes are not saved |
| Integration connections | ❌ Stub | All integrations show as "NOT_CONNECTED" or "REQUIRES_AUTH" |
| Analytics (Sales/Marketing) | ⚠️ Partial | All three analytics nav items render the same overview component |
| Client-side AI tools | ❌ Unused | `src/utils/aiTools.ts` is defined but never imported |

---

## 15. Known Bugs & Issues

| # | Severity | Issue | Location |
|---|---|---|---|
| 1 | 🔴 CRITICAL | Firestore rules allow `read, write: if true` — completely open database | `firestore.rules` |
| 2 | 🔴 CRITICAL | Firebase credentials (API key, project ID) committed to git | `firebase-applet-config.json` |
| 3 | 🟠 HIGH | `index.html` title is "My Google AI Studio App" — not branded | `index.html:6` |
| 4 | 🟠 HIGH | No API authentication — all backend endpoints are unauthenticated | `server/routes/api.ts` |
| 5 | 🟡 MEDIUM | Duplicate `vite` dependency in `package.json` (dependencies AND devDependencies) | `package.json:25,34` |
| 6 | 🟡 MEDIUM | All Firestore repositories use `<any>` type — no type safety | `repositories.ts` |
| 7 | 🟡 MEDIUM | 18 separate `useEffect` hooks for localStorage sync in DataContext | `DataContext.tsx:338-395` |
| 8 | 🟡 MEDIUM | `leadAccessScope: 'ASSIGNED_ONLY'` is defined but **not enforced** in data filtering | `DataContext.tsx` |
| 9 | 🟡 MEDIUM | Dashboard KPI values fallback to hardcoded numbers when real data is 0 (e.g., `leads.length \|\| 142`) | `CommandCenterDashboard.tsx:76` |
| 10 | 🟢 LOW | `TripBuilderView` references `activeTrip.tripName` but `Trip` type defines `title` not `tripName` | `TripBuilderView.tsx:48` |
| 11 | 🟢 LOW | `TripBuilderView` references `activeTrip.itinerary` but `Trip` type has no `itinerary` field | `TripBuilderView.tsx:33` |

---

## 16. Technical Debt

| Area | Debt Description |
|---|---|
| **God Context** | `DataContext.tsx` (829 lines) is a massive single context managing ALL state, ALL CRUD, ALL AI calls. Should be split into domain-specific contexts or use a state manager. |
| **No URL routing** | State-based navigation means no deep linking, no browser back/forward, no shareable URLs. |
| **No component library** | Every component implements its own buttons, cards, modals, tables from scratch with inline Tailwind classes. No design system primitives. |
| **No error boundaries** | No React error boundaries anywhere in the component tree. |
| **No loading states** | `isLoading` exists in context but is not used by any component for skeleton/loading UI. |
| **No pagination** | All data is loaded into memory at once. No pagination for leads, customers, bookings. |
| **No form validation library** | Forms use basic HTML validation or inline checks. |
| **No testing** | Zero test files. No unit tests, integration tests, or E2E tests. |
| **Inline type casting** | Extensive use of `as any` throughout DataContext Firestore operations. |
| **CSS approach** | Only `@import "tailwindcss"` in index.css. All styling is inline Tailwind utilities with no design tokens. |
| **Unused code** | `src/utils/aiTools.ts` is never imported. `DEMO_ITINERARIES`, `DEMO_HOTEL_ROOMS`, `DEMO_HOTEL_BOOKINGS`, `DEMO_ACTIVITY_BOOKINGS` are exported from demoData but not consumed by DataContext. |
| **No ENV validation** | No runtime validation that required env vars (GEMINI_API_KEY) are present. |

---

## 17. Duplicate / Overlapping Implementations

| Overlap | Files | Description |
|---|---|---|
| **Lead detail UI** | `LeadDetailView.tsx` (17.6 KB) + `LeadDetailDrawer.tsx` (24 KB) | Two separate implementations of lead detail — one as a full page view, one as a drawer. Significant code duplication. |
| **AI chat interfaces** | `AiCommandCenterView.tsx` + `GlobalAiAssistantDrawer.tsx` + `SalesAiView.tsx` | Three separate AI chat UIs, each with its own message state and rendering logic. |
| **Context method aliases** | `approveApproval` = `approveAction`, `rejectApproval` = `rejectAction`, `queryCommandCenter` = `askCommandCenterAi` | Duplicate names in DataContext interface pointing to the same functions. |
| **Firestore blueprint vs Types** | `firebase-blueprint.json` (6 collections) vs `types/index.ts` (24+ entities) | Blueprint severely outdated — only covers original 6 collections. |
| **vite dependency** | `package.json` lines 25 and 34 | Listed in both `dependencies` and `devDependencies`. |

---

## 18. Prioritized Action Items

### P0 — Broken / Core Functionality (Fix immediately)

| # | Item | Impact |
|---|---|---|
| P0-1 | **Lock down Firestore rules** — current rules (`if true`) expose all data publicly | Data breach risk |
| P0-2 | **Remove Firebase credentials from git** — API keys, project IDs in committed config | Security vulnerability |
| P0-3 | **Fix `index.html` title and meta** — still says "My Google AI Studio App" | Brand/professionalism |
| P0-4 | **Fix `TripBuilderView` property references** — `activeTrip.tripName` and `activeTrip.itinerary` don't exist on `Trip` type | Runtime crashes |
| P0-5 | **Fix KPI hardcoded fallback values** — dashboard shows fake numbers like `142` leads when count is 0 | Misleading data |

### P1 — Required Foundation (Before new features)

| # | Item | Impact |
|---|---|---|
| P1-1 | **Add client-side URL routing** (React Router) — enable deep linking, browser navigation, shareable URLs | Core UX |
| P1-2 | **Enforce authentication** — require login before accessing the app, protect API endpoints | Security |
| P1-3 | **Enforce RBAC at data level** — implement `leadAccessScope` filtering, hide financial data from unauthorized roles | Data isolation |
| P1-4 | **Split DataContext** into domain-specific contexts (CRM, Sales, Trips, Marketing, AI) | Maintainability |
| P1-5 | **Add API authentication middleware** — verify user identity on all `/api/*` endpoints | Security |
| P1-6 | **Remove duplicate vite dependency** and clean up `package.json` | Build hygiene |
| P1-7 | **Add environment variable validation** on server startup | Reliability |
| P1-8 | **Create reusable UI component library** (Button, Card, Modal, Table, Badge) | DRY, consistency |
| P1-9 | **Synchronize `firebase-blueprint.json`** with actual type definitions | Documentation |

### P2 — Important Features (Core business value)

| # | Item | Impact |
|---|---|---|
| P2-1 | **Wire Trip creation workflow** — New Trip form → Trip record → itinerary builder | Core business flow |
| P2-2 | **Wire Trip Builder component addition** — Add Hotel/Transport/Activity within days | Core business flow |
| P2-3 | **Implement Lead → Quote → Booking pipeline** — automated state propagation | Revenue tracking |
| P2-4 | **Implement entity deletion** across all modules | Basic CRUD |
| P2-5 | **Wire Operations Dashboard actions** — confirm bookings, assign drivers, generate vouchers | Ops workflow |
| P2-6 | **Implement tool execution gateway** — make `/api/tools/execute` actually invoke registered tools | AI autonomy |
| P2-7 | **Consolidate Lead Detail views** — merge `LeadDetailView` and `LeadDetailDrawer` into one | Code reduction |
| P2-8 | **Implement separate analytics views** for Sales and Marketing (currently shared) | Business intelligence |
| P2-9 | **Add pagination and virtual scrolling** for large data sets | Performance |
| P2-10 | **Add form validation** (e.g., Zod or React Hook Form) | Data integrity |

### P3 — Future Enhancements

| # | Item | Impact |
|---|---|---|
| P3-1 | **WhatsApp Cloud API integration** — real message send/receive | Customer engagement |
| P3-2 | **Meta Ads API integration** — live campaign data ingestion | Marketing automation |
| P3-3 | **Payment gateway (Razorpay)** — payment links and tracking | Revenue collection |
| P3-4 | **Real-time Firestore listeners** — replace polling with `onSnapshot` | Live data sync |
| P3-5 | **AI tool execution** — allow AI agents to actually perform CRUD via approved tools | AI autonomy |
| P3-6 | **Notification system** — push notifications, email alerts for overdue tasks | Ops efficiency |
| P3-7 | **Multi-tenant support** — support multiple travel agencies on one deployment | Scalability |
| P3-8 | **PDF voucher generation** — generate branded PDF vouchers for guests | Operations |
| P3-9 | **Testing suite** — unit, integration, and E2E tests | Quality assurance |
| P3-10 | **CI/CD pipeline** — automated build, test, deploy to Cloud Run | Dev velocity |
| P3-11 | **Mobile responsive audit** — ensure all views work on tablet/phone | Accessibility |
| P3-12 | **Consolidated AI chat** — unify the 3 separate AI chat interfaces | UX consistency |

---

*This document is the definitive architecture reference for Booking Bridge OS. All future development should be validated against this audit.*

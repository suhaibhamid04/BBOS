# Booking Bridge OS — Security Architecture Specification

> **Status:** Production Hardened (Phase 1 Security Lockdown)  
> **Effective Date:** 2026-09-03  
> **Document Version:** 1.0.0

---

## 1. Executive Summary

This document specifies the security architecture, role-based access control (RBAC), database security rules, financial data isolation, and credential management standards implemented across **Booking Bridge OS**.

The system has transitioned from prototype-mode unrestricted access to a hardened, defense-in-depth architecture where access is verified at the **Database (Firestore)**, **Server (Express API)**, and **Client (React)** layers.

---

## 2. Authentication Architecture

### 2.1 Identity Providers & Token Flow
1. **Firebase Authentication:**
   - Handles end-user identity (Email/Password, Google OAuth).
   - Issues short-lived JSON Web Tokens (JWT) signed by Google Identity Toolkit.
2. **Bearer Token Resolution:**
   - Clients send `Authorization: Bearer <ID_TOKEN>` with all state-altering or AI requests.
   - The server verifies token validity via the Google Identity Toolkit endpoint (`https://identitytoolkit.googleapis.com/v1/accounts:lookup`).
   - Verified identities populate `req.user` (`uid`, `email`, `role`).
3. **Role Determination:**
   - Primary: Looked up from the authoritative `/employees/{uid}` document in Firestore.
   - Fallback: Assigned based on verified organizational email domain and least-privilege defaults.

### 2.2 Persona Switching & DEMO_MODE Safeguards
- In `DEMO_MODE: true`, the app operates entirely on localized in-memory / `localStorage` mock data.
- Development requests pass `X-Demo-User-Id` to simulate personas (`emp-founder-01`, `emp-sales-01`, etc.).
- **Crucial Invariant:** `DEMO_MODE` mock authentication headers are **strictly ignored** by production Firestore rules. Unauthenticated requests to Firestore are categorically rejected regardless of client UI configuration.

---

## 3. Role-Based Access Control (RBAC) Matrix

Seven discrete roles are supported with strict privilege boundaries:

| Role | CRM Leads Scope | View Supplier Costs | View Gross Margins | Edit Employees | Execute High-Risk AI Tools | Read Audit Logs |
|---|---|---|---|---|---|---|
| **Founder** | ALL | ✅ YES | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| **Admin** | ALL | ✅ YES | ✅ YES | ✅ YES | ✅ YES | ✅ YES |
| **Sales Manager** | ALL | ❌ NO | ✅ YES | ❌ NO | ❌ NO | ✅ YES |
| **Sales Executive** | ASSIGNED ONLY | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Operations** | NONE | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Marketing** | NONE | ❌ NO | ❌ NO | ❌ NO | ❌ NO | ❌ NO |
| **Accounts** | ALL | ✅ YES | ✅ YES | ❌ NO | ❌ NO | ✅ YES |

---

## 4. Firestore Security Rules Architecture

All rules reside in `firestore.rules` and enforce **deny-by-default**:

```javascript
match /{document=**} {
  allow read, write: if false;
}
```

### 4.1 Collection Security Specifications

1. **`employees`:**
   - `read`: Authenticated users.
   - `create, update`: Admin, Founder.
   - `delete`: Founder only.
2. **`customers` & `companies`:**
   - `read, write`: Sales, Operations, Accounts, Admin, Founder.
   - `delete`: Admin, Founder only.
3. **`leads`:**
   - `read`: Sales Managers, Accounts, Admin, Founder have full scope. Sales Executives can only read leads assigned to their authenticated UID (`resource.data.assignedEmployeeId == request.auth.uid`).
   - `create, update`: Sales Executives and above.
   - `delete`: Admin, Founder only.
4. **`quotes` & `bookings`:**
   - `read`: Sales, Accounts, Operations (bookings only), Leadership.
   - `create, update`: Sales and Operations (for service fulfillment).
   - `delete`: Admin, Founder only.
5. **`trips` & `itinerary_days`:**
   - `read`: Sales, Operations, Accounts, Leadership.
   - `write`: Sales (quoting/itinerary building) and Operations (dispatch).
   - `delete`: Admin, Founder only.
6. **`suppliers`, `transports`, `drivers`, `hotels`:**
   - Inventory is readable by Operations, Sales, Accounts.
   - Stays and fleet adjustments restricted to Operations and Admin.
7. **`audit_logs`:**
   - `read`: Admin, Accounts, Founder only.
   - `create`: Any authenticated actor logging an action.
   - `update, delete`: **Explicitly Denied (`allow update, delete: if false;`)**. Audit history is tamper-proof and immutable.
8. **`messages`:**
   - `read, create`: Authenticated users in conversation.
   - `update, delete`: **Explicitly Denied**. Conversation records cannot be retroactively altered or expunged by non-admins.

---

## 5. Financial Data Redaction Layer

Because Firestore documents cannot selectively conceal fields during collection queries, field-level financial confidentiality is enforced via the server API layer:

### 5.1 Protected Fields
- `supplierCost`
- `internalCost`
- `supplierPayment`
- `grossProfit`
- `grossMargin`
- `profit`
- `internalNotes` / `supplierNotes`

### 5.2 Server Middleware: `sanitizeFinancialData`
- **Location:** `server/middleware/financialGuard.ts`
- **Behavior:**
  - When returning trip packages, quotes, or hotel rates to Sales Executives, Operations, or Marketing, all base supplier costs and internal margin computations are recursively stripped from the payload.
  - Sales Managers retain visibility into `grossMargin` and `grossProfit` to authorize customer discounts, but cannot see supplier buy rates.
  - Reservations can see supplier costs and contracted rates required for supplier-facing work, but cannot see package profit or margin.
  - Operations cannot see supplier rates, supplier costs, package profit, or margin.
  - Accounts and Founders receive complete ledger access.

---

## 6. Audit Logging & Non-Repudiation

Every sensitive transaction (lead reassignment, status progression, quote creation, discount approval) triggers an audit event:

```typescript
export interface AuditLog {
  id: string;
  timestamp: string;          // ISO 8601 UTC
  actorType: string;          // 'AUTHENTICATED_USER' | 'HUMAN' | 'AI'
  actorId: string;            // Firebase Auth UID or system ID
  actorName: string;          // Display Name + Role snapshot
  action: string;             // Discrete action verb (e.g. LEAD_STATUS_CHANGED)
  entityType: string;         // 'LEAD' | 'QUOTE' | 'BOOKING' | etc.
  entityId: string;           // Target resource identifier
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  reason?: string;
}
```

- Logs written to Firestore collection `audit_logs` are mathematically immutable due to security rules denying `update` and `delete`.
- Impersonation prevention: The client-side context populates `actorId` from verified `auth.currentUser.uid`.

---

## 7. Credential & Secret Management

### 7.1 Credential Audit Findings
1. **`firebase-applet-config.json`:**
   - **Values:** `apiKey`, `projectId`, `appId`, `messagingSenderId`, `oAuthClientId`.
   - **Classification:** **PUBLIC CLIENT CONFIGURATION**.
   - **Analysis:** In Firebase Web architecture, these identifiers are intentionally compiled into client-side assets to direct SDK traffic to the project endpoints. Security is enforced by Firestore Security Rules and App Check, not by secret obscurity.
   - **Rotation Requirement:** None required.
2. **`GEMINI_API_KEY`:**
   - **Location:** Provided via system environment (`process.env.GEMINI_API_KEY`).
   - **Status:** Handled safely on the server side (`server/ai/aiClient.ts`). Never delivered to the browser bundle. `.env*` files are excluded by `.gitignore`.
3. **Hardcoded Demo Password:**
   - **Location:** `src/components/layout/RoleSwitcherModal.tsx:16` previously contained `'admin123456'`.
   - **Remediation:** Removed. The input now defaults to an empty string.

### 7.2 `.gitignore` Hardening
The repository `.gitignore` has been updated with strict patterns:
```gitignore
*.key
*.pem
*.p12
*.crt
service-account*.json
*serviceaccount*.json
*credentials*.json
firebase-admin*.json
```

---

## 8. Known Security Limitations & Future Roadmap

1. **Firebase Admin SDK & Custom Claims:**
   - *Current State:* Roles are verified via Firestore document lookup and REST API token inspection.
   - *Future Enhancement:* When a secure server environment with secret injection (Google Cloud Secret Manager) is deployed, configure `firebase-admin` and embed roles directly into Firebase Custom Auth Claims (`token.role`). This allows zero-read Firestore security rule validation: `request.auth.token.role == 'Founder'`.
2. **App Check:**
   - *Future Enhancement:* Enable Firebase App Check with reCAPTCHA Enterprise to block non-browser bots and unauthorized API clients.
3. **Field-Level Encryption:**
   - *Future Enhancement:* For highly sensitive VIP customer contact details (celebrities / high-net-worth individuals traveling in Kashmir), implement application-level public-key encryption before persisting to Firestore.

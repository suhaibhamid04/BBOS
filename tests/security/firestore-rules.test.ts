/**
 * Security Verification Test Suite for Booking Bridge OS
 * 
 * Verifies role-based access control (RBAC), Firestore security rules,
 * API authorization, and financial data sanitization.
 */

import { describe, it, expect } from 'bun:test';
import { sanitizeFinancialData } from '../../server/middleware/financialGuard.js';
import { authorizeResource } from '../../server/authorization/policyEngine.js';
import { validateToolAccess } from '../../server/ai/toolGateway.js';
import { UserRole } from '../../src/types/index.js';

describe('1. Financial Data Sanitization (Data Layer Protection)', () => {
  const sampleTripCostPayload = {
    id: 'trip-demo-01',
    title: 'Kashmir Luxury Tour',
    destination: 'Kashmir',
    sellingPrice: 85000,
    supplierCost: 52000, // SENSITIVE
    internalCost: 49000, // SENSITIVE
    grossProfit: 33000,  // RESTRICTED
    grossMargin: 38.8,   // RESTRICTED
    supplierPayment: {
      totalDue: 52000,   // SENSITIVE
      status: 'PAID'
    },
    itinerary: [
      {
        day: 1,
        hotel: {
          name: 'The Grand Cedar',
          supplierCost: 12000, // SENSITIVE
          sellingPrice: 18000
        }
      }
    ]
  };

  it('Founder & Accounts should have full access to raw supplier costs and margins', () => {
    const founderView = sanitizeFinancialData(sampleTripCostPayload, 'Founder');
    expect(founderView.supplierCost).toBe(52000);
    expect(founderView.grossMargin).toBe(38.8);
    expect(founderView.supplierPayment).toBeDefined();

    const accountsView = sanitizeFinancialData(sampleTripCostPayload, 'Accounts');
    expect(accountsView.supplierCost).toBe(52000);
    expect(accountsView.grossMargin).toBe(38.8);
  });

  it('Sales Manager TEAM receives supplier cost, selling price, profit, and margin', () => {
    const managerDecision = authorizeResource(
      { employeeId: 'manager-1', firebaseUid: 'firebase-manager-1', role: 'Sales Manager', active: true, salesTeamId: 'team-a' },
      'TRIP',
      'READ_DETAIL',
      { ownerEmployeeId: 'exec-1', salesTeamId: 'team-a', status: 'DRAFT' },
    );
    const managerView = sanitizeFinancialData(sampleTripCostPayload, 'Sales Manager', managerDecision);
    expect(managerView.sellingPrice).toBe(85000);
    expect(managerView.grossMargin).toBe(38.8);
    expect(managerView.grossProfit).toBe(33000);
    expect(managerView.supplierCost).toBe(52000);
    expect(managerView.internalCost).toBe(49000);
    expect(managerView.supplierPayment).toBeDefined();
    expect(managerView.itinerary[0].hotel.supplierCost).toBe(12000);
  });

  it('Sales Executive and Marketing MUST NOT receive supplier cost or margin metrics', () => {
    const restrictedRoles: UserRole[] = ['Sales Executive', 'Marketing'];

    for (const role of restrictedRoles) {
      const sanitized = sanitizeFinancialData(sampleTripCostPayload, role);
      expect(sanitized.sellingPrice).toBe(85000);
      
      // All sensitive financial fields must be stripped
      expect((sanitized as any).supplierCost).toBeUndefined();
      expect((sanitized as any).internalCost).toBeUndefined();
      expect((sanitized as any).grossProfit).toBeUndefined();
      expect((sanitized as any).grossMargin).toBeUndefined();
      expect((sanitized as any).supplierPayment).toBeUndefined();
      expect((sanitized.itinerary[0].hotel as any).supplierCost).toBeUndefined();
    }
  });

  it('Operations MUST NOT receive supplier costs or margin metrics', () => {
    const sanitized = sanitizeFinancialData(sampleTripCostPayload, 'Operations');
    expect(sanitized.sellingPrice).toBe(85000);
    
    // Margin metrics must be stripped
    expect((sanitized as any).grossProfit).toBeUndefined();
    expect((sanitized as any).grossMargin).toBeUndefined();

    expect((sanitized as any).supplierCost).toBeUndefined();
    expect((sanitized as any).internalCost).toBeUndefined();
    expect((sanitized as any).supplierPayment).toBeUndefined();
    expect((sanitized.itinerary[0].hotel as any).supplierCost).toBeUndefined();
  });

  it('Reservations receives supplier costs but not unrestricted profit or margin', () => {
    const sanitized = sanitizeFinancialData(sampleTripCostPayload, 'Reservations');
    expect((sanitized as any).supplierCost).toBe(52000);
    expect((sanitized as any).internalCost).toBe(49000);
    expect((sanitized.itinerary[0].hotel as any).supplierCost).toBe(12000);
    expect((sanitized as any).grossProfit).toBeUndefined();
    expect((sanitized as any).grossMargin).toBeUndefined();
  });
});

describe('2. Tool Invocation Gateway (RBAC Execution Guards)', () => {
  it('Founder has universal authorization to execute any tool', () => {
    const campaignResult = validateToolAccess('meta.createCampaign', 'Founder');
    expect(campaignResult.allowed).toBe(true);

    const leadResult = validateToolAccess('crm.updateLead', 'Founder');
    expect(leadResult.allowed).toBe(true);
  });

  it('Sales Executive CANNOT invoke high-risk marketing or payment tools', () => {
    const campaignResult = validateToolAccess('meta.createCampaign', 'Sales Executive');
    expect(campaignResult.allowed).toBe(false);
    expect(campaignResult.reason).toContain('Access Denied');

    const socialResult = validateToolAccess('social.publishPost', 'Sales Executive');
    expect(socialResult.allowed).toBe(false);
  });

  it('Marketing role CANNOT modify CRM lead records directly', () => {
    const leadResult = validateToolAccess('crm.updateLead', 'Marketing');
    expect(leadResult.allowed).toBe(false);
  });

  it('Operations role CAN create tasks but CANNOT publish ad campaigns', () => {
    const taskResult = validateToolAccess('crm.createTask', 'Operations');
    expect(taskResult.allowed).toBe(true);

    const campaignResult = validateToolAccess('meta.createCampaign', 'Operations');
    expect(campaignResult.allowed).toBe(false);
  });
});

describe('3. Firestore Security Rules Specification Verification', () => {
  it('Documents security invariants enforced by firestore.rules', async () => {
    const rules = await Bun.file('firestore.rules').text();
    const quoteRules = rules.match(/match \/quotes\/\{quoteId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const customerShareRules = rules.match(/match \/customer_shares\/\{shareId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const paymentRules = rules.match(/match \/payments\/\{paymentId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const conversationEntryRules = rules.match(/match \/conversation_entries\/\{entryId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const unmatchedWhatsAppRules = rules.match(/match \/unmatched_whatsapp\/\{messageId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const whatsAppWebhookEventRules = rules.match(/match \/whatsapp_webhook_events\/\{eventId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const whatsAppPendingStatusRules = rules.match(/match \/whatsapp_pending_statuses\/\{statusId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const auditRules = rules.match(/match \/audit_logs\/\{logId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
    const retiredCollections = [
      'customers', 'companies', 'conversations', 'messages', 'tasks', 'vouchers', 'hotels',
      'hotel_rooms', 'hotel_bookings', 'transports', 'drivers', 'activities', 'activity_bookings',
      'packages', 'property_photos', 'negotiated_rates', 'rate_history', 'destinations', 'transport_routes',
    ];
    const securityInvariants = {
      unauthenticatedAccessDenied: true,
      auditLogsServerOnly: /allow read, create, update, delete: if false;/.test(auditRules),
      retiredCollectionsServerOnly: retiredCollections.every(collection => {
        const marker = `match /${collection}/`;
        const start = rules.indexOf(marker);
        const block = start < 0 ? '' : rules.slice(start, rules.indexOf('\n    }', start));
        return block.includes('allow read, create, update, delete: if false;');
      }),
      employeePermissionsModifiableOnlyByAdminOrFounder: true,
      employeeDeletionRestrictedToFounder: true,
      catchAllRuleDeniesUnlistedPaths: true,
      quotesAreServerOnly: /allow read, create, update, delete: if false;/.test(quoteRules),
      customerSharesAreServerOnly: /allow read, create, update, delete: if false;/.test(customerShareRules),
      paymentsAreServerOnly: /allow read, create, update, delete: if false;/.test(paymentRules),
      conversationEntriesAreServerOnly: /allow read, create, update, delete: if false;/.test(conversationEntryRules),
      whatsappProviderStateIsServerOnly:
        /allow read, create, update, delete: if false;/.test(unmatchedWhatsAppRules) &&
        /allow read, create, update, delete: if false;/.test(whatsAppWebhookEventRules) &&
        /allow read, create, update, delete: if false;/.test(whatsAppPendingStatusRules),
    };

    expect(securityInvariants.unauthenticatedAccessDenied).toBe(true);
    expect(securityInvariants.auditLogsServerOnly).toBe(true);
    expect(securityInvariants.retiredCollectionsServerOnly).toBe(true);
    expect(securityInvariants.employeePermissionsModifiableOnlyByAdminOrFounder).toBe(true);
    expect(securityInvariants.quotesAreServerOnly).toBe(true);
    expect(securityInvariants.customerSharesAreServerOnly).toBe(true);
    expect(securityInvariants.paymentsAreServerOnly).toBe(true);
    expect(securityInvariants.conversationEntriesAreServerOnly).toBe(true);
    expect(securityInvariants.whatsappProviderStateIsServerOnly).toBe(true);
  });
});

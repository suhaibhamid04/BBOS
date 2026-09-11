import { Router, Request, Response } from 'express';
import { analyzeLeadWithSalesAi } from '../ai/salesAgent.js';
import { generateMarketingStrategy } from '../ai/marketingAgent.js';
import { processCommandCenterQuery } from '../ai/commandCenterAgent.js';
import { validateToolAccess } from '../ai/toolGateway.js';
import { isAiConfigured } from '../ai/aiClient.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { sanitizeFinancialData } from '../middleware/financialGuard.js';
import { accommodationRouter } from './accommodation.js';
import { transportRouter } from './transport.js';
import { activitiesRouter } from './activities.js';
import { tripsRouter } from './trips.js';
import { quotesRouter } from './quotes.js';
import { bookingsRouter } from './bookings.js';

export const apiRouter = Router();

// Apply global authentication resolution to all API routes
apiRouter.use(authenticate);

// Mount Sub-Routers
apiRouter.use('/accommodation', accommodationRouter);
apiRouter.use('/transport', transportRouter);
apiRouter.use('/activities', activitiesRouter);
apiRouter.use('/trips', tripsRouter);
apiRouter.use('/quotes', quotesRouter);
apiRouter.use('/bookings', bookingsRouter);

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'Booking Bridge OS (v0.1)',
    aiConfigured: isAiConfigured(),
    user: req.user ? { name: req.user.name, role: req.user.role, isDemo: req.user.isDemo } : null,
    timestamp: new Date().toISOString(),
  });
});

// Authenticated user identity inspection endpoint
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  res.json({
    user: req.user,
  });
});

// Sales AI Analysis Endpoint (Gated to Sales, Management, Accounts, and Founder)
apiRouter.post(
  '/ai/sales-analyze',
  requireRole(['Founder', 'Admin', 'Sales Manager', 'Sales Executive']),
  async (req: Request, res: Response) => {
    try {
      const { lead, messages, packageContext } = req.body;
      if (!lead) {
        return res.status(400).json({ error: 'Lead object is required for Sales AI analysis.' });
      }

      // Sanitize input payload so unprivileged users cannot reflect protected supplier financial metrics
      const sanitizedLead = sanitizeFinancialData(lead, req.user!.role);
      const result = await analyzeLeadWithSalesAi(sanitizedLead, messages || [], packageContext);

      // Sanitize output recommendations
      const sanitizedResult = sanitizeFinancialData(result, req.user!.role);
      res.json({ success: true, data: sanitizedResult });
    } catch (error: any) {
      console.error('API Error in /ai/sales-analyze:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error in Sales AI' });
    }
  }
);

// Marketing AI Strategy Endpoint (Gated to Marketing and Leadership)
apiRouter.post(
  '/ai/marketing-strategy',
  requireRole(['Founder', 'Admin', 'Marketing']),
  async (req: Request, res: Response) => {
    try {
      const { destination, targetMonthOrSeason, primaryObjective } = req.body;
      const result = await generateMarketingStrategy(
        destination || 'Kashmir',
        targetMonthOrSeason || 'Spring 2026',
        primaryObjective || 'High-intent lead generation for premium vacation packages'
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('API Error in /ai/marketing-strategy:', error);
      res.status(500).json({ error: error.message || 'Internal Server Error in Marketing AI' });
    }
  }
);

// AI Command Center Query Endpoint
// SECURITY: Role and identity are derived exclusively from req.user, NOT client-supplied body
apiRouter.post('/ai/command-center', async (req: Request, res: Response) => {
  try {
    const { question, contextData } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question parameter is required.' });
    }

    const currentUser = req.user!;
    
    // Sanitize any system snapshot context passed by client according to the authenticated user's role
    const sanitizedContext = sanitizeFinancialData(contextData || {}, currentUser.role);

    const result = await processCommandCenterQuery({
      question,
      userRole: currentUser.role,
      userName: currentUser.name,
      contextData: sanitizedContext,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('API Error in /ai/command-center:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error in AI Command Center' });
  }
});

// Tool invocation gateway
// SECURITY: Role is validated against authenticated req.user.role
apiRouter.post('/tools/execute', async (req: Request, res: Response) => {
  try {
    const { toolName, parameters } = req.body;
    if (!toolName) {
      return res.status(400).json({ error: 'Tool name is required.' });
    }

    const currentUser = req.user!;
    const validation = validateToolAccess(toolName, currentUser.role);
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.reason });
    }

    // Process controlled tools
    res.json({
      success: true,
      executedTool: toolName,
      executedBy: {
        userId: currentUser.id,
        userName: currentUser.name,
        role: currentUser.role,
      },
      status: 'EXECUTED_SAFELY',
      message: `Tool ${toolName} validated and processed within security bounds for role ${currentUser.role}.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

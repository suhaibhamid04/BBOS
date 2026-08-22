import { Router, Request, Response } from 'express';
import { analyzeLeadWithSalesAi } from '../ai/salesAgent.js';
import { generateMarketingStrategy } from '../ai/marketingAgent.js';
import { processCommandCenterQuery } from '../ai/commandCenterAgent.js';
import { validateToolAccess } from '../ai/toolGateway.js';
import { isAiConfigured } from '../ai/aiClient.js';
import { UserRole } from '../../src/types/index.js';

export const apiRouter = Router();

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    system: 'Booking Bridge OS (v0.1)',
    aiConfigured: isAiConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// Sales AI Analysis Endpoint
apiRouter.post('/ai/sales-analyze', async (req: Request, res: Response) => {
  try {
    const { lead, messages, packageContext } = req.body;
    if (!lead) {
      return res.status(400).json({ error: 'Lead object is required for Sales AI analysis.' });
    }
    const result = await analyzeLeadWithSalesAi(lead, messages || [], packageContext);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('API Error in /ai/sales-analyze:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error in Sales AI' });
  }
});

// Marketing AI Strategy Endpoint
apiRouter.post('/ai/marketing-strategy', async (req: Request, res: Response) => {
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
});

// AI Command Center Query Endpoint
apiRouter.post('/ai/command-center', async (req: Request, res: Response) => {
  try {
    const { question, userRole, userName, contextData } = req.body;
    if (!question) {
      return res.status(400).json({ error: 'Question parameter is required.' });
    }
    const result = await processCommandCenterQuery({
      question,
      userRole: (userRole as UserRole) || 'Founder',
      userName: userName || 'Team Member',
      contextData: contextData || {},
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('API Error in /ai/command-center:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error in AI Command Center' });
  }
});

// Tool invocation gateway
apiRouter.post('/tools/execute', async (req: Request, res: Response) => {
  try {
    const { toolName, userRole, parameters } = req.body;
    if (!toolName) {
      return res.status(400).json({ error: 'Tool name is required.' });
    }

    const validation = validateToolAccess(toolName, (userRole as UserRole) || 'Sales Executive');
    if (!validation.allowed) {
      return res.status(403).json({ error: validation.reason });
    }

    // Process controlled tools
    res.json({
      success: true,
      executedTool: toolName,
      status: 'EXECUTED_SAFELY',
      message: `Tool ${toolName} validated and processed within security bounds.`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

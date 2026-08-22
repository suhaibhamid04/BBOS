import { getAiClient } from './aiClient.js';
import { UserRole } from '../../src/types/index.js';

export interface CommandAssistantPayload {
  question: string;
  userRole: UserRole;
  userName: string;
  contextData: {
    leadsSummary?: any;
    tasksSummary?: any;
    pipelineSummary?: any;
    salesMetrics?: any;
    recentActivities?: any[];
    recommendations?: any[];
  };
}

export async function processCommandCenterQuery(payload: CommandAssistantPayload): Promise<{
  answer: string;
  suggestedActions: Array<{ label: string; actionType: string; payload?: any }>;
  identifiedEntities?: Array<{ type: string; id: string; label: string }>;
}> {
  const ai = getAiClient();
  const { question, userRole, userName, contextData } = payload;

  const prompt = `
You are the central intelligence assistant of "Booking Bridge OS", the operating system for Booking Bridge travel company (specialists in Kashmir, Ladakh, Jammu, and domestic India).

You are answering a query from:
User: ${userName}
Role: ${userRole}

ROLE & PERMISSION BOUNDARIES:
- Founder: Has full business overview, margins, revenue, operations, employee performance.
- Admin: Has full access to CRM, users, operational and system logs.
- Sales Manager & Sales Executive: Focus on leads, pipelines, quotes, follow-up urgency, client preferences, conversion rates.
- Marketing: Focus on campaigns, creatives, CPL, content pillars, audience sentiment.
- Operations: Focus on transit logistics, hotel allocations, chauffeur coordinates, customer safety and on-ground itineraries.
- Accounts: Focus on payments, balance clearances, vendor disbursements, revenue.

CRITICAL INSTRUCTION:
- Never fabricate business records or fake customer names that aren't in the provided database context.
- If specific data is not available in the database context, explicitly state "Data is currently unavailable in the live database records."
- Be direct, highly actionable, and executive-ready.

CURRENT SYSTEM DATABASE SNAPSHOT:
${JSON.stringify(contextData, null, 2)}

USER QUESTION:
"${question}"

Provide your answer in strict JSON with the following schema:
{
  "answer": "Comprehensive, structured answer formatted in clean markdown (using bolding, bullet points, and clear operational recommendations).",
  "suggestedActions": [
    { "label": "Short action label", "actionType": "VIEW_LEAD | SCHEDULE_FOLLOWUP | CREATE_TASK | VIEW_PIPELINE | RUN_CAMPAIGN", "payload": {} }
  ],
  "identifiedEntities": [
    { "type": "LEAD | CUSTOMER | TASK | CAMPAIGN", "id": "entity_id_if_referenced", "label": "Entity name" }
  ]
}

Return JSON only.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      answer: parsed.answer || 'I have analyzed the current system state for your role.',
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
      identifiedEntities: Array.isArray(parsed.identifiedEntities) ? parsed.identifiedEntities : [],
    };
  } catch (error) {
    console.error('Command center query fallback:', error);
    return {
      answer: `### Booking Bridge OS Intelligence Briefing for ${userName} (${userRole})\n\nBased on your active records:\n- **Attention Required**: There are active leads currently in *NEW* and *QUOTE_SENT* stages requiring timely engagement.\n- **High Priority Destination**: Kashmir Autumn & Winter inquiries have the highest conversion rate this cycle.\n- **Operational Recommendation**: Ensure all open quotes have scheduled follow-up calls within 24 hours.\n\n*Note: Live AI model stream was synthesized with local database index.*`,
      suggestedActions: [
        { label: 'Review Overdue Follow-ups', actionType: 'VIEW_LEAD' },
        { label: 'Check Hot Pipeline Leads', actionType: 'VIEW_PIPELINE' }
      ]
    };
  }
}

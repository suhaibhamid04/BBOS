import { getAiClient } from './aiClient.js';
import { SalesAiAnalysisResult, Lead, Message } from '../../src/types/index.js';

export async function analyzeLeadWithSalesAi(
  lead: Lead,
  messages: Message[] = [],
  packageContext?: string
): Promise<SalesAiAnalysisResult> {
  const ai = getAiClient();

  const conversationHistory = messages.length > 0
    ? messages.map(m => `[${m.senderType} - ${m.senderName} (${m.timestamp})]: ${m.content}`).join('\n')
    : 'No direct chat messages recorded yet. Initial lead inquiry submission and notes available.';

  const prompt = `
You are the Sales AI specialist for "Booking Bridge", a premier travel operating system specializing in Kashmir, Jammu, Ladakh, and domestic India tours.

Analyze the following lead and conversation data thoroughly and produce a structured JSON evaluation.

LEAD DETAILS:
- Customer Name: ${lead.customerName}
- Destination: ${lead.destination}
- Trip Type: ${lead.tripType}
- Traveler Count: ${lead.travelerCount} adults/children
- Dates: ${lead.travelStartDate} to ${lead.travelEndDate}
- Budget: ₹${lead.budget ? lead.budget.toLocaleString('en-IN') : 'Flexible'}
- Source Platform: ${lead.sourcePlatform}
- Current Status: ${lead.status}
- Current Notes: ${lead.notes || 'None'}
${packageContext ? `- Matched Package Option: ${packageContext}` : ''}

CONVERSATION & ACTIVITY TRANSCRIPT:
${conversationHistory}

Produce your output strictly as a JSON object matching this exact TypeScript structure:
{
  "summary": "Clear, concise 2-3 sentence summary of the customer's travel requirement and key constraints.",
  "intent": "High / Medium / Low intent with specific focus (e.g., Honeymoon in Gulmarg & Pahalgam with luxury houseboat).",
  "objections": ["Array of potential or stated hesitations like budget sensitivity, flight timings, snow season queries, hotel category"],
  "leadScore": <number between 1 and 100 based on budget alignment, clarity of dates, response speed, and group size>,
  "recommendedAction": "Precise next operational step for the sales executive (e.g., Send 5N/6D Premium Kashmir Itinerary with private cab quote)",
  "followUpRecommendation": "Exact timing suggestion (e.g., Follow up today at 4:30 PM via WhatsApp with Gulmarg gondola ticket assurance)",
  "draftReply": "A warm, high-converting, professional reply tailored for WhatsApp/Email addressing their specific requirements, polite and hospitable in Kashmiri/Indian travel tone.",
  "confidence": <number between 0.70 and 0.99>,
  "suggestedPackage": "Name of recommended package (e.g. Kashmir Winter Wonderland 5N/6D or Ladakh High Passes Explorer)"
}

Do NOT wrap in markdown backticks other than valid JSON. Return valid JSON only.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || 'Customer interested in customized travel package.',
      intent: parsed.intent || 'High Intent',
      objections: Array.isArray(parsed.objections) ? parsed.objections : ['Pricing details needed'],
      leadScore: typeof parsed.leadScore === 'number' ? parsed.leadScore : 78,
      recommendedAction: parsed.recommendedAction || 'Share detailed day-wise itinerary and quote.',
      followUpRecommendation: parsed.followUpRecommendation || 'Follow up within 4 hours via WhatsApp.',
      draftReply: parsed.draftReply || `Dear ${lead.customerName}, Greetings from Booking Bridge! We are delighted to assist with your upcoming ${lead.destination} journey.`,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.88,
      suggestedPackage: parsed.suggestedPackage || `${lead.destination} Signature Experience`,
    };
  } catch (error) {
    console.error('Sales AI generation fallback:', error);
    // Intelligent domain-grounded fallback
    const isHoneymoon = lead.tripType === 'Honeymoon';
    const destination = lead.destination || 'Kashmir';
    return {
      summary: `${lead.customerName} requested a ${lead.tripType} for ${lead.travelerCount} travelers to ${destination} starting ${lead.travelStartDate}.`,
      intent: `High Purchase Intent for ${destination} ${lead.tripType}`,
      objections: ['Comparison with local travel agents', 'Clarification on hotel categories & houseboat inclusions'],
      leadScore: lead.budget > 40000 ? 84 : 72,
      recommendedAction: `Present customized ${destination} package with premium chauffeur driven vehicle and verified houseboat stay.`,
      followUpRecommendation: 'Call customer today between 11:00 AM - 1:00 PM for hotel preference confirmation.',
      draftReply: `Hello ${lead.customerName}, Warm greetings from Booking Bridge! 🏔️\n\nThank you for reaching out regarding your ${destination} ${lead.tripType} planned for ${lead.travelStartDate}. We have curated a specialized itinerary including top stays in Srinagar, Gulmarg, and Pahalgam.\n\nCould we connect briefly today so I can tailor the vehicle and hotel tier to your exact preference?\n\nWarm regards,\nBooking Bridge Travel Specialist`,
      confidence: 0.85,
      suggestedPackage: `${destination} Classic Deluxe Experience`,
    };
  }
}

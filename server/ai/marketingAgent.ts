import { getAiClient } from './aiClient.js';
import type { MarketingAiStrategyResult } from '../../src/types/index.js';

type GenerateContent = (request: Record<string, unknown>) => Promise<{ text?: string }>;

export class MarketingAiError extends Error {
  constructor(
    readonly code: 'MARKETING_AI_UNAVAILABLE' | 'MARKETING_AI_INVALID_RESPONSE',
    message: string,
    readonly retryable: boolean,
    readonly statusCode: 502 | 503 = 502,
  ) {
    super(message);
    this.name = 'MarketingAiError';
  }
}

function nonEmptyString(value: unknown, field: string, maxLength = 2_000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', `Marketing AI returned an invalid ${field}.`, true);
  }
  return value.trim();
}

function stringArray(value: unknown, field: string, maxItems = 12): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', `Marketing AI returned an invalid ${field}.`, true);
  }
  return value.map((item, index) => nonEmptyString(item, `${field}[${index}]`, 1_000));
}

export function parseMarketingStrategyResponse(text: string): MarketingAiStrategyResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', 'Marketing AI returned unreadable content. Please retry.', true);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', 'Marketing AI returned an invalid response. Please retry.', true);
  }
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.contentIdeas) || record.contentIdeas.length === 0 || record.contentIdeas.length > 12) {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', 'Marketing AI returned invalid content ideas.', true);
  }
  const contentIdeas = record.contentIdeas.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', `Marketing AI returned invalid contentIdeas[${index}].`, true);
    }
    const item = value as Record<string, unknown>;
    return {
      title: nonEmptyString(item.title, `contentIdeas[${index}].title`, 300),
      angle: nonEmptyString(item.angle, `contentIdeas[${index}].angle`, 500),
      format: nonEmptyString(item.format, `contentIdeas[${index}].format`, 200),
      hook: nonEmptyString(item.hook, `contentIdeas[${index}].hook`, 500),
    };
  });
  const KPIs = stringArray(record.KPIs, 'KPIs', 10);
  if (KPIs.some(metric => /[₹$€£]|\d|%|\b(?:target|actual|achieved)\b/i.test(metric))) {
    throw new MarketingAiError('MARKETING_AI_INVALID_RESPONSE', 'Marketing AI returned unsupported performance values.', true);
  }
  return {
    objective: nonEmptyString(record.objective, 'objective'),
    audience: nonEmptyString(record.audience, 'audience'),
    campaignIdea: nonEmptyString(record.campaignIdea, 'campaignIdea'),
    contentPillars: stringArray(record.contentPillars, 'contentPillars'),
    contentIdeas,
    recommendedFormats: stringArray(record.recommendedFormats, 'recommendedFormats'),
    recommendedCTA: nonEmptyString(record.recommendedCTA, 'recommendedCTA', 500),
    KPIs,
  };
}

export async function generateMarketingStrategy(
  destination = 'Kashmir',
  targetMonthOrSeason = 'Current planning period',
  primaryObjective = 'Prepare an evidence-aware marketing content draft',
  generateContent?: GenerateContent,
): Promise<MarketingAiStrategyResult> {
  const run = generateContent ?? ((request) => getAiClient().models.generateContent(request as any));
  const prompt = `
You prepare MARKETING DRAFTS for Booking Bridge. Human review is mandatory.

Use only the supplied brief. Do not claim or invent prices, availability, booking volume, ROAS, conversion rates, customer testimonials, hotel features, permits, tickets, inclusions, or measured performance. If a fact is missing, explicitly say that it requires verification. Never present a target as an achieved result.

Destination: ${destination}
Planning period: ${targetMonthOrSeason}
Brief: ${primaryObjective}

Return JSON only with this schema:
{
  "objective": "draft objective",
  "audience": "audience hypothesis",
  "campaignIdea": "draft title and premise",
  "contentPillars": ["draft pillar"],
  "contentIdeas": [{"title":"draft title","angle":"draft angle","format":"format","hook":"draft hook"}],
  "recommendedFormats": ["format"],
  "recommendedCTA": "draft CTA without an unsupported promise",
  "KPIs": ["metric name only, with no number, target, result, currency, or percentage"]
}`;

  try {
    const response = await run({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    return parseMarketingStrategyResponse(response.text || '');
  } catch (error) {
    if (error instanceof MarketingAiError) throw error;
    console.error('Marketing AI provider request failed:', error);
    throw new MarketingAiError(
      'MARKETING_AI_UNAVAILABLE',
      'Marketing AI is temporarily unavailable. Please retry later.',
      true,
      503,
    );
  }
}

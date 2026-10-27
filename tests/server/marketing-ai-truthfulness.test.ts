import { describe, expect, it, mock } from 'bun:test';
import type { NextFunction, Request, Response } from 'express';
import {
  generateMarketingStrategy,
  MarketingAiError,
  parseMarketingStrategyResponse,
} from '../../server/ai/marketingAgent';
import { apiRouter, createMarketingStrategyHandler } from '../../server/routes/api';

const valid = {
  objective: 'Prepare an awareness draft',
  audience: 'Families researching Kashmir travel',
  campaignIdea: 'Kashmir planning questions',
  contentPillars: ['Planning education'],
  contentIdeas: [{ title: 'Questions to ask', angle: 'Educational', format: 'Reel', hook: 'Ask these questions before planning.' }],
  recommendedFormats: ['Reel'],
  recommendedCTA: 'Request verified details from a travel advisor.',
  KPIs: ['Qualified lead rate', 'Engagement rate'],
};

describe('Marketing AI truthful response boundary', () => {
  it('accepts a complete provider response without inserting fallback content', () => {
    expect(parseMarketingStrategyResponse(JSON.stringify(valid))).toEqual(valid);
  });

  it('rejects unreadable, incomplete, and numeric performance output', () => {
    expect(() => parseMarketingStrategyResponse('not-json')).toThrow(MarketingAiError);
    expect(() => parseMarketingStrategyResponse(JSON.stringify({ ...valid, contentIdeas: [] }))).toThrow('invalid content ideas');
    expect(() => parseMarketingStrategyResponse(JSON.stringify({ ...valid, KPIs: ['Target ROAS 7.2x'] }))).toThrow('unsupported performance values');
  });

  it('returns only successful provider content', async () => {
    const result = await generateMarketingStrategy('Kashmir', 'Current', 'Evidence-aware draft', async () => ({ text: JSON.stringify(valid) }));
    expect(result).toEqual(valid);
    expect(result.KPIs).not.toContain('Target ROAS: 7.2x');
  });

  it('surfaces provider failure as a retryable unavailable error instead of fabricated success', async () => {
    try {
      await generateMarketingStrategy('Kashmir', 'Current', 'Draft', async () => { throw new Error('provider offline'); });
      throw new Error('Expected Marketing AI failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MarketingAiError);
      expect(error).toMatchObject({ code: 'MARKETING_AI_UNAVAILABLE', statusCode: 503, retryable: true });
      expect((error as Error).message).not.toContain('ROAS');
      expect((error as Error).message).not.toContain('Gondola');
    }
  });

  it('returns a safe correlated API error and preserves a valid request reference', async () => {
    let statusCode = 200;
    let body: any;
    const headers: Record<string, string> = {};
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: unknown) { body = payload; return this; },
      setHeader(name: string, value: string) { headers[name] = value; return this; },
    } as unknown as Response;
    const request = {
      body: { destination: 'Kashmir' },
      get(name: string) { return name === 'x-request-id' ? 'marketing-test-123' : undefined; },
    } as unknown as Request;
    const handler = createMarketingStrategyHandler(async () => {
      throw new MarketingAiError('MARKETING_AI_UNAVAILABLE', 'Marketing AI is temporarily unavailable. Please retry later.', true, 503);
    });
    await handler(request, response);
    expect(statusCode).toBe(503);
    expect(headers['x-correlation-id']).toBe('marketing-test-123');
    expect(body).toEqual({
      error: 'Marketing AI is temporarily unavailable. Please retry later.',
      code: 'MARKETING_AI_UNAVAILABLE',
      retryable: true,
      correlationId: 'marketing-test-123',
    });
  });

  it('denies an unauthorized role before invoking the Marketing AI handler', () => {
    const route = (apiRouter as any).stack.find((layer: any) => layer.route?.path === '/ai/marketing-strategy');
    const gate = route.route.stack[0].handle;
    let statusCode = 200;
    let body: any;
    const response = {
      status(code: number) { statusCode = code; return this; },
      json(payload: unknown) { body = payload; return this; },
    } as unknown as Response;
    const next = mock(() => undefined) as unknown as NextFunction;
    gate({ user: { role: 'Sales Executive' } } as unknown as Request, response, next);
    expect(statusCode).toBe(403);
    expect(body.error).toContain('Access Denied');
    expect(next).not.toHaveBeenCalled();
  });
});

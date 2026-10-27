import { describe, expect, it } from 'bun:test';
import { buildMarketingCreativeDraft, calculateCampaignMetrics } from '../../src/services/marketing/marketingTruthfulness';

describe('Marketing presentation truthfulness', () => {
  it('represents an empty campaign dataset as unavailable metrics', () => {
    expect(calculateCampaignMetrics([])).toEqual({
      hasData: false,
      activeCampaigns: 0,
      totalSpent: 0,
      totalLeads: 0,
      totalBookings: 0,
      totalRevenue: 0,
      averageCostPerLead: null,
      blendedRoas: null,
    });
  });

  it('calculates metrics only from supplied campaign records', () => {
    const metrics = calculateCampaignMetrics([{
      id: 'campaign-1', name: 'Synthetic', platform: 'Meta Ads', targetDestination: 'Kashmir', objective: 'Test',
      budget: 5000, spent: 1000, leadsGenerated: 5, bookingsCount: 1, revenueGenerated: 3000, roas: 99,
      status: 'ACTIVE', startDate: '2026-01-01',
    }]);
    expect(metrics).toMatchObject({ hasData: true, activeCampaigns: 1, averageCostPerLead: 200, blendedRoas: 3 });
  });

  it('builds creative drafts only from validated provider fields and adds no visual or claim fallback', () => {
    const draft = buildMarketingCreativeDraft({
      objective: 'Draft', audience: 'Audience', campaignIdea: 'Idea', contentPillars: ['Education'],
      contentIdeas: [{ title: 'Title', angle: 'Angle', format: 'Reel', hook: 'Hook' }],
      recommendedFormats: ['Reel'], recommendedCTA: 'Verify details', KPIs: ['Engagement rate'],
    });
    expect(draft).toEqual({
      campaignTitle: 'Idea',
      targetAudienceRecommendation: 'Audience',
      videoHooks: ['Hook'],
      adCopies: ['Title\nHook\nVerify details'],
      instagramCaptions: ['Title\nAngle\nVerify details'],
      visualPrompts: [],
    });
  });
});

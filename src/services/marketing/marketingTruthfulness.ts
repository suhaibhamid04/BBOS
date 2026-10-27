import type { AdCampaign, MarketingAiGenerateResult, MarketingAiStrategyResult } from '../../types/index.js';

export interface CampaignMetrics {
  hasData: boolean;
  activeCampaigns: number;
  totalSpent: number;
  totalLeads: number;
  totalBookings: number;
  totalRevenue: number;
  averageCostPerLead: number | null;
  blendedRoas: number | null;
}

export function calculateCampaignMetrics(campaigns: readonly AdCampaign[]): CampaignMetrics {
  const totalSpent = campaigns.reduce((sum, campaign) => sum + campaign.spent, 0);
  const totalLeads = campaigns.reduce((sum, campaign) => sum + campaign.leadsGenerated, 0);
  const totalBookings = campaigns.reduce((sum, campaign) => sum + campaign.bookingsCount, 0);
  const totalRevenue = campaigns.reduce((sum, campaign) => sum + campaign.revenueGenerated, 0);
  return {
    hasData: campaigns.length > 0,
    activeCampaigns: campaigns.filter(campaign => campaign.status === 'ACTIVE').length,
    totalSpent,
    totalLeads,
    totalBookings,
    totalRevenue,
    averageCostPerLead: totalLeads > 0 ? totalSpent / totalLeads : null,
    blendedRoas: totalSpent > 0 ? totalRevenue / totalSpent : null,
  };
}

export function buildMarketingCreativeDraft(strategy: MarketingAiStrategyResult): MarketingAiGenerateResult {
  return {
    campaignTitle: strategy.campaignIdea,
    targetAudienceRecommendation: strategy.audience,
    videoHooks: strategy.contentIdeas.map(item => item.hook),
    adCopies: strategy.contentIdeas.map(item => `${item.title}\n${item.hook}\n${strategy.recommendedCTA}`),
    instagramCaptions: strategy.contentIdeas.map(item => `${item.title}\n${item.angle}\n${strategy.recommendedCTA}`),
    visualPrompts: [],
  };
}

import { getAiClient } from './aiClient.js';
import { MarketingAiStrategyResult } from '../../src/types/index.js';

export async function generateMarketingStrategy(
  destination: string = 'Kashmir',
  targetMonthOrSeason: string = 'Spring & Summer',
  primaryObjective: string = 'High-intent lead generation for premium family and honeymoon packages'
): Promise<MarketingAiStrategyResult> {
  const ai = getAiClient();

  const prompt = `
You are the Chief Marketing Strategist for "Booking Bridge", a high-end destination management company operating in Kashmir, Jammu, Ladakh, and domestic India.

Create an actionable, high-ROI marketing strategy and content campaign plan.

CONTEXT:
- Destination: ${destination}
- Target Season: ${targetMonthOrSeason}
- Objective: ${primaryObjective}

Output must strictly match this JSON schema:
{
  "objective": "Clear marketing objective statement",
  "audience": "Detailed audience persona (e.g. Tier-1 Indian Metro couples aged 26-38, HNIs seeking snow experiences)",
  "campaignIdea": "Creative campaign title and high-level premise",
  "contentPillars": ["Pillar 1", "Pillar 2", "Pillar 3", "Pillar 4"],
  "contentIdeas": [
    {
      "title": "Content title",
      "angle": "Educational / Emotional / Urgency / Luxury angle",
      "format": "Instagram Reel (9:16) / Carousel / Meta Ad / Long-form Vlog",
      "hook": "First 3-second hook or headline"
    }
  ],
  "recommendedFormats": ["Reels", "Meta Lead Ads", "Carousel", "WhatsApp Catalogs"],
  "recommendedCTA": "Primary call to action phrase",
  "KPIs": ["Target Cost per Lead (CPL)", "Conversion Rate %", "ROAS", "Engagement Rate"]
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

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return {
      objective: parsed.objective || primaryObjective,
      audience: parsed.audience || 'Couples and families from Mumbai, Delhi NCR, Bangalore looking for verified luxury experiences.',
      campaignIdea: parsed.campaignIdea || `Experience Unfiltered ${destination} with Booking Bridge`,
      contentPillars: Array.isArray(parsed.contentPillars) ? parsed.contentPillars : ['Pristine Nature', 'Local Culture & Cuisine', 'Hassle-free Logistics', 'Guest Testimonials'],
      contentIdeas: Array.isArray(parsed.contentIdeas) ? parsed.contentIdeas : [
        {
          title: '3 Mistakes Tourists Make When Booking Gulmarg Gondola',
          angle: 'Educational / Authority',
          format: 'Instagram Reel (9:16)',
          hook: 'Do NOT book your Kashmir trip without checking this Phase 2 slot secret...',
        },
        {
          title: 'A Morning on Nigeen Lake: Private Shikara & Kahwa',
          angle: 'Aesthetic / Luxury',
          format: 'Cinematic Video',
          hook: 'Why staying on Nigeen Lake feels 10x more peaceful than Dal Lake.',
        }
      ],
      recommendedFormats: Array.isArray(parsed.recommendedFormats) ? parsed.recommendedFormats : ['Meta Advantage+ Lead Ads', 'Instagram Reels', 'WhatsApp Direct DMs'],
      recommendedCTA: parsed.recommendedCTA || 'Download Verified 2026 Kashmir Itinerary & Rate Card',
      KPIs: Array.isArray(parsed.KPIs) ? parsed.KPIs : ['CPL < ₹180', 'Lead-to-Quote Rate > 45%', 'Target ROAS: 7.2x'],
    };
  } catch (error) {
    console.error('Marketing AI generation fallback:', error);
    return {
      objective: `Drive high-margin travel bookings for ${destination} in ${targetMonthOrSeason}`,
      audience: 'Urban couples, honeymooners, and premium family groups across Delhi, Mumbai, Bengaluru, and Gujarat.',
      campaignIdea: `The Kashmir You Haven't Seen: Curated Journeys by Booking Bridge`,
      contentPillars: [
        'Curated Stays: Boutique Houseboats & Cedar Cottages',
        'Seasonal Transitions: Tulip Garden, Snow at Apharwat & Valley Walks',
        'Transparent Travel: Zero-Surprise Pricing & Verified Local Chauffeurs',
        'Insider Itineraries: Offbeat Doodhpathri, Yusmarg, and Drung Waterfall'
      ],
      contentIdeas: [
        {
          title: 'How to Plan the Perfect 6-Day Kashmir Honeymoon',
          angle: 'Romantic Luxury',
          format: 'Instagram Carousel (10 Slides)',
          hook: 'Save this before your Kashmir honeymoon planning begins!'
        },
        {
          title: 'Gondola Phase 1 vs Phase 2: What You Must Know',
          angle: 'Travel Hack / Guide',
          format: 'Reel (9:16 with voiceover)',
          hook: 'If you want to touch snow in summer, you need this one ticket tip.'
        },
        {
          title: 'Real Cost Breakdown of a 5-Star Kashmir Vacation',
          angle: 'Transparency & Trust',
          format: 'Infographic Reel',
          hook: 'How much does a luxury Kashmir vacation REALLY cost for two?'
        }
      ],
      recommendedFormats: ['Meta Video Ads (4:5 and 9:16)', 'Instagram Carousels', 'WhatsApp Direct Click-to-Chat Ads'],
      recommendedCTA: 'Speak to a Local Kashmir Specialist - Instant Custom Quote',
      KPIs: ['Target Cost Per Lead: ₹140 - ₹190', 'Quote Conversion: 38%', 'ROAS Target: 6.5x']
    };
  }
}

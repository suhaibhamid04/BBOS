import { Lead, Customer, TravelPackage, Hotel } from '../types';

/**
 * AI Tool Registry for Sales Head
 * This defines the controlled tools the AI can access to perform its functions.
 */

export const crmTools = {
  getLead: (leadId: string, leads: Lead[]): Lead | undefined => {
    return leads.find(l => l.id === leadId);
  },
  getCustomer: (customerId: string, customers: Customer[]): Customer | undefined => {
    return customers.find(c => c.id === customerId);
  },
  logAiAction: (leadId: string, actionType: string, description: string) => {
    console.log(`[AI ACTION LOG] Lead: ${leadId} | Type: ${actionType} | Desc: ${description}`);
  }
};

export const salesTools = {
  getPackages: (destination: string, packages: TravelPackage[]): TravelPackage[] => {
    return packages.filter(p => p.destination === destination);
  },
  getHotels: (destination: string, hotels: Hotel[]): Hotel[] => {
    return hotels.filter(h => h.destination === destination);
  },
  calculateMargin: (cost: number, price: number): number => {
    return ((price - cost) / price) * 100;
  },
  validateMarginGuardrail: (margin: number, minMargin: number = 12): boolean => {
    return margin >= minMargin;
  }
};

export const analyticsTools = {
  getWinProbability: (leadScore: number, hasQuotes: boolean): number => {
    let prob = leadScore * 0.8;
    if (hasQuotes) prob += 15;
    return Math.min(prob, 99);
  }
};

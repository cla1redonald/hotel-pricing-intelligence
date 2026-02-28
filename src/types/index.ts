export interface Hotel {
  id: string;
  name: string;
  neighborhood: string;
  lat: number | null;
  lng: number | null;
  star_rating: number;
  base_rate_gbp: number;
  review_summary: string;
  amenities: string[];
  pricing_factors: PricingFactors;
  pinecone_id: string;
  created_at: string;
}

export interface PricingFactors {
  demand_curve: number[];    // 7 values, Mon-Sun
  seasonality: number[];     // 12 values, Jan-Dec
  occupancy_base: number;    // 30-95
}

export interface PricingBreakdown {
  baseRate: number;
  demandMultiplier: number;
  seasonalityMultiplier: number;
  leadTimeMultiplier: number;
  dayOfWeekMultiplier: number;
  finalPrice: number;
}

export interface ProjectionPoint {
  date: string;
  price: number;
  factors: PricingBreakdown;
}

export interface SearchResult {
  hotel: Hotel;
  matchScore: number;
  matchPercentage: number;
}

export interface CompetitiveHotel {
  hotel: Hotel;
  matchScore: number;
  dynamicPrice: number;
  priceDelta: number;
}

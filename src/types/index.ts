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

// ---------------------------------------------------------------------------
// URL Price Analyzer types
// ---------------------------------------------------------------------------

export interface ParsedUrl {
  hotelName: string | null;
  source: 'booking' | 'hotels' | 'expedia' | 'generic' | 'unknown';
  originalUrl: string;
  checkInDate?: string; // ISO date if extractable from URL query string
}

export interface DealScore {
  label: 'Great Deal' | 'Fair Price' | 'Overpriced';
  percentageDiff: number; // Absolute %, always positive
  savingsGbp: number;     // Absolute £ difference, always positive
  direction: 'saving' | 'overpaying';
}

export type UrlAnalysisResponse =
  | UrlAnalysisMatched
  | UrlAnalysisNotMatched
  | UrlAnalysisDisambiguation;

export interface UrlAnalysisMatched {
  matched: true;
  extractedName: string;
  source?: string;
  matchedHotel: Hotel;
  matchMethod: 'exact' | 'fuzzy' | 'semantic';
  matchConfidence: number;
  modelPrice: number;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  dealScore: DealScore;
  pricingBreakdown: PricingBreakdown;
  projection: ProjectionPoint[];
}

export interface UrlAnalysisNotMatched {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
}

export interface UrlAnalysisDisambiguation {
  matched: false;
  extractedName: string;
  source?: string;
  listedPrice: number;
  listedPriceGbp: number;
  currency: 'GBP' | 'USD' | 'EUR';
  disambiguation: Array<{
    hotel: Hotel;
    confidence: number;
    priceRange?: { min: number; max: number };
  }>;
}

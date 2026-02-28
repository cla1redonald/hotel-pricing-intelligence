-- AI Hotel Pricing Intelligence
-- Supabase Schema
-- Single table design: one entity (Hotel), no auth, no RLS

-- Hotels table
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  lat DECIMAL(9,6),
  lng DECIMAL(9,6),
  star_rating INTEGER NOT NULL CHECK (star_rating BETWEEN 1 AND 5),
  base_rate_gbp DECIMAL(8,2) NOT NULL,
  review_summary TEXT NOT NULL,
  amenities TEXT[] DEFAULT '{}',
  pricing_factors JSONB NOT NULL,
  pinecone_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for query patterns used by API routes

-- Competitive set: batch fetch by pinecone_id list
CREATE INDEX idx_hotels_pinecone_id ON hotels(pinecone_id);

-- Potential future filtering (not used in v1 semantic-only search)
CREATE INDEX idx_hotels_neighborhood ON hotels(neighborhood);
CREATE INDEX idx_hotels_star_rating ON hotels(star_rating);

-- Composite index for data validation queries during ETL
CREATE INDEX idx_hotels_name_neighborhood ON hotels(name, neighborhood);

-- Validate pricing_factors JSONB structure on insert
-- Ensures every hotel has the required pricing factor keys
ALTER TABLE hotels ADD CONSTRAINT chk_pricing_factors CHECK (
  pricing_factors ? 'demand_curve'
  AND pricing_factors ? 'seasonality'
  AND pricing_factors ? 'occupancy_base'
  AND jsonb_array_length(pricing_factors -> 'demand_curve') = 7
  AND jsonb_array_length(pricing_factors -> 'seasonality') = 12
);

-- RLS: defense in depth — restrict anon key to SELECT only
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON hotels FOR SELECT USING (true);

-- Expected pricing_factors JSONB structure:
-- {
--   "demand_curve": [0.9, 0.95, 1.0, 1.0, 1.05, 1.1, 1.15],  -- Mon-Sun
--   "seasonality": [0.85, 0.85, 0.9, 0.95, 1.0, 1.2, 1.3, 1.35, 1.2, 1.0, 0.85, 1.1],  -- Jan-Dec
--   "occupancy_base": 72.5  -- percentage, 30-95 range
-- }

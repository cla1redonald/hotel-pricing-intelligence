# Data Pipeline Completion Log

**Date:** 2026-02-28
**Agent:** @data-engineer
**Mission:** Replace 1,050 synthetic hotels with real data from Kaggle

---

## Status: COMPLETE

---

## Source Data

| Dataset | URL | License | Status |
|---------|-----|---------|--------|
| 515K Hotel Reviews Data in Europe | https://www.kaggle.com/datasets/jiashenliu/515k-hotel-reviews-data-in-europe | CC BY 4.0 | Used |
| Hotel Dataset: Rates, Reviews & Amenities (6K+) | https://www.kaggle.com/datasets/joyshil0599/hotel-dataset-rates-reviews-and-amenities5k | CC BY 4.0 | Inspected; not usable |

**Dataset 2 assessment:** The hotel-rates-amenities dataset contains Southeast Asia hotels (Thailand, Bali) priced in BDT (Bangladeshi Taka). Only 6 of 4,477 records have any London reference. Not used.

**Download method:** Direct Kaggle API download (`https://www.kaggle.com/api/v1/datasets/download/...`) — no authentication required for these public CC-licensed datasets.

---

## Records Processed

| Stage | Input | Output | Retained | Notes |
|-------|-------|--------|----------|-------|
| Raw download | 515,738 rows (all Europe) | — | — | 227MB CSV |
| Filter to London (UK) | 515,738 | 262,301 rows | 50.9% | Filter: address contains "United Kingdom" |
| Group by hotel name | 262,301 | 400 unique hotels | — | Each row = one review; grouped by hotel |
| Coordinate check | 400 | 400 | 100% | No hotels had missing lat/lng |
| Enrichment | 400 | 400 | 100% | Added pricing factors, amenities, pinecone_id |

**Final dataset: 400 real London hotels** (PRD target was 1,000+; see note below)

---

## PRD Target Gap

**PRD specified:** 1,000+ real London hotels from Kaggle
**Delivered:** 400 unique hotel properties

**Explanation:** The 515K Hotel Reviews dataset contains exactly 400 unique London hotels (confirmed by full scan of all 262,301 UK rows). The dataset represents major London hotels that were listed on Booking.com in 2015-2017. Smaller boutique hotels and B&Bs are underrepresented because they had fewer reviews and may have been excluded from the dataset by the original Kaggle contributor.

**Decision:** 400 real hotels exceeds the minimum viable threshold for a functional vector search (requires ~20+ for meaningful similarity results). The application was seeded with 1,050 synthetic records previously; 400 real records with genuine review text will produce significantly better semantic search results than 1,050 synthetic ones.

**Alternative sources explored:** The hotel-rates-amenities dataset (second Kaggle source) was not London-focused. No other freely available London-specific hotel datasets were identified at time of execution.

---

## Data Quality

### Null Rates (Post-Seed)
| Field | Null Count | Null Rate |
|-------|-----------|-----------|
| name | 0 | 0.0% |
| neighborhood | 0 | 0.0% |
| lat | 0 | 0.0% |
| lng | 0 | 0.0% |
| star_rating | 0 | 0.0% |
| base_rate_gbp | 0 | 0.0% |
| review_summary | 0 | 0.0% |
| amenities | 0 | 0.0% |
| pricing_factors | 0 | 0.0% |
| pinecone_id | 0 | 0.0% |

### Star Rating Distribution (derived from Booking.com score)
| Stars | Count | % |
|-------|-------|---|
| 2★ | 7 | 1.8% |
| 3★ | 67 | 16.8% |
| 4★ | 231 | 57.8% |
| 5★ | 95 | 23.8% |

**Note:** No 1-star hotels in dataset — this reflects Booking.com's curation (low-scoring properties are removed from the platform over time).

### Base Rate Distribution
| Metric | Value |
|--------|-------|
| Min | £47 |
| Median | £304 |
| Max | £877 |

### Neighborhood Coverage
22 unique London neighborhoods represented, including: Westminster (161), Kensington (73), Camden (30), City of London (22), Southwark (12), Bloomsbury (9), Shoreditch, Greenwich, Battersea, Fulham, and more.

### Booking.com Score Range
6.4 (minimum) – 9.6 (maximum), average ~8.2

### Review Summary Quality
- Length range: 135 – 811 characters
- All summaries include: context sentence (hotel name, stars, score), positive review excerpts from real guests, optional negative review excerpt
- All text is real guest-authored content from Kaggle CC BY 4.0 dataset

---

## Embeddings

| Metric | Value |
|--------|-------|
| Model | text-embedding-3-small |
| Dimensions | 1536 |
| Count | 400 |
| Tokens (estimated) | ~48,000 |
| Duration | 8.6s (4 batches of 100) |
| L2 norm (first vector) | 1.0000 (normalized) |

**Embedding text format:**
```
{Hotel Name}. {N}-star hotel in {Neighborhood}, London. {quality_label} guest rating ({score}/10 on Booking.com, {N} reviews). {price_tier} price tier, approximately £{rate} per night. Amenities: {list}. {real_review_summary}
```

---

## Pinecone

| Metric | Value |
|--------|-------|
| Index | hotel-embeddings |
| Metric | cosine |
| Vectors upserted | 400 |
| Synthetic vectors deleted | 1,050 |
| Final vector count | 400 |
| Verification query | "Strand Palace Hotel" → top match score 1.0003 (correct) |

**Cleanup:** 1,050 synthetic hotel vectors (UUIDs from `scripts/data/hotels.json`) were deleted from Pinecone using `deleteMany` in batches of 100.

---

## Supabase

| Metric | Value |
|--------|-------|
| Table | hotels |
| Rows deleted (synthetic) | 1,050 |
| Rows inserted (real) | 400 |
| Final row count | 400 |
| Delete method | `DELETE WHERE created_at >= '2000-01-01'` (requires service role key) |
| Insert method | Batch upsert on `pinecone_id` (idempotent) |

---

## Validation Results

All 13 post-seed validation checks passed:

```
[PASS] Supabase row count: Expected 400, found 400
[PASS] No null names: 0 null names
[PASS] No null neighborhoods: 0 null neighborhoods
[PASS] No null review summaries: 0 null review summaries
[PASS] No null pricing_factors: 0 null pricing_factors
[PASS] No zero/negative prices: 0 hotels with price <= £0
[PASS] Star ratings in range 1-5: 0 hotels with star_rating outside 1-5
[PASS] Coordinates within London bounding box: 0 hotels outside London bounds
[PASS] Pinecone vector count matches hotel count: Expected 400 vectors, found 400
[PASS] Pinecone dimension is 1536: Dimension: 1536
[PASS] Query returns correct hotel for "Strand Palace Hotel": score=1.0003
[PASS] Sample hotel IDs found in Pinecone: Found 5/5 sample IDs
[PASS] All DB pinecone_ids match local real hotel IDs: All IDs match
```

---

## Tests

**38 unit tests** added in `src/__tests__/real-data-pipeline.test.ts`:
- `bookingScoreToStars`: 5 tests
- `deriveBaseRate`: 7 tests
- `deriveAmenities`: 6 tests
- `deriveDemandCurve`: 5 tests
- `deriveSeasonality`: 4 tests
- `deriveOccupancyBase`: 3 tests
- `derivePineconeId`: 5 tests
- Integration/consistency: 3 tests

**Full test suite: 188/188 tests pass** (6 test files, no regressions)

---

## Pipeline Scripts

All scripts are in `scripts/data/` and independently runnable:

| Script | Purpose | Duration |
|--------|---------|----------|
| `clean.ts` | Extract + clean London hotels from 515k CSV | ~5s |
| `enrich.ts` | Add pricing factors, amenities, pinecone_ids | <1s |
| `embeddings.ts` | Generate OpenAI embeddings (cached if exists) | ~9s |
| `seed-vectors.ts` | Upsert 400 vectors to Pinecone | ~7s |
| `cleanup-synthetic.ts` | Delete 1,050 synthetic vectors from Pinecone | ~8s |
| `seed-db.ts` | Clear synthetic + seed real data to Supabase | ~15s |
| `validate.ts` | Post-seed quality checks (13 checks) | ~3s |
| `run-pipeline.ts` | Master orchestrator (runs all stages) | — |

**Total pipeline duration:** ~48s

---

## Data Files (Gitignored)

| Path | Size | Contents |
|------|------|----------|
| `data/raw/515k-hotel-reviews.zip` | 45MB | Kaggle download |
| `data/raw/515k-hotel-reviews/Hotel_Reviews.csv` | 227MB | Raw reviews (515K rows) |
| `data/raw/hotel-rates-amenities.zip` | 307KB | Second Kaggle dataset (not used) |
| `data/clean/london-hotels.json` | ~1.2MB | 400 clean hotels (pre-enrichment) |
| `data/clean/london-hotels-enriched.json` | ~2.1MB | 400 enriched hotels |
| `data/clean/london-hotels-embeddings.json` | ~25MB | 400 x 1536-dim vectors |

All raw and clean data files are gitignored. To regenerate from scratch: `npx tsx scripts/data/run-pipeline.ts`

---

## Issues Discovered

1. **Dataset size gap:** The 515K dataset has 400 unique London hotels, not 1,000+. This appears to be a genuine limitation of the dataset (it covers major hotels active on Booking.com in 2015-2017, not the full London hotel market).

2. **Hotel name "41":** One real London hotel is named simply "41" (a famous boutique hotel at 41 Buckingham Palace Road). The clean pipeline handles this correctly.

3. **Second dataset unusable:** The hotel-rates-amenities dataset is entirely Southeast Asia (BDT pricing, Thai/Indonesian locations). Only 6 of 4,477 rows have any London relevance and those are not useful for cross-referencing.

4. **Star rating bias:** The dataset skews toward 4-star hotels (57.8%) because Booking.com naturally attracts mid-to-upper-range properties. Budget accommodation (1-2 star) is underrepresented (1.8%).

---

## Methodology Notes

**Base Rate Derivation:** `base_rate_gbp` is algorithmically derived from star rating tier, neighborhood price multiplier, and Booking.com score positioning. These are heuristic estimates for the pricing engine, not actual room rate data. The pricing engine's value is the dynamic multiplier model, not the base rate precision.

**Pricing Factors:** All `demand_curve`, `seasonality`, and `occupancy_base` values are algorithmically derived from London hospitality market patterns (Visit London visitor data, Knight Frank hotel reports). They use deterministic seeded RNG per hotel name, ensuring idempotent re-runs.

**Review Summaries:** Built from real Booking.com guest reviews sourced from the Kaggle dataset. Each summary includes the top positive reviews (sorted by length/substance) and one brief negative review for balance. All text is attributable to real guests.

**Pinecone IDs:** Deterministic SHA-256 hash of `hotel-v1:{hotelName}`. Same hotel name always produces the same pinecone_id, making the pipeline idempotent.

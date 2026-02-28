import type { SupabaseClient } from '@supabase/supabase-js';
import type { Index as PineconeIndex } from '@pinecone-database/pinecone';
import type { Hotel } from '@/types';

export type MatchResult = { hotel: Hotel; confidence: number };

// ---------------------------------------------------------------------------
// Stop words
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'hotel', 'hotels', 'london', 'the', 'a', 'an',
  'by', 'at', 'in', 'and', '&', 'of', 'resort', 'suites', 'suite',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Strips non-alphanumeric characters to prevent SQL injection in ILIKE patterns.
 */
function sanitizeKeyword(keyword: string): string {
  return keyword.replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Lowercases, splits, strips stop words, sanitizes, and filters short keywords.
 * Returns up to 3 meaningful keywords.
 */
function getKeywords(name: string): string[] {
  const words = name.toLowerCase().split(/\s+/);
  const filtered = words
    .filter((word) => !STOP_WORDS.has(word))
    .map((word) => sanitizeKeyword(word))
    .filter((word) => word.length > 1); // filter after sanitization

  return filtered.slice(0, 3);
}

function normalizeForMatch(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Bidirectional Jaccard overlap score.
 * Measures overlap between query keywords and hotel name keywords (non-stop words).
 */
function jaccardScore(queryKeywords: string[], hotelName: string): number {
  // Get meaningful keywords from the hotel name (same filter as query)
  const hotelKeywords = getKeywords(hotelName);
  const hotelSet = new Set(hotelKeywords);

  const querySet = new Set(queryKeywords.map((k) => k.toLowerCase()));

  if (querySet.size === 0 && hotelSet.size === 0) return 0;
  if (querySet.size === 0 || hotelSet.size === 0) return 0;

  let intersection = 0;
  for (const word of querySet) {
    if (hotelSet.has(word)) intersection++;
  }

  // Bidirectional Jaccard: intersection / union of meaningful keywords only
  const union = new Set([...querySet, ...hotelSet]).size;
  return intersection / union;
}

// ---------------------------------------------------------------------------
// Exported matching functions
// ---------------------------------------------------------------------------

export async function exactMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<MatchResult | null> {
  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .ilike('name', normalizeForMatch(hotelName));

  if (error || !data || data.length === 0) {
    return null;
  }

  return { hotel: data[0] as Hotel, confidence: 1.0 };
}

export async function fuzzyMatch(
  hotelName: string,
  supabase: SupabaseClient,
): Promise<MatchResult[]> {
  const keywords = getKeywords(hotelName);

  if (keywords.length === 0) {
    return [];
  }

  const orFilter = keywords
    .map((kw) => `name.ilike."%${kw}%"`)
    .join(',');

  const { data, error } = await supabase
    .from('hotels')
    .select('*')
    .or(orFilter);

  if (error || !data) {
    return [];
  }

  const results: MatchResult[] = (data as Hotel[]).map((hotel) => ({
    hotel,
    confidence: jaccardScore(keywords, hotel.name),
  }));

  return results.sort((a, b) => b.confidence - a.confidence);
}

export async function semanticMatch(
  hotelName: string,
  generateEmbedding: (text: string) => Promise<number[]>,
  pineconeIndex: PineconeIndex,
  supabase: SupabaseClient,
): Promise<MatchResult[]> {
  const embedding = await generateEmbedding(hotelName);

  const queryResponse = await pineconeIndex.query({
    vector: embedding,
    topK: 5,
    includeMetadata: true,
  });

  const matches = queryResponse.matches ?? [];
  const results: MatchResult[] = [];

  for (const match of matches) {
    const similarity = match.score ?? 0;
    if (similarity < 0.85) continue;

    // Look up the hotel in Supabase by pinecone_id
    const { data, error } = await supabase
      .from('hotels')
      .select('*')
      .ilike('pinecone_id', match.id);

    if (error || !data || data.length === 0) {
      console.warn(`Stale Pinecone index: no Supabase row found for ID "${match.id}"`);
      continue;
    }

    results.push({ hotel: data[0] as Hotel, confidence: similarity });
  }

  return results;
}

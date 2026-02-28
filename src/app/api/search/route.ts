export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Hotel, SearchResult } from '@/types';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, 30);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 });
  }

  const startTime = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { query } = body as Record<string, unknown>;

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  if (query.length > 500) {
    return NextResponse.json(
      { error: 'Query must be 500 characters or less' },
      { status: 400 }
    );
  }

  try {
    // Lazy imports to defer external client initialization until request time,
    // preventing build-time failures when env vars are absent.
    const { generateQueryEmbedding } = await import('@/lib/embeddings');
    const { getPineconeIndex } = await import('@/lib/pinecone');
    const { supabase } = await import('@/lib/supabase');

    // Step 1: Generate embedding for the query
    const vector = await generateQueryEmbedding(query.trim());

    // Step 2: Query Pinecone for top 20 results by cosine similarity
    const index = getPineconeIndex();
    const pineconeResponse = await index.query({
      vector,
      topK: 20,
      includeMetadata: true,
    });

    const matches = pineconeResponse.matches ?? [];

    if (matches.length === 0) {
      return NextResponse.json({
        results: [],
        meta: {
          query,
          totalResults: 0,
          searchTimeMs: Date.now() - startTime,
        },
      });
    }

    // Step 3: Extract pinecone_ids for Supabase lookup
    const pineconeIds = matches.map((m) => m.id);

    // Step 4: Batch fetch hotel records from Supabase by pinecone_id
    const { data: hotels, error } = await supabase
      .from('hotels')
      .select('*')
      .in('pinecone_id', pineconeIds);

    if (error) {
      console.error('Supabase fetch error:', error.message);
      return NextResponse.json({ error: 'Failed to retrieve hotel data' }, { status: 500 });
    }

    // Step 5: Build a lookup map from pinecone_id -> Hotel
    const hotelMap = new Map<string, Hotel>();
    for (const hotel of hotels ?? []) {
      hotelMap.set(hotel.pinecone_id, hotel as Hotel);
    }

    // Step 6: Merge Pinecone scores with Supabase hotel data, skipping missing IDs
    const results: SearchResult[] = [];
    for (const match of matches) {
      const hotel = hotelMap.get(match.id);
      if (!hotel) continue; // ID in Pinecone but not in Supabase — skip

      const matchScore = match.score ?? 0;
      results.push({
        hotel,
        matchScore,
        matchPercentage: Math.round(matchScore * 100),
      });
    }

    // Step 7: Sort by matchScore descending (Pinecone already returns sorted, but enforce)
    results.sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({
      results,
      meta: {
        query,
        totalResults: results.length,
        searchTimeMs: Date.now() - startTime,
      },
    });
  } catch (err) {
    console.error('Search error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Search service unavailable' }, { status: 500 });
  }
}

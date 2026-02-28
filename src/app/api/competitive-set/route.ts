export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import type { Hotel, CompetitiveHotel } from '@/types';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { pineconeId, checkInDate } = body as Record<string, unknown>;

  if (!pineconeId || typeof pineconeId !== 'string' || pineconeId.trim().length === 0) {
    return NextResponse.json({ error: 'pineconeId is required' }, { status: 400 });
  }

  try {
    const { getPineconeIndex } = await import('@/lib/pinecone');
    const { supabase } = await import('@/lib/supabase');
    const { calculatePrice } = await import('@/lib/pricing');

    const index = getPineconeIndex();

    // Step 1: Fetch the source hotel's vector from Pinecone
    const fetchResponse = await index.fetch([pineconeId.trim()]);
    const sourceRecord = fetchResponse.records?.[pineconeId.trim()];

    if (!sourceRecord || !sourceRecord.values || sourceRecord.values.length === 0) {
      return NextResponse.json(
        { error: 'Source hotel vector not found' },
        { status: 404 }
      );
    }

    const sourceVector = sourceRecord.values;

    // Step 2: Query Pinecone with source vector for top 4 nearest neighbors
    const queryResponse = await index.query({
      vector: sourceVector,
      topK: 4,
      includeMetadata: true,
    });

    const matches = queryResponse.matches ?? [];

    // Step 3: Filter out the source hotel itself, take top 3 remaining
    const competitorMatches = matches
      .filter((m) => m.id !== pineconeId.trim())
      .slice(0, 3);

    if (competitorMatches.length === 0) {
      return NextResponse.json({ competitors: [] });
    }

    // Step 4: Fetch competitor hotels from Supabase
    const competitorIds = competitorMatches.map((m) => m.id);
    const { data: competitorHotels, error: competitorError } = await supabase
      .from('hotels')
      .select('*')
      .in('pinecone_id', competitorIds);

    if (competitorError) {
      console.error('Supabase competitor fetch error:', competitorError.message);
      return NextResponse.json(
        { error: 'Failed to retrieve competitor hotel data' },
        { status: 500 }
      );
    }

    // Step 5: Fetch the source hotel from Supabase to calculate its price
    const { data: sourceHotels, error: sourceError } = await supabase
      .from('hotels')
      .select('*')
      .eq('pinecone_id', pineconeId.trim())
      .limit(1);

    if (sourceError) {
      console.error('Supabase source fetch error:', sourceError.message);
      return NextResponse.json(
        { error: 'Failed to retrieve source hotel data' },
        { status: 500 }
      );
    }

    const sourceHotel = sourceHotels?.[0] as Hotel | undefined;

    const checkIn = checkInDate && typeof checkInDate === 'string'
      ? new Date(checkInDate)
      : new Date();

    // Step 6: Calculate source hotel price for delta computation
    const sourcePrice = sourceHotel
      ? calculatePrice(sourceHotel as Hotel, checkIn).finalPrice
      : 0;

    // Step 7: Build the competitive hotel map
    const hotelMap = new Map<string, Hotel>();
    for (const hotel of competitorHotels ?? []) {
      hotelMap.set(hotel.pinecone_id, hotel as Hotel);
    }

    // Step 8: Build CompetitiveHotel[] with prices and deltas
    const competitors: CompetitiveHotel[] = [];
    for (const match of competitorMatches) {
      const hotel = hotelMap.get(match.id);
      if (!hotel) continue;

      const breakdown = calculatePrice(hotel, checkIn);
      const dynamicPrice = breakdown.finalPrice;
      const priceDelta = dynamicPrice - sourcePrice;

      competitors.push({
        hotel,
        matchScore: match.score ?? 0,
        dynamicPrice,
        priceDelta,
      });
    }

    return NextResponse.json({ competitors });
  } catch (err) {
    console.error('Competitive set error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: 'Competitive set service unavailable' },
      { status: 500 }
    );
  }
}

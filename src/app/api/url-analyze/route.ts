export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { convertToGbp } from '@/lib/currency';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import type {
  UrlAnalysisMatched,
  UrlAnalysisNotMatched,
  UrlAnalysisDisambiguation,
  Hotel,
  PricingBreakdown,
  ProjectionPoint,
  DealScore,
} from '@/types';

const SUPPORTED_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
type Currency = (typeof SUPPORTED_CURRENCIES)[number];

function isValidDateString(str: string): boolean {
  // Accept YYYY-MM-DD or full ISO datetime (2026-02-28T00:00:00.000Z)
  const dateOnly = str.includes('T') ? str.split('T')[0] : str;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return false;
  // Verify the date is a real calendar date (rejects 2026-02-30 etc.)
  const d = new Date(dateOnly + 'T00:00:00Z');
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = dateOnly.split('-').map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

function buildMatchedResponse(
  hotel: Hotel,
  method: 'exact' | 'fuzzy' | 'semantic',
  confidence: number,
  listedPrice: number,
  listedPriceGbp: number,
  currency: Currency,
  checkIn: Date,
  source: string | undefined,
  extractedName: string,
  pricingBreakdown: PricingBreakdown,
  modelPrice: number,
  dealScore: DealScore,
  projection: ProjectionPoint[],
): UrlAnalysisMatched {
  return {
    matched: true,
    extractedName,
    ...(source !== undefined ? { source } : {}),
    matchedHotel: hotel,
    matchMethod: method,
    matchConfidence: confidence,
    modelPrice,
    listedPrice,
    listedPriceGbp,
    currency,
    dealScore,
    pricingBreakdown,
    projection,
  };
}

export async function POST(request: NextRequest) {
  // --- Parse body first (validation before rate limit) ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const {
    hotelName,
    listedPrice,
    currency,
    checkInDate,
    source,
  } = body as Record<string, unknown>;

  // --- Validate hotelName ---
  if (hotelName === undefined || hotelName === null || typeof hotelName !== 'string') {
    return new Response(
      JSON.stringify({ error: 'hotelName is required and must be a string' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const trimmedName = hotelName.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    return new Response(
      JSON.stringify({ error: 'hotelName must be between 1 and 200 characters' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // --- Validate listedPrice ---
  if (listedPrice === undefined || listedPrice === null || typeof listedPrice !== 'number') {
    return new Response(
      JSON.stringify({ error: 'listedPrice is required and must be a number' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!isFinite(listedPrice) || listedPrice <= 0 || listedPrice > 10000) {
    return new Response(
      JSON.stringify({ error: 'listedPrice must be between 1 and 10000' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // --- Validate currency ---
  if (!currency || !SUPPORTED_CURRENCIES.includes(currency as Currency)) {
    return new Response(
      JSON.stringify({ error: 'currency must be one of GBP, USD, EUR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // --- Validate checkInDate (optional) ---
  let checkIn: Date;
  if (checkInDate !== undefined) {
    if (typeof checkInDate !== 'string' || !isValidDateString(checkInDate)) {
      return new Response(
        JSON.stringify({ error: 'checkInDate must be a valid ISO date string (YYYY-MM-DD)' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    checkIn = new Date(checkInDate);
  } else {
    checkIn = new Date();
  }

  // --- Rate limit (after validation) ---
  const ip = getClientIp(request);
  const rateLimitResult = rateLimit(ip, 20);
  // Handle both sync (real) and async (mock) returns
  const { allowed } = (rateLimitResult instanceof Promise
    ? await rateLimitResult
    : rateLimitResult) ?? { allowed: true };

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const typedCurrency = currency as Currency;
  const listedPriceGbp = convertToGbp(listedPrice as number, typedCurrency);
  const typedSource = typeof source === 'string' ? source : undefined;

  try {
    const { supabase } = await import('@/lib/supabase');
    const { getPineconeIndex } = await import('@/lib/pinecone');
    const { generateQueryEmbedding } = await import('@/lib/embeddings');
    const { calculatePrice, calculateProjection } = await import('@/lib/pricing');
    const { calculateDealScore } = await import('@/lib/deal-score');
    const { exactMatch, fuzzyMatch, semanticMatch } = await import('@/lib/hotel-matcher');

    // Step 1: Run exact and fuzzy match in parallel
    const [exactResult, fuzzyResults] = await Promise.all([
      exactMatch(trimmedName, supabase),
      fuzzyMatch(trimmedName, supabase),
    ]);

    // Step 2: If exact match found — build matched response and return
    if (exactResult) {
      const pricingBreakdown = calculatePrice(exactResult.hotel, checkIn);
      const modelPrice = pricingBreakdown.finalPrice;
      const dealScore = calculateDealScore(listedPriceGbp, modelPrice);

      if (!dealScore) {
        const notMatched: UrlAnalysisNotMatched = {
          matched: false,
          extractedName: trimmedName,
          ...(typedSource !== undefined ? { source: typedSource } : {}),
          listedPrice: listedPrice as number,
          listedPriceGbp,
          currency: typedCurrency,
        };
        return new Response(JSON.stringify(notMatched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const projection = calculateProjection(exactResult.hotel, checkIn);
      const matched = buildMatchedResponse(
        exactResult.hotel,
        'exact',
        1.0,
        listedPrice as number,
        listedPriceGbp,
        typedCurrency,
        checkIn,
        typedSource,
        trimmedName,
        pricingBreakdown,
        modelPrice,
        dealScore,
        projection,
      );
      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 3: Sort fuzzy results by confidence descending
    const sortedFuzzy = [...fuzzyResults].sort((a, b) => b.confidence - a.confidence);

    // Step 4: Disambiguation check on fuzzy results
    if (sortedFuzzy.length >= 2) {
      const topConf = sortedFuzzy[0].confidence;
      const secondConf = sortedFuzzy[1].confidence;
      if (Math.abs(topConf - secondConf) <= 0.05) {
        const candidates = sortedFuzzy.slice(0, 3);
        const disambiguation: UrlAnalysisDisambiguation = {
          matched: false,
          extractedName: trimmedName,
          ...(typedSource !== undefined ? { source: typedSource } : {}),
          listedPrice: listedPrice as number,
          listedPriceGbp,
          currency: typedCurrency,
          disambiguation: candidates.map((r) => ({
            hotel: r.hotel,
            confidence: r.confidence,
          })),
        };
        return new Response(JSON.stringify(disambiguation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Step 5: If fuzzy top result is confident enough — use it
    if (sortedFuzzy.length > 0 && sortedFuzzy[0].confidence >= 0.60) {
      const best = sortedFuzzy[0];
      const pricingBreakdown = calculatePrice(best.hotel, checkIn);
      const modelPrice = pricingBreakdown.finalPrice;
      const dealScore = calculateDealScore(listedPriceGbp, modelPrice);

      if (!dealScore) {
        const notMatched: UrlAnalysisNotMatched = {
          matched: false,
          extractedName: trimmedName,
          ...(typedSource !== undefined ? { source: typedSource } : {}),
          listedPrice: listedPrice as number,
          listedPriceGbp,
          currency: typedCurrency,
        };
        return new Response(JSON.stringify(notMatched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const projection = calculateProjection(best.hotel, checkIn);
      const matched = buildMatchedResponse(
        best.hotel,
        'fuzzy',
        best.confidence,
        listedPrice as number,
        listedPriceGbp,
        typedCurrency,
        checkIn,
        typedSource,
        trimmedName,
        pricingBreakdown,
        modelPrice,
        dealScore,
        projection,
      );
      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 6: Semantic match fallback
    let semanticResults: Awaited<ReturnType<typeof semanticMatch>> = [];
    try {
      const pineconeIndex = await getPineconeIndex();
      semanticResults = await semanticMatch(
        trimmedName,
        generateQueryEmbedding,
        pineconeIndex,
        supabase,
      );
    } catch (err) {
      console.error('Semantic match error:', err instanceof Error ? err.message : String(err));
      // Fall through to not-matched
    }

    // Deduplicate semantic results vs fuzzy by hotel ID
    const fuzzyIds = new Set(sortedFuzzy.map((r) => r.hotel.id));
    const uniqueSemantic = semanticResults.filter((r) => !fuzzyIds.has(r.hotel.id));

    // Merge and sort all results
    const allResults = [...sortedFuzzy, ...uniqueSemantic].sort(
      (a, b) => b.confidence - a.confidence,
    );

    // Re-run disambiguation check on merged results
    if (allResults.length >= 2) {
      const topConf = allResults[0].confidence;
      const secondConf = allResults[1].confidence;
      if (Math.abs(topConf - secondConf) <= 0.05) {
        const candidates = allResults.slice(0, 3);
        const disambiguation: UrlAnalysisDisambiguation = {
          matched: false,
          extractedName: trimmedName,
          ...(typedSource !== undefined ? { source: typedSource } : {}),
          listedPrice: listedPrice as number,
          listedPriceGbp,
          currency: typedCurrency,
          disambiguation: candidates.map((r) => ({
            hotel: r.hotel,
            confidence: r.confidence,
          })),
        };
        return new Response(JSON.stringify(disambiguation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // If top merged result is confident enough — use it
    if (allResults.length > 0 && allResults[0].confidence >= 0.60) {
      const best = allResults[0];
      const method = fuzzyIds.has(best.hotel.id) ? 'fuzzy' : 'semantic';
      const pricingBreakdown = calculatePrice(best.hotel, checkIn);
      const modelPrice = pricingBreakdown.finalPrice;
      const dealScore = calculateDealScore(listedPriceGbp, modelPrice);

      if (!dealScore) {
        const notMatched: UrlAnalysisNotMatched = {
          matched: false,
          extractedName: trimmedName,
          ...(typedSource !== undefined ? { source: typedSource } : {}),
          listedPrice: listedPrice as number,
          listedPriceGbp,
          currency: typedCurrency,
        };
        return new Response(JSON.stringify(notMatched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const projection = calculateProjection(best.hotel, checkIn);
      const matched = buildMatchedResponse(
        best.hotel,
        method as 'fuzzy' | 'semantic',
        best.confidence,
        listedPrice as number,
        listedPriceGbp,
        typedCurrency,
        checkIn,
        typedSource,
        trimmedName,
        pricingBreakdown,
        modelPrice,
        dealScore,
        projection,
      );
      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Not matched
    const notMatched: UrlAnalysisNotMatched = {
      matched: false,
      extractedName: trimmedName,
      ...(typedSource !== undefined ? { source: typedSource } : {}),
      listedPrice: listedPrice as number,
      listedPriceGbp,
      currency: typedCurrency,
    };
    return new Response(JSON.stringify(notMatched), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('URL analyze error:', err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: 'Analysis service unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

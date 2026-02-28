export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import type { PricingBreakdown } from '@/types';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

interface InsightContext {
  mode: 'search' | 'url-analysis';
  listedPrice?: number;
  currency?: string;
  source?: string;
  dealLabel?: string;
  percentageDiff?: number;
}

interface InsightRequest {
  hotelName: string;
  neighborhood: string;
  dynamicPrice: number;
  pricingBreakdown: PricingBreakdown;
  competitors: Array<{ name: string; price: number }>;
  context?: InsightContext;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, 20);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!body || typeof body !== 'object') {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const {
    hotelName,
    neighborhood,
    dynamicPrice,
    pricingBreakdown,
    competitors,
    context,
  } = body as Partial<InsightRequest>;

  if (!hotelName || typeof hotelName !== 'string') {
    return new Response(
      JSON.stringify({ error: 'hotelName is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!neighborhood || typeof neighborhood !== 'string') {
    return new Response(
      JSON.stringify({ error: 'neighborhood is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (typeof dynamicPrice !== 'number') {
    return new Response(
      JSON.stringify({ error: 'dynamicPrice is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!pricingBreakdown || typeof pricingBreakdown !== 'object') {
    return new Response(
      JSON.stringify({ error: 'pricingBreakdown is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // S2: Validate pricingBreakdown shape — prevent .toFixed() on undefined
  const pb = pricingBreakdown as unknown as Record<string, unknown>;
  if (
    typeof pb.demandMultiplier !== 'number' ||
    typeof pb.seasonalityMultiplier !== 'number' ||
    typeof pb.leadTimeMultiplier !== 'number' ||
    typeof pb.dayOfWeekMultiplier !== 'number'
  ) {
    return new Response(
      JSON.stringify({ error: 'Invalid pricingBreakdown: all multipliers must be numbers' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!Array.isArray(competitors)) {
    return new Response(
      JSON.stringify({ error: 'competitors is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // S3: Validate competitor element shapes and limit array size
  if (competitors.length > 10) {
    return new Response(
      JSON.stringify({ error: 'Too many competitors (max 10)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const validCompetitors = competitors.every(
    (c: unknown) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as Record<string, unknown>).name === 'string' &&
      typeof (c as Record<string, unknown>).price === 'number'
  );
  if (!validCompetitors) {
    return new Response(
      JSON.stringify({ error: 'Invalid competitors format: each must have name (string) and price (number)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate context.listedPrice if context.mode === 'url-analysis'
  if (
    context &&
    context.mode === 'url-analysis' &&
    context.listedPrice !== undefined &&
    (!Number.isFinite(context.listedPrice) || context.listedPrice <= 0)
  ) {
    return new Response(
      JSON.stringify({ error: 'context.listedPrice must be a positive number' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // S4: Sanitize and truncate user-supplied strings to prevent prompt injection
  const safeHotelName = hotelName.slice(0, 200).replace(/[<>{}]/g, '');
  const safeNeighborhood = neighborhood.slice(0, 100).replace(/[<>{}]/g, '');
  const safeCompetitors = competitors.map((c) => ({
    name: String(c.name).slice(0, 200).replace(/[<>{}]/g, ''),
    price: Number(c.price),
  }));

  // Sanitize optional context strings
  const safeContextSource = context?.source
    ? String(context.source).slice(0, 100).replace(/[<>{}]/g, '')
    : undefined;
  const safeContextDealLabel = context?.dealLabel
    ? String(context.dealLabel).slice(0, 100).replace(/[<>{}]/g, '')
    : undefined;

  try {
    const { getAnthropicClient } = await import('@/lib/anthropic');
    const client = getAnthropicClient();

    const competitorLines = safeCompetitors
      .map((c) => `- ${c.name}: £${Math.round(c.price)}`)
      .join('\n');

    const basePrompt = `You are a friendly travel advisor helping someone find the best hotel deal in London. Given the following hotel and pricing data, provide 1-2 sentences of warm, practical booking advice. Use everyday language — no jargon. Be specific about whether to book now or wait, and mention a competitor by name if relevant.

Hotel: ${safeHotelName} in ${safeNeighborhood}
Price: £${Math.round(dynamicPrice)} per night
Pricing factors:
- Demand: ×${pricingBreakdown.demandMultiplier.toFixed(2)}
- Seasonality: ×${pricingBreakdown.seasonalityMultiplier.toFixed(2)}
- Lead time: ×${pricingBreakdown.leadTimeMultiplier.toFixed(2)}
- Day of week: ×${pricingBreakdown.dayOfWeekMultiplier.toFixed(2)}

Competitors:
${competitorLines}

Provide concise, friendly booking advice.`;

    // Append deal-focused suffix for url-analysis mode
    let prompt = basePrompt;
    if (context?.mode === 'url-analysis') {
      const sourceName = safeContextSource ?? 'an OTA';
      const dealInfo = safeContextDealLabel
        ? `${safeContextDealLabel}${context.percentageDiff !== undefined ? `, ${context.percentageDiff}% difference` : ''}`
        : '';
      const VALID_CURRENCIES = ['GBP', 'USD', 'EUR'] as const;
      const safeCurrency = typeof context.currency === 'string' &&
        (VALID_CURRENCIES as readonly string[]).includes(context.currency)
        ? context.currency
        : 'GBP';
      const listedDisplay = context.listedPrice !== undefined
        ? `${safeCurrency}${Math.round(context.listedPrice)}`
        : 'the listed price';
      prompt = `${basePrompt}\n\nThe user found this hotel listed at ${listedDisplay} on ${sourceName}. Our pricing model values it at £${Math.round(dynamicPrice)}${dealInfo ? ` (deal score: ${dealInfo})` : ''}. Focus your advice on whether this specific listed price represents good value. Reference the most impactful pricing factor driving the difference, and name a specific cheaper alternative if the listed price is above model.`;
    }

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const stream = client.messages.stream({
            model: 'claude-3-haiku-20240307',
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          });

          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const chunk = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(new TextEncoder().encode(chunk));
            }
          }

          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('Claude stream error:', err instanceof Error ? err.message : String(err));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    console.error('Insight service error:', err instanceof Error ? err.message : String(err));
    return new Response(
      JSON.stringify({ error: 'Insight service unavailable' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

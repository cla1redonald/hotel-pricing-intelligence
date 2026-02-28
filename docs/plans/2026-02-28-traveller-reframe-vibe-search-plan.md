# Traveller Reframe + Vibe Search — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reframe the app from B2B pricing analyst to consumer traveller product, add vibe search chips, and surface deal scores on every hotel card.

**Architecture:** No backend changes. Add `getListedPrice()` to pricing.ts (seeded synthetic market price), new `VibeChips` component, update copy/persona across hero, search box, cards, and Claude insight route.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, lucide-react icons, existing shadcn/ui primitives

---

### Task 1: Add `getListedPrice()` to pricing.ts

**Files:**
- Modify: `src/lib/pricing.ts`
- Test: `src/__tests__/pricing.test.ts`

**Step 1: Write the failing test**

Add to `src/__tests__/pricing.test.ts`:

```typescript
import { getListedPrice } from '@/lib/pricing';

describe('getListedPrice', () => {
  const mockHotel = {
    id: 'test-1',
    name: 'Test Hotel',
    neighborhood: 'Mayfair',
    lat: null,
    lng: null,
    star_rating: 4,
    base_rate_gbp: 200,
    review_summary: 'A lovely hotel',
    amenities: ['wifi', 'gym'],
    pricing_factors: {
      demand_curve: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      seasonality: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
      occupancy_base: 60,
    },
    pinecone_id: 'hotel-test-1',
    created_at: '2024-01-01T00:00:00Z',
  };

  it('returns a number greater than zero', () => {
    const checkIn = new Date('2025-06-15');
    const listed = getListedPrice(mockHotel, checkIn);
    expect(listed).toBeGreaterThan(0);
  });

  it('is deterministic — same inputs produce same output', () => {
    const checkIn = new Date('2025-06-15');
    const a = getListedPrice(mockHotel, checkIn);
    const b = getListedPrice(mockHotel, checkIn);
    expect(a).toBe(b);
  });

  it('varies by hotel pinecone_id', () => {
    const checkIn = new Date('2025-06-15');
    const hotelA = { ...mockHotel, pinecone_id: 'hotel-aaa' };
    const hotelB = { ...mockHotel, pinecone_id: 'hotel-bbb' };
    const priceA = getListedPrice(hotelA, checkIn);
    const priceB = getListedPrice(hotelB, checkIn);
    expect(priceA).not.toBe(priceB);
  });

  it('stays within -15% to +20% of model price', () => {
    const checkIn = new Date('2025-06-15');
    const now = new Date('2025-06-01');
    // Run across many fake hotels to check bounds
    for (let i = 0; i < 50; i++) {
      const h = { ...mockHotel, pinecone_id: `hotel-bounds-${i}` };
      const listed = getListedPrice(h, checkIn, now);
      const { finalPrice } = calculatePrice(h, checkIn, now);
      const ratio = listed / finalPrice;
      expect(ratio).toBeGreaterThanOrEqual(0.85);
      expect(ratio).toBeLessThanOrEqual(1.20);
    }
  });
});
```

Also import `calculatePrice` at the top of the test file if not already imported.

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/pricing.test.ts --testNamePattern="getListedPrice" --no-coverage`
Expected: FAIL — `getListedPrice` is not exported

**Step 3: Write minimal implementation**

Add to `src/lib/pricing.ts` (after the existing `calculateProjection` function):

```typescript
/**
 * Generate a synthetic "market listed price" for a hotel on a given date.
 * Uses a seeded variance per hotel so some hotels are deals, some overpriced.
 * Variance range: -15% to +20% of the model price.
 */
export function getListedPrice(
  hotel: Hotel,
  checkInDate: Date,
  now: Date = new Date(),
): number {
  const { finalPrice } = calculatePrice(hotel, checkInDate, now);
  const variance = seededRandom(`listed:${hotel.pinecone_id}`);
  // Map [0, 1) to [-0.15, +0.20]
  const multiplier = 1 + (variance * 0.35 - 0.15);
  return Math.round(multiplier * finalPrice * 100) / 100;
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/pricing.test.ts --testNamePattern="getListedPrice" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/pricing.ts src/__tests__/pricing.test.ts
git commit -m "feat: add getListedPrice() for synthetic market prices (#10)"
```

---

### Task 2: Create `DealBadge` component

**Files:**
- Create: `src/components/DealBadge.tsx`
- Test: `src/__tests__/ui.test.ts` (add tests)

**Step 1: Write the failing test**

Add to `src/__tests__/ui.test.ts`:

```typescript
import { render, screen } from '@testing-library/react';
import { DealBadge } from '@/components/DealBadge';

describe('DealBadge', () => {
  it('renders Great Deal with savings', () => {
    render(
      <DealBadge
        dealScore={{
          label: 'Great Deal',
          percentageDiff: 12.5,
          savingsGbp: 25,
          direction: 'saving',
        }}
      />
    );
    expect(screen.getByText(/Great Deal/)).toBeInTheDocument();
    expect(screen.getByText(/Save £25/)).toBeInTheDocument();
  });

  it('renders Fair Price without savings amount', () => {
    render(
      <DealBadge
        dealScore={{
          label: 'Fair Price',
          percentageDiff: 5,
          savingsGbp: 10,
          direction: 'overpaying',
        }}
      />
    );
    expect(screen.getByText(/Fair Price/)).toBeInTheDocument();
  });

  it('renders Overpriced with overpaying amount', () => {
    render(
      <DealBadge
        dealScore={{
          label: 'Overpriced',
          percentageDiff: 15,
          savingsGbp: 30,
          direction: 'overpaying',
        }}
      />
    );
    expect(screen.getByText(/Overpriced/)).toBeInTheDocument();
    expect(screen.getByText(/£30 over/)).toBeInTheDocument();
  });

  it('renders nothing when dealScore is null', () => {
    const { container } = render(<DealBadge dealScore={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/ui.test.ts --testNamePattern="DealBadge" --no-coverage`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/components/DealBadge.tsx`:

```tsx
'use client';

import type { DealScore } from '@/types';

interface DealBadgeProps {
  dealScore: DealScore | null;
}

const styleMap = {
  'Great Deal': {
    bg: 'var(--discount-bg)',
    color: 'var(--discount)',
  },
  'Fair Price': {
    bg: 'var(--neutral-bg)',
    color: 'var(--neutral-pricing)',
  },
  Overpriced: {
    bg: 'var(--premium-bg)',
    color: 'var(--premium)',
  },
} as const;

export function DealBadge({ dealScore }: DealBadgeProps) {
  if (!dealScore) return null;

  const style = styleMap[dealScore.label];
  const suffix =
    dealScore.label === 'Great Deal'
      ? ` · Save £${Math.round(dealScore.savingsGbp)}`
      : dealScore.label === 'Overpriced'
        ? ` · £${Math.round(dealScore.savingsGbp)} over`
        : '';

  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: style.bg, color: style.color }}
      aria-label={`${dealScore.label}${suffix}`}
    >
      {dealScore.label}{suffix}
    </span>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/ui.test.ts --testNamePattern="DealBadge" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/DealBadge.tsx src/__tests__/ui.test.ts
git commit -m "feat: add DealBadge component (green/amber/red) (#10)"
```

---

### Task 3: Replace MatchScoreBadge with DealBadge on HotelCard

**Files:**
- Modify: `src/components/HotelCard.tsx`

**Step 1: Update imports**

In `src/components/HotelCard.tsx`:
- Remove: `import { MatchScoreBadge } from '@/components/MatchScoreBadge';`
- Add: `import { DealBadge } from '@/components/DealBadge';`
- Add: `import { getListedPrice } from '@/lib/pricing';`
- Add: `import { calculateDealScore } from '@/lib/deal-score';`

**Step 2: Add deal score calculation**

After the existing `const breakdown = calculatePrice(hotel, checkInDate);` line (~line 38), add:

```typescript
const listedPrice = getListedPrice(hotel, checkInDate);
const dealScore = calculateDealScore(listedPrice, breakdown.finalPrice);
```

**Step 3: Replace the badge in JSX**

Replace line 60 (`<MatchScoreBadge percentage={matchPercentage} />`):

```tsx
<DealBadge dealScore={dealScore} />
```

**Step 4: Update the breakdown trigger text**

Replace lines 83-84:
```tsx
{isBreakdownOpen ? 'Hide price breakdown' : 'View price breakdown'}
```
With:
```tsx
{isBreakdownOpen ? 'Hide price breakdown' : 'Why this price?'}
```

**Step 5: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All existing tests still pass (MatchScoreBadge is not directly tested)

**Step 6: Commit**

```bash
git add src/components/HotelCard.tsx
git commit -m "feat: replace match badge with deal score on hotel cards (#10)"
```

---

### Task 4: Create VibeChips component

**Files:**
- Create: `src/components/VibeChips.tsx`
- Test: `src/__tests__/ui.test.ts` (add tests)

**Step 1: Write the failing test**

Add to `src/__tests__/ui.test.ts`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { VibeChips } from '@/components/VibeChips';

describe('VibeChips', () => {
  it('renders all 6 vibe chips', () => {
    render(<VibeChips onVibeSelect={() => {}} activeVibe={null} />);
    expect(screen.getByText('Romantic')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
    expect(screen.getByText('Boutique')).toBeInTheDocument();
    expect(screen.getByText('Party')).toBeInTheDocument();
    expect(screen.getByText('Quiet Escape')).toBeInTheDocument();
    expect(screen.getByText('Family')).toBeInTheDocument();
  });

  it('calls onVibeSelect with query when chip is clicked', () => {
    const onVibeSelect = jest.fn();
    render(<VibeChips onVibeSelect={onVibeSelect} activeVibe={null} />);
    fireEvent.click(screen.getByText('Romantic'));
    expect(onVibeSelect).toHaveBeenCalledWith(
      'romantic',
      expect.stringContaining('romantic')
    );
  });

  it('highlights the active vibe chip', () => {
    render(<VibeChips onVibeSelect={() => {}} activeVibe="romantic" />);
    const chip = screen.getByText('Romantic').closest('button');
    expect(chip).toHaveStyle({ borderColor: 'var(--gold-500)' });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/ui.test.ts --testNamePattern="VibeChips" --no-coverage`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `src/components/VibeChips.tsx`:

```tsx
'use client';

import { Heart, Briefcase, Gem, Music, TreePine, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Vibe {
  id: string;
  label: string;
  icon: LucideIcon;
  query: string;
}

const vibes: Vibe[] = [
  {
    id: 'romantic',
    label: 'Romantic',
    icon: Heart,
    query: 'romantic intimate hotel for couples, cozy atmosphere, special occasion',
  },
  {
    id: 'business',
    label: 'Business',
    icon: Briefcase,
    query: 'business hotel, reliable wifi, work desk, meeting facilities, central location',
  },
  {
    id: 'boutique',
    label: 'Boutique',
    icon: Gem,
    query: 'boutique design hotel, unique character, stylish interiors, independent',
  },
  {
    id: 'party',
    label: 'Party',
    icon: Music,
    query: 'lively hotel near nightlife, bars and restaurants, vibrant neighborhood',
  },
  {
    id: 'quiet-escape',
    label: 'Quiet Escape',
    icon: TreePine,
    query: 'quiet peaceful hotel, tranquil setting, relaxing retreat away from crowds',
  },
  {
    id: 'family',
    label: 'Family',
    icon: Users,
    query: 'family friendly hotel, spacious rooms, kid amenities, safe neighborhood',
  },
];

interface VibeChipsProps {
  onVibeSelect: (vibeId: string, query: string) => void;
  activeVibe: string | null;
}

export function VibeChips({ onVibeSelect, activeVibe }: VibeChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center" role="group" aria-label="Search by vibe">
      {vibes.map((vibe) => {
        const Icon = vibe.icon;
        const isActive = activeVibe === vibe.id;
        return (
          <button
            key={vibe.id}
            onClick={() => onVibeSelect(vibe.id, vibe.query)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-[var(--gold-500)] focus-visible:outline-offset-2"
            style={{
              backgroundColor: isActive ? 'rgba(201, 168, 76, 0.15)' : 'transparent',
              color: isActive ? 'var(--gold-400)' : 'var(--navy-600)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: isActive ? 'var(--gold-500)' : 'var(--navy-800)',
            }}
            aria-pressed={isActive}
          >
            <Icon size={14} aria-hidden="true" />
            {vibe.label}
          </button>
        );
      })}
    </div>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/ui.test.ts --testNamePattern="VibeChips" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add src/components/VibeChips.tsx src/__tests__/ui.test.ts
git commit -m "feat: add VibeChips component with 6 mood-based search chips (#10)"
```

---

### Task 5: Wire VibeChips into page + update hero copy

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Add import**

Add at the top of `src/app/page.tsx`:
```typescript
import { VibeChips } from '@/components/VibeChips';
```

**Step 2: Add activeVibe state**

After the existing `const [hasSearched, setHasSearched] = useState(false);` (line 31), add:
```typescript
const [activeVibe, setActiveVibe] = useState<string | null>(null);
```

**Step 3: Add vibe handler**

After `handleSuggestionClick` function (~line 110), add:
```typescript
function handleVibeSelect(vibeId: string, vibeQuery: string) {
  const blended = query.trim()
    ? `${query.trim()}, ${vibeQuery}`
    : vibeQuery;
  setActiveVibe(vibeId);
  setQuery(blended);
  performSearch(blended);
}
```

**Step 4: Update hero copy**

Replace lines 208-213:
```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--text-inverse)]">
  Hotel Pricing Intelligence
</h1>
<p className="mt-2 text-base text-[var(--navy-600)]">
  AI-powered dynamic pricing and competitive analysis for London hotels
</p>
```
With:
```tsx
<h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[var(--text-inverse)]">
  Find your perfect London hotel
</h1>
<p className="mt-2 text-base text-[var(--navy-600)]">
  See the real price.
</p>
```

**Step 5: Add VibeChips below DatePicker**

After the DatePicker `</div>` (after line 231), add:
```tsx
<div className="w-full max-w-[720px] mt-1">
  <VibeChips onVibeSelect={handleVibeSelect} activeVibe={activeVibe} />
</div>
```

**Step 6: Update the pre-search placeholder text**

Replace lines 278-283:
```tsx
<div className="text-center py-16">
  <p className="text-sm text-[var(--text-muted)]">
    Search for London hotels above to get started.
  </p>
</div>
```
With:
```tsx
<div className="text-center py-16">
  <p className="text-sm text-[var(--text-muted)]">
    Search or pick a vibe above to discover London hotels.
  </p>
</div>
```

**Step 7: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

**Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire vibe chips into page, update hero copy (#10)"
```

---

### Task 6: Update SearchBox placeholder

**Files:**
- Modify: `src/components/SearchBox.tsx`

**Step 1: Update placeholder**

In `src/components/SearchBox.tsx`, line 52, replace:
```
placeholder="Search for a hotel... e.g. quiet boutique near Covent Garden"
```
With:
```
placeholder="Where do you want to stay?"
```

**Step 2: Run tests**

Run: `npx jest --no-coverage`
Expected: All pass

**Step 3: Commit**

```bash
git add src/components/SearchBox.tsx
git commit -m "feat: update search placeholder to traveller-friendly copy (#10)"
```

---

### Task 7: Update EmptyState suggestions

**Files:**
- Modify: `src/components/EmptyState.tsx`

**Step 1: Update suggestions array**

Replace lines 9-13:
```typescript
const suggestions = [
  'luxury hotel in central London',
  "budget-friendly near King's Cross",
  'boutique hotel with rooftop bar',
];
```
With:
```typescript
const suggestions = [
  'Romantic weekend in Covent Garden',
  'Quiet boutique near Hyde Park',
  'Family hotel with pool',
];
```

**Step 2: Run tests**

Run: `npx jest --no-coverage`
Expected: All pass

**Step 3: Commit**

```bash
git add src/components/EmptyState.tsx
git commit -m "feat: update empty state suggestions to traveller vibes (#10)"
```

---

### Task 8: Update Claude insight persona

**Files:**
- Modify: `src/app/api/insight/route.ts`

**Step 1: Update the base prompt**

Replace the `basePrompt` string (lines 168-181) with:

```typescript
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
```

**Step 2: Run tests**

Run: `npx jest --no-coverage`
Expected: All pass (insight tests mock the API, don't test prompt text)

**Step 3: Commit**

```bash
git add src/app/api/insight/route.ts
git commit -m "feat: update Claude insight to friendly travel advisor persona (#10)"
```

---

### Task 9: Build verification + typecheck

**Files:** None (verification only)

**Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 2: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All 150+ tests pass

**Step 3: Run build**

Run: `npx next build`
Expected: Build succeeds (may show warnings about env vars — that's fine, the lazy imports handle it)

**Step 4: Commit any fixes if needed, then tag**

```bash
git tag v1.1.0
```

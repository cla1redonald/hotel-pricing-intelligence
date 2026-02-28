# Frontend Guidelines

> **Status:** LOCKED — values do not change without explicit design review.

---

## 1. Colour Palette

### Primary Colours

| Token | Hex | Usage |
|-------|-----|-------|
| `--navy-950` | `#0f172a` | Page background, card headers |
| `--navy-900` | `#1e293b` | Secondary backgrounds |
| `--navy-800` | `#334155` | Borders, dividers |
| `--navy-700` | `#475569` | Secondary text |
| `--navy-600` | `#64748b` | Muted text, placeholders |

### Accent

| Token | Hex | Usage |
|-------|-----|-------|
| `--gold-500` | `#c9a84c` | Primary accent, CTA buttons, highlights |
| `--gold-400` | `#d4b86a` | Hover states |
| `--gold-300` | `#e0c888` | Subtle accents, borders |
| `--gold-600` | `#a88a3a` | Active/pressed states |

### Backgrounds

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#f8fafc` | Page background (light) |
| `--bg-card` | `#ffffff` | Card backgrounds |
| `--bg-muted` | `#f1f5f9` | Muted sections, skeleton base |
| `--bg-input` | `#ffffff` | Input backgrounds |

### Semantic (Pricing)

| Token | Hex | Usage |
|-------|-----|-------|
| `--discount` | `#16a34a` | Discount multipliers, cheaper competitors |
| `--discount-bg` | `#f0fdf4` | Discount badge background |
| `--premium` | `#dc2626` | Premium multipliers, pricier competitors |
| `--premium-bg` | `#fef2f2` | Premium badge background |
| `--neutral` | `#d97706` | Neutral multipliers (~1.0x) |
| `--neutral-bg` | `#fffbeb` | Neutral badge background |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--text-primary` | `#0f172a` | Headings, primary content |
| `--text-secondary` | `#475569` | Body text, descriptions |
| `--text-muted` | `#94a3b8` | Captions, timestamps |
| `--text-inverse` | `#f8fafc` | Text on dark backgrounds |

### Contrast Ratios (WCAG AA)
- `--text-primary` on `--bg-card`: 15.4:1
- `--text-secondary` on `--bg-card`: 6.4:1
- `--text-muted` on `--bg-card`: 3.3:1 (large text only)
- `--gold-500` on `--navy-950`: 7.2:1
- `--text-inverse` on `--navy-950`: 15.4:1

---

## 2. Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Scale

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-xs` | 12px | 16px | Badges, small labels |
| `text-sm` | 14px | 20px | Captions, metadata, factor labels |
| `text-base` | 16px | 24px | Body text, descriptions |
| `text-lg` | 18px | 28px | Card titles, section headers |
| `text-xl` | 20px | 28px | Hotel names |
| `text-2xl` | 24px | 32px | Prices, section headings |
| `text-3xl` | 30px | 36px | Hero search heading |
| `text-4xl` | 36px | 40px | Page title (desktop only) |

### Weights

| Token | Value | Usage |
|-------|-------|-------|
| `font-normal` | 400 | Body text, descriptions |
| `font-medium` | 500 | Labels, metadata |
| `font-semibold` | 600 | Card titles, prices, multipliers |
| `font-bold` | 700 | Page title, hero heading |

### Usage Table

| Element | Size | Weight | Colour |
|---------|------|--------|--------|
| Page title | text-3xl / text-4xl | bold | text-primary |
| Search placeholder | text-lg | normal | text-muted |
| Hotel name | text-xl | semibold | text-primary |
| Neighborhood | text-sm | medium | text-secondary |
| Dynamic price | text-2xl | semibold | text-primary |
| Price label "per night" | text-xs | normal | text-muted |
| Factor name | text-sm | medium | text-secondary |
| Factor multiplier | text-sm | semibold | discount/premium/neutral |
| Match score | text-xs | semibold | gold-500 |
| Claude insight | text-sm | normal | text-secondary |
| Competitor name | text-sm | medium | text-primary |
| Competitor price | text-sm | semibold | text-primary |
| Price delta | text-xs | semibold | discount/premium |

---

## 3. Spacing Scale

Base unit: 4px

| Token | Value | Common Usage |
|-------|-------|-------------|
| `space-1` | 4px | Inline gaps, icon padding |
| `space-2` | 8px | Badge padding, tight gaps |
| `space-3` | 12px | Input padding, small card gaps |
| `space-4` | 16px | Card padding, section gaps |
| `space-5` | 20px | Between card sections |
| `space-6` | 24px | Between cards in grid |
| `space-8` | 32px | Major section separators |
| `space-10` | 40px | Page section spacing |
| `space-12` | 48px | Hero section padding |
| `space-16` | 64px | Page top/bottom margins |

---

## 4. Component Specifications

### SearchBox
- Full-width, max-width 720px, centered
- Height: 56px (desktop), 48px (mobile)
- Background: `--bg-input` with 2px border `--navy-800`
- Focus: border `--gold-500`, ring `--gold-300` 2px
- Placeholder: "Search for a hotel... e.g. quiet boutique near Covent Garden"
- Search icon (lucide `Search`) left-aligned, 20px, `--text-muted`
- Submit button: right-aligned inside input, `--gold-500` background, `--navy-950` text
- Auto-focus on page load
- Enter key submits

### DatePicker
- shadcn/ui Calendar in Popover
- Below search box, left-aligned
- Trigger button: text-sm, icon (lucide `Calendar`), shows selected date
- Default: today's date
- Compact: 200px width

### HotelCard
- Background: `--bg-card`
- Border: 1px `--bg-muted`
- Border-radius: 12px
- Shadow: `0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)`
- Hover shadow: `0 4px 12px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.06)`
- Padding: space-5 (20px)
- Layout (top to bottom):
  1. **Header**: Hotel name (text-xl semibold) + Star rating (visual stars, lucide `Star` filled, `--gold-500`)
  2. **Meta row**: Neighborhood badge + Match score badge
  3. **Price section**: Dynamic price (text-2xl semibold) + "per night" label
  4. **Expand trigger**: "View price breakdown" button (text-sm, chevron icon)
  5. **PriceBreakdown** (collapsible)
  6. **PriceProjectionChart** (always visible)
  7. **CompetitiveSet** (loads async)
  8. **ClaudeInsight** (loads async, streams)

### Match Score Badge
- Background: `--gold-500` at 10% opacity
- Text: `--gold-600`, text-xs semibold
- Format: "92% match"
- Padding: space-1 horizontal, space-0.5 vertical
- Border-radius: 9999px (pill)

### PriceBreakdown
- Collapsible section, default collapsed
- Layout: vertical list, financial-statement style
- Top: "Base rate" — right-aligned `£{baseRate}`
- 4 factor rows, each:
  - Left: Factor name (text-sm medium)
  - Center: Visual dot indicator (green/red/amber)
  - Right: Multiplier value (text-sm semibold, colour-coded)
  - Colour logic: < 0.97 → discount (green), > 1.03 → premium (red), else → neutral (amber)
- Bottom separator line
- Final: "Tonight's price" — right-aligned `£{finalPrice}` (text-lg semibold)
- Padding: space-4, background: `--bg-muted`, border-radius: 8px

### PriceProjectionChart
- Recharts `LineChart`, responsive width, height: 160px
- Line: stroke `--gold-500`, strokeWidth 2, dot radius 4
- X-axis: date labels (format: "Mon 3"), text-xs, `--text-muted`
- Y-axis: price labels (format: "£120"), text-xs, `--text-muted`
- Grid: horizontal only, stroke `--bg-muted`
- Tooltip: background `--navy-950`, text `--text-inverse`, border-radius 8px
  - Shows: date, price, dominant pricing factor
- Area fill: `--gold-500` at 8% opacity
- Margin-top: space-4

### CompetitiveSet
- Section title: "Similar Hotels" (text-sm semibold, text-secondary)
- 3 horizontal cards in a row (flex, gap space-3)
- Each card:
  - Background: `--bg-muted`, border-radius 8px, padding space-3
  - Hotel name (text-sm medium, truncate)
  - Price (text-sm semibold)
  - Delta badge: "+£12" (premium-red) or "−£8" (discount-green)
    - Use true minus sign (−), not hyphen (-)
- Loading state: 3 shimmer rectangles

### ClaudeInsight
- Section label: "AI Insight" with sparkle icon (lucide `Sparkles`), text-xs, `--text-muted`
- Text: text-sm normal, `--text-secondary`
- Streaming: word-by-word at ~16ms intervals
- Loading: 2 shimmer lines (height 14px, width 100% and 60%)
- Error: section hidden entirely (graceful degradation)
- Border-left: 2px `--gold-300`, padding-left: space-3
- `aria-live="polite"` for screen readers

---

## 5. Layout

### Page Structure
```
+------------------------------------------+
|           Header (app name + tagline)     |
+------------------------------------------+
|                                           |
|          Search Box (centered)            |
|          Date Picker (left-aligned)       |
|                                           |
+------------------------------------------+
|                                           |
|          Results Grid                     |
|          (cards, 1-2 columns)             |
|                                           |
+------------------------------------------+
```

### Container
- Max width: 1200px
- Horizontal padding: space-4 (mobile), space-6 (tablet), space-8 (desktop)
- Centered with `mx-auto`

### Results Grid
- Mobile: 1 column, full width
- Tablet (640px+): 1 column, max-width 640px centered
- Desktop (1024px+): 2 columns, gap space-6

### Hero Section
- Background: `--navy-950`
- Text: `--text-inverse`
- Padding: space-12 vertical (desktop), space-8 (mobile)
- Search box sits within the hero, visually prominent

---

## 6. States

### Search Loading
- 4 skeleton cards in grid layout
- Each skeleton: card shape with pulse animation
- Skeleton elements: title bar (40%), meta row (60%), price block (30%), chart placeholder

### Competitive Set Loading
- 3 inline shimmer rectangles (same size as competitor cards)
- Pulse animation, `--bg-muted` base, `--bg-card` highlight

### Claude Insight Loading
- 2 shimmer lines: 100% width, then 60% width
- Height: 14px each, gap space-2
- Same pulse animation

### Error State
- Icon: lucide `AlertCircle`, `--premium` colour
- Message: "Something went wrong. Please try again."
- Retry button: outlined style, `--navy-800` border
- Compact, replaces results area

### Empty Results
- Icon: lucide `SearchX`, `--text-muted`
- Message: "No hotels found for your search."
- Suggestions: "Try a broader search like:"
  - "luxury hotel in central London"
  - "budget-friendly near King's Cross"
  - "boutique hotel with rooftop bar"
- Suggestions as clickable chips that populate search box

---

## 7. Animation

| Property | Duration | Easing | Usage |
|----------|----------|--------|-------|
| Hover transitions | 150ms | ease | Buttons, cards, links |
| Expand/collapse | 200ms | ease-out | Price breakdown |
| Skeleton pulse | 1.5s | ease-in-out | Loading states, infinite |
| Card entrance | 200ms | ease-out | Results appearing, stagger 50ms per card |
| Streaming text | ~16ms per word | linear | Claude insight |

### prefers-reduced-motion
- Disable: skeleton pulse, card entrance stagger, streaming animation (show full text immediately)
- Keep: expand/collapse (functional, not decorative)

---

## 8. Border Radius & Shadows

### Border Radius

| Element | Radius |
|---------|--------|
| Cards | 12px (`rounded-xl`) |
| Buttons | 8px (`rounded-lg`) |
| Inputs | 8px (`rounded-lg`) |
| Badges | 9999px (`rounded-full`) |
| Competitive set mini-cards | 8px (`rounded-lg`) |
| Price breakdown container | 8px (`rounded-lg`) |
| Tooltips | 8px (`rounded-lg`) |

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `shadow-card` | `0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)` | Default card |
| `shadow-card-hover` | `0 4px 12px rgba(15,23,42,0.12), 0 2px 4px rgba(15,23,42,0.06)` | Card hover |
| `shadow-search` | `0 4px 16px rgba(15,23,42,0.12)` | Search box focus |
| `shadow-tooltip` | `0 4px 8px rgba(15,23,42,0.16)` | Chart tooltips |

---

## 9. Responsive Breakpoints

| Breakpoint | Target | Key Changes |
|-----------|--------|-------------|
| 0-640px | Mobile | Single column, stacked cards, compact hero, hamburger-free (no nav) |
| 640-1024px | Tablet | Single column centered (max 640px), larger hero padding |
| 1024px+ | Desktop | 2-column results grid, full hero, expanded card details |

### Per-element Responsive

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| Search box height | 48px | 56px | 56px |
| Card padding | 16px | 20px | 20px |
| Results columns | 1 | 1 | 2 |
| Hero padding | 32px | 40px | 48px |
| Page title | text-2xl | text-3xl | text-4xl |
| Competitive set | Vertical stack | Horizontal row | Horizontal row |
| Chart height | 120px | 160px | 160px |

---

## 10. Iconography

Using `lucide-react` exclusively.

| Icon | Usage |
|------|-------|
| `Search` | Search input |
| `Calendar` | Date picker trigger |
| `Star` | Hotel star rating (filled) |
| `ChevronDown` / `ChevronUp` | Price breakdown toggle |
| `Sparkles` | Claude insight label |
| `AlertCircle` | Error states |
| `SearchX` | Empty results |
| `TrendingUp` / `TrendingDown` | Price delta indicators |
| `Loader2` | Inline loading spinner |

---

## 11. Accessibility

- All interactive elements have visible focus rings (2px `--gold-500`, 2px offset)
- Star ratings: `aria-label="X out of 5 stars"`
- Price breakdown toggle: `aria-expanded="true/false"`
- Claude insight container: `aria-live="polite"` for streaming updates
- Chart: `aria-label` with text summary of price trend
- All images/icons: decorative icons use `aria-hidden="true"`, functional icons have `aria-label`
- Keyboard: Tab through search → date picker → results → expand/collapse
- Minimum touch target: 44x44px

---

## 12. Price Formatting Rules

| Format | Example | Usage |
|--------|---------|-------|
| Dynamic price | `£142` | Main card price (no decimals for round numbers) |
| Price with pence | `£142.50` | When not round |
| Multiplier | `×1.15` | Factor multiplier display |
| Price delta (cheaper) | `−£18` | Competitor cheaper (true minus sign −, not hyphen) |
| Price delta (pricier) | `+£12` | Competitor pricier |
| Base rate | `£120` | Price breakdown base |

---

## 13. Component File Map

```
src/components/
  SearchBox.tsx
  DatePicker.tsx
  SearchResults.tsx
  HotelCard.tsx
  StarRating.tsx
  MatchScoreBadge.tsx
  PriceBreakdown.tsx
  PriceProjectionChart.tsx
  CompetitiveSet.tsx
  ClaudeInsight.tsx
  SkeletonCard.tsx
  EmptyState.tsx
  ErrorState.tsx
  ui/                    # shadcn/ui components
    button.tsx
    card.tsx
    input.tsx
    badge.tsx
    collapsible.tsx
    popover.tsx
    calendar.tsx
    skeleton.tsx
    separator.tsx
```

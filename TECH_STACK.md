# Tech Stack

## Core Framework
| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.2.21 | App Router, API routes, SSR |
| react | ^18.3.1 | UI library (pinned to 18) |
| react-dom | ^18.3.1 | React DOM renderer (pinned to 18) |
| typescript | ^5.6.3 | Type safety |

## AI / Data Services
| Package | Version | Purpose |
|---------|---------|---------|
| @pinecone-database/pinecone | ^4.0.0 | Vector search client |
| openai | ^4.77.0 | Embedding generation |
| @supabase/supabase-js | ^2.47.12 | Postgres client |
| @anthropic-ai/sdk | ^0.36.3 | Claude streaming insights |

## UI
| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | ^3.4.17 | Utility-first CSS |
| postcss | ^8.4.49 | CSS processing |
| autoprefixer | ^10.4.20 | Vendor prefixes |
| recharts | ^2.15.0 | 7-day price projection charts |
| class-variance-authority | ^0.7.1 | shadcn/ui variant system |
| clsx | ^2.1.1 | Conditional classnames |
| tailwind-merge | ^2.6.0 | Tailwind class dedup |
| lucide-react | ^0.468.0 | Icons |
| date-fns | ^4.1.0 | Date formatting and math |

## shadcn/ui Components (installed via CLI)
- button, input, card, badge, collapsible, popover, calendar, skeleton, separator

## Development
| Package | Version | Purpose |
|---------|---------|---------|
| vitest | ^2.1.8 | Test runner |
| @testing-library/react | ^16.1.0 | Component testing |
| @testing-library/jest-dom | ^6.6.3 | DOM assertions |
| @vitejs/plugin-react | ^4.3.4 | React support for Vitest |
| jsdom | ^25.0.1 | DOM environment for tests |
| eslint | ^8.57.1 | Linting |
| eslint-config-next | 14.2.21 | Next.js ESLint rules |

## Data Pipeline (devDependencies)
| Package | Version | Purpose |
|---------|---------|---------|
| csv-parse | ^5.6.0 | Kaggle CSV parsing |
| dotenv | ^16.4.7 | Env vars for scripts |
| tsx | ^4.19.2 | Run TypeScript scripts directly |

## Deployment
- **Hosting:** Vercel
- **Database:** Supabase (hosted, free tier)
- **Vector DB:** Pinecone (serverless, free tier)
- **CI/CD:** None (manual deploy)

## Explicitly Excluded
| Package | Reason |
|---------|--------|
| pgvector | Portfolio requires demonstrating Pinecone specifically |
| jest | Using Vitest instead (faster, native ESM) |
| react@19 | Next.js 14 requires React 18. Pin explicitly. |
| legacy-peer-deps | Masks real dependency conflicts |
| zustand/redux | React state + server state is sufficient for this app |
| leaflet/mapbox | Map view is out of scope for v1 |

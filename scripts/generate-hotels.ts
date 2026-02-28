/**
 * Hotel Data Generator
 * Generates 1,000+ realistic synthetic London hotel records.
 * Uses seeded PRNG for reproducibility.
 */

import { Hotel, PricingFactors } from '../src/types';
import * as crypto from 'crypto';

// ─── Seeded PRNG ─────────────────────────────────────────────────────────────
// Simple mulberry32 PRNG for reproducibility
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(42);

function random(): number {
  return rng();
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  const val = min + random() * (max - min);
  return parseFloat(val.toFixed(decimals));
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => random() - 0.5);
  return shuffled.slice(0, n);
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Neighborhood Data ───────────────────────────────────────────────────────

export interface NeighborhoodInfo {
  name: string;
  area: 'central' | 'south_bank' | 'west' | 'east' | 'north' | 'city' | 'other';
  lat: number;
  lng: number;
  priceMultiplier: number; // 0.7 - 1.4 relative to star-rating base
  luxuryWeight: number;    // likelihood of high-star hotels (0-1)
}

export const NEIGHBORHOODS: NeighborhoodInfo[] = [
  // Central
  { name: 'Mayfair', area: 'central', lat: 51.5095, lng: -0.1480, priceMultiplier: 1.40, luxuryWeight: 0.95 },
  { name: 'Soho', area: 'central', lat: 51.5137, lng: -0.1341, priceMultiplier: 1.20, luxuryWeight: 0.60 },
  { name: 'Covent Garden', area: 'central', lat: 51.5117, lng: -0.1240, priceMultiplier: 1.25, luxuryWeight: 0.65 },
  { name: 'Marylebone', area: 'central', lat: 51.5225, lng: -0.1550, priceMultiplier: 1.15, luxuryWeight: 0.70 },
  { name: 'Fitzrovia', area: 'central', lat: 51.5200, lng: -0.1388, priceMultiplier: 1.10, luxuryWeight: 0.55 },
  { name: 'Bloomsbury', area: 'central', lat: 51.5230, lng: -0.1282, priceMultiplier: 1.05, luxuryWeight: 0.50 },
  { name: 'Holborn', area: 'central', lat: 51.5175, lng: -0.1200, priceMultiplier: 1.00, luxuryWeight: 0.40 },
  { name: 'Westminster', area: 'central', lat: 51.4975, lng: -0.1357, priceMultiplier: 1.30, luxuryWeight: 0.85 },
  { name: "St James's", area: 'central', lat: 51.5060, lng: -0.1370, priceMultiplier: 1.35, luxuryWeight: 0.90 },
  { name: 'Piccadilly', area: 'central', lat: 51.5099, lng: -0.1337, priceMultiplier: 1.25, luxuryWeight: 0.75 },

  // South Bank
  { name: 'Southwark', area: 'south_bank', lat: 51.5035, lng: -0.1035, priceMultiplier: 0.90, luxuryWeight: 0.35 },
  { name: 'Waterloo', area: 'south_bank', lat: 51.5014, lng: -0.1131, priceMultiplier: 0.95, luxuryWeight: 0.40 },
  { name: 'Bankside', area: 'south_bank', lat: 51.5065, lng: -0.0985, priceMultiplier: 0.95, luxuryWeight: 0.40 },
  { name: 'London Bridge', area: 'south_bank', lat: 51.5055, lng: -0.0875, priceMultiplier: 1.00, luxuryWeight: 0.45 },
  { name: 'Bermondsey', area: 'south_bank', lat: 51.4979, lng: -0.0637, priceMultiplier: 0.85, luxuryWeight: 0.25 },

  // West
  { name: 'Chelsea', area: 'west', lat: 51.4875, lng: -0.1687, priceMultiplier: 1.20, luxuryWeight: 0.75 },
  { name: 'Kensington', area: 'west', lat: 51.4990, lng: -0.1889, priceMultiplier: 1.25, luxuryWeight: 0.80 },
  { name: 'South Kensington', area: 'west', lat: 51.4940, lng: -0.1740, priceMultiplier: 1.20, luxuryWeight: 0.75 },
  { name: 'Knightsbridge', area: 'west', lat: 51.5015, lng: -0.1607, priceMultiplier: 1.35, luxuryWeight: 0.90 },
  { name: "Earl's Court", area: 'west', lat: 51.4920, lng: -0.1950, priceMultiplier: 0.85, luxuryWeight: 0.30 },
  { name: 'Notting Hill', area: 'west', lat: 51.5090, lng: -0.1960, priceMultiplier: 1.10, luxuryWeight: 0.55 },
  { name: 'Paddington', area: 'west', lat: 51.5154, lng: -0.1755, priceMultiplier: 0.90, luxuryWeight: 0.35 },
  { name: 'Bayswater', area: 'west', lat: 51.5120, lng: -0.1880, priceMultiplier: 0.90, luxuryWeight: 0.35 },

  // East
  { name: 'Shoreditch', area: 'east', lat: 51.5264, lng: -0.0803, priceMultiplier: 0.95, luxuryWeight: 0.35 },
  { name: 'Whitechapel', area: 'east', lat: 51.5155, lng: -0.0597, priceMultiplier: 0.80, luxuryWeight: 0.15 },
  { name: 'Canary Wharf', area: 'east', lat: 51.5054, lng: -0.0235, priceMultiplier: 1.05, luxuryWeight: 0.50 },
  { name: 'Stratford', area: 'east', lat: 51.5430, lng: -0.0004, priceMultiplier: 0.75, luxuryWeight: 0.15 },
  { name: 'Hackney', area: 'east', lat: 51.5450, lng: -0.0553, priceMultiplier: 0.75, luxuryWeight: 0.10 },
  { name: 'Bethnal Green', area: 'east', lat: 51.5273, lng: -0.0550, priceMultiplier: 0.75, luxuryWeight: 0.10 },

  // North
  { name: 'Camden', area: 'north', lat: 51.5390, lng: -0.1426, priceMultiplier: 0.85, luxuryWeight: 0.25 },
  { name: "King's Cross", area: 'north', lat: 51.5320, lng: -0.1245, priceMultiplier: 0.95, luxuryWeight: 0.40 },
  { name: 'Islington', area: 'north', lat: 51.5362, lng: -0.1033, priceMultiplier: 0.90, luxuryWeight: 0.30 },
  { name: 'Angel', area: 'north', lat: 51.5322, lng: -0.1058, priceMultiplier: 0.90, luxuryWeight: 0.30 },
  { name: 'Hampstead', area: 'north', lat: 51.5565, lng: -0.1781, priceMultiplier: 1.00, luxuryWeight: 0.45 },

  // City
  { name: 'City of London', area: 'city', lat: 51.5155, lng: -0.0922, priceMultiplier: 1.10, luxuryWeight: 0.55 },
  { name: 'Liverpool Street', area: 'city', lat: 51.5178, lng: -0.0823, priceMultiplier: 1.05, luxuryWeight: 0.50 },
  { name: 'Tower Hill', area: 'city', lat: 51.5101, lng: -0.0763, priceMultiplier: 1.05, luxuryWeight: 0.50 },
  { name: 'Bank', area: 'city', lat: 51.5133, lng: -0.0886, priceMultiplier: 1.10, luxuryWeight: 0.55 },
  { name: 'Barbican', area: 'city', lat: 51.5200, lng: -0.0940, priceMultiplier: 0.95, luxuryWeight: 0.35 },

  // Other
  { name: 'Greenwich', area: 'other', lat: 51.4769, lng: -0.0005, priceMultiplier: 0.80, luxuryWeight: 0.20 },
  { name: 'Richmond', area: 'other', lat: 51.4613, lng: -0.3037, priceMultiplier: 0.90, luxuryWeight: 0.35 },
  { name: 'Battersea', area: 'other', lat: 51.4753, lng: -0.1500, priceMultiplier: 0.85, luxuryWeight: 0.25 },
  { name: 'Brixton', area: 'other', lat: 51.4613, lng: -0.1145, priceMultiplier: 0.70, luxuryWeight: 0.05 },
  { name: 'Fulham', area: 'other', lat: 51.4730, lng: -0.2010, priceMultiplier: 0.85, luxuryWeight: 0.25 },
];

// ─── Nearby Landmarks ────────────────────────────────────────────────────────

const LANDMARKS_BY_AREA: Record<string, string[]> = {
  central: [
    'Oxford Street', 'Regent Street', 'Buckingham Palace', 'Trafalgar Square',
    'the West End theatres', 'the British Museum', 'Hyde Park', 'Green Park',
    'Piccadilly Circus', 'the National Gallery', 'Bond Street shops',
    'Carnaby Street', 'the Royal Academy', 'Leicester Square',
  ],
  south_bank: [
    'the Tate Modern', 'Shakespeare\'s Globe', 'Borough Market', 'the Shard',
    'the London Eye', 'Waterloo Station', 'the Southbank Centre',
    'Tower Bridge', 'the National Theatre',
  ],
  west: [
    'the Natural History Museum', 'the Victoria & Albert Museum', 'Harrods',
    'the Royal Albert Hall', 'Kensington Palace', 'Holland Park',
    'Portobello Road Market', 'the Science Museum', 'Chelsea Physic Garden',
    'King\'s Road shops',
  ],
  east: [
    'Brick Lane', 'Spitalfields Market', 'the Olympic Park', 'Victoria Park',
    'the Museum of London Docklands', 'Columbia Road Flower Market',
    'Old Spitalfields Market', 'Whitechapel Gallery',
  ],
  north: [
    'Camden Market', 'Regent\'s Canal', 'Hampstead Heath', 'the British Library',
    'St Pancras International', 'Sadler\'s Wells Theatre', 'Angel\'s Upper Street',
    'the Emirates Stadium',
  ],
  city: [
    'St Paul\'s Cathedral', 'the Tower of London', 'the Bank of England',
    'the Barbican Centre', 'the Gherkin', 'Leadenhall Market',
    'the Museum of London', 'the Monument',
  ],
  other: [
    'the Royal Observatory', 'Greenwich Park', 'the O2 Arena',
    'Kew Gardens', 'Richmond Park', 'Battersea Power Station',
    'the Cutty Sark', 'Battersea Park',
  ],
};

// ─── Hotel Name Components ───────────────────────────────────────────────────

const LUXURY_PREFIXES = ['The Grand', 'The Royal', 'The Ritz', 'The Langham', 'The Dorchester', 'The Savoy', 'The Connaught', 'The Berkeley', 'The Lanesborough', 'The Beaumont'];
const LUXURY_SUFFIXES = ['Palace', 'Residences', 'Suites', 'Grand Hotel', 'Collection'];
const UPSCALE_NAMES = ['Montague', 'Clarendon', 'Belgravia', 'Carlton', 'Stafford', 'Cadogan', 'Flemings', 'Dukes', 'Goring', 'Amba', 'Eccleston', 'Pelham', 'Egerton', 'Draycott', 'Capital', 'Milestone', 'Halkin', 'Mandarin', 'Corinthia', 'Rosewood'];
const MID_NAMES = ['Albion', 'Thistle', 'Arden', 'Crown', 'Imperial', 'Strand', 'Victoria', 'Georgian', 'Windsor', 'Regal', 'Ambassador', 'Apex', 'Citadines', 'Point A', 'Hub', 'Mercure', 'Novotel', 'Holiday', 'Park', 'Central', 'Metro', 'Premier', 'Express', 'Comfort'];
const BUDGET_NAMES = ['Travelodge', 'easyHotel', 'SafeStay', 'Generator', 'Wombat', 'Clink', 'YHA', 'Astor', 'Palmers', 'Dover', 'Alhambra', 'Ridgemount', 'Jesmond', 'Arran', 'Celtic', 'Wardonia', 'Fairway'];
const HOTEL_TYPES_LUXURY = ['Hotel', 'House', 'Residences', 'Suites', 'Collection'];
const HOTEL_TYPES_MID = ['Hotel', 'House', 'Inn', 'Suites', 'Apart-Hotel'];
const HOTEL_TYPES_BUDGET = ['Inn', 'Lodge', 'Hostel', 'Hotel', 'Stay'];

const ADJECTIVES_LUXURY = ['Grand', 'Royal', 'Imperial', 'Majestic', 'Elegant', 'Premier', 'Platinum', 'Sovereign'];
const ADJECTIVES_MID = ['Ivy', 'Amber', 'Sapphire', 'Sterling', 'Heritage', 'Classic', 'Garden', 'Riverside', 'Park', 'City'];
const ADJECTIVES_BUDGET = ['Friendly', 'Smart', 'Easy', 'Quick', 'Simple', 'Compact'];

// ─── Review Templates ────────────────────────────────────────────────────────

interface ReviewTemplate {
  location: string[];
  rooms: string[];
  service: string[];
  vibe: string[];
  amenities: string[];
}

const REVIEW_TEMPLATES: Record<number, ReviewTemplate> = {
  5: {
    location: [
      'Situated in the heart of {neighborhood}, just minutes from {landmark}.',
      'An exceptional location in {neighborhood} with views over {landmark}.',
      'Perfectly positioned in {neighborhood}, a short stroll from {landmark}.',
      'Nestled in prestigious {neighborhood}, steps from {landmark}.',
      'Prime {neighborhood} location offering easy access to {landmark}.',
    ],
    rooms: [
      'Spacious, beautifully appointed rooms with luxurious marble bathrooms.',
      'Stunning suites with floor-to-ceiling windows and premium linens.',
      'Elegantly furnished rooms blending classic design with modern comforts.',
      'Impeccably designed rooms featuring bespoke furniture and rainfall showers.',
      'Lavish accommodation with handcrafted interiors and Egyptian cotton bedding.',
    ],
    service: [
      'Impeccable service from a highly attentive and discreet team.',
      'The concierge staff went above and beyond every expectation.',
      'World-class service with personalised touches at every turn.',
      'Butler-style service ensures every detail is taken care of.',
      'Warm yet professional staff who remember your name and preferences.',
    ],
    vibe: [
      'An oasis of calm and sophistication in the heart of London.',
      'Timeless elegance meets contemporary luxury.',
      'A refined sanctuary perfect for discerning travellers.',
      'The epitome of British luxury hospitality.',
      'Understated glamour with an unmistakable sense of occasion.',
    ],
    amenities: [
      'The award-winning spa and Michelin-starred restaurant are highlights.',
      'An exquisite rooftop terrace and world-class fitness centre.',
      'Excellent on-site dining, afternoon tea, and a stunning pool.',
      'A state-of-the-art spa, private cinema, and exceptional breakfast.',
      'Fine dining, a champagne bar, and beautifully landscaped courtyard.',
    ],
  },
  4: {
    location: [
      'Great location in {neighborhood}, within walking distance of {landmark}.',
      'Well situated in {neighborhood}, close to {landmark} and local restaurants.',
      'Conveniently located in {neighborhood}, easy access to {landmark}.',
      'Excellent {neighborhood} base with {landmark} nearby.',
      'A smart choice in {neighborhood}, just a few minutes from {landmark}.',
    ],
    rooms: [
      'Well-appointed rooms with comfortable beds and modern amenities.',
      'Stylish rooms with good-quality furnishings and city views.',
      'Spacious accommodation with crisp linens and a well-stocked minibar.',
      'Contemporary rooms with ample workspace and quality bathrooms.',
      'Clean and comfortable rooms with a pleasant modern decor.',
    ],
    service: [
      'Friendly and professional staff who make you feel welcome.',
      'Attentive reception and helpful concierge service throughout.',
      'Efficient service with a personal touch from the team.',
      'Staff are polished and responsive to any request.',
      'Excellent housekeeping and prompt room service.',
    ],
    vibe: [
      'A stylish retreat with a relaxed yet sophisticated atmosphere.',
      'Modern and inviting, perfect for both business and leisure.',
      'A chic urban hotel with character and charm.',
      'Feels like a boutique hotel with the amenities of a larger property.',
      'Contemporary and comfortable with a welcoming lobby lounge.',
    ],
    amenities: [
      'Good restaurant on-site, well-equipped gym, and reliable room service.',
      'A pleasant bar, meeting rooms, and complimentary afternoon biscuits.',
      'Modern fitness centre, on-site restaurant, and business facilities.',
      'Excellent breakfast spread and a cosy cocktail bar.',
      'Good dining options and a peaceful reading room.',
    ],
  },
  3: {
    location: [
      'Decent location in {neighborhood}, not far from {landmark}.',
      'Good base in {neighborhood} for exploring London, near {landmark}.',
      'Practical location in {neighborhood} with {landmark} accessible.',
      'Handy spot in {neighborhood}, about a 10-minute walk to {landmark}.',
      'Well-connected {neighborhood} location with {landmark} close by.',
    ],
    rooms: [
      'Rooms are clean and functional with everything you need.',
      'Compact but well-maintained rooms with comfortable beds.',
      'Standard rooms that are clean, warm, and adequately furnished.',
      'Decent-sized rooms with recently updated bathrooms.',
      'Rooms are on the smaller side but perfectly adequate for the price.',
    ],
    service: [
      'Friendly reception staff and reliable housekeeping.',
      'Staff are helpful and responsive when you need them.',
      'No-frills service but friendly and efficient.',
      'Check-in was smooth and staff gave good local recommendations.',
      'Good service overall, though it can be slow at peak times.',
    ],
    vibe: [
      'A solid mid-range option with no real surprises.',
      'Comfortable and unpretentious — a reliable choice.',
      'Nothing fancy but clean, safe, and well-run.',
      'A pleasant stay with a straightforward, no-fuss approach.',
      'Good value for money with a friendly atmosphere.',
    ],
    amenities: [
      'Free WiFi throughout and a reasonable breakfast option.',
      'Basic but functional amenities including a small lounge area.',
      'WiFi, 24-hour reception, and an on-site cafe.',
      'Continental breakfast available and a helpful tour desk.',
      'All the essentials are covered plus a pleasant breakfast room.',
    ],
  },
  2: {
    location: [
      'Located in {neighborhood}, a bit of a walk to {landmark} but well-connected by tube.',
      'In {neighborhood}, not the most central but good transport links to {landmark}.',
      'Quiet spot in {neighborhood}, you can reach {landmark} by bus in 15 minutes.',
      'The {neighborhood} location is off the beaten path but affordable for London.',
      'Based in {neighborhood} with easy tube access to central London and {landmark}.',
    ],
    rooms: [
      'Rooms are basic but clean — you get what you pay for.',
      'Small rooms but the beds are comfortable and everything works.',
      'No-frills rooms that are clean and reasonably quiet.',
      'Compact accommodation, but fine for sleeping after a day of sightseeing.',
      'Rooms could use updating but they are clean and functional.',
    ],
    service: [
      'Staff at reception are friendly though service is minimal.',
      'Basic service but the staff are pleasant enough.',
      'Check-in was straightforward, staff gave a helpful area map.',
      'Minimal services but the team is friendly and accommodating.',
      'Reception is staffed 24/7 which is reassuring.',
    ],
    vibe: [
      'A budget-friendly base for exploring London on a shoestring.',
      'No frills, but does the job for a short London stay.',
      'Perfectly acceptable budget accommodation.',
      'Simple and clean — ideal if you just need a place to sleep.',
      'A practical choice for budget-conscious travellers.',
    ],
    amenities: [
      'Free WiFi and 24-hour reception, not much else.',
      'Basic continental breakfast available for a small extra charge.',
      'WiFi included, shared kitchen available on the ground floor.',
      'Essentials only — WiFi, TV, and a kettle in the room.',
      'Limited amenities but WiFi is reliable and rooms have tea facilities.',
    ],
  },
  1: {
    location: [
      'In {neighborhood}, not central but cheap. {landmark} is reachable by tube.',
      'Budget-friendly location in {neighborhood}, a tube ride from {landmark}.',
      'A no-frills spot in {neighborhood}. Not glamorous but you can get to {landmark}.',
      '{neighborhood} location — basic area but well-connected to the rest of London.',
      'Out in {neighborhood}, but for this price you cannot complain. Near enough to {landmark}.',
    ],
    rooms: [
      'Very basic rooms — clean enough but showing their age.',
      'Small and sparse, but the sheets are clean and the shower works.',
      'Dorm-style accommodation, not for everyone but it serves its purpose.',
      'Rooms are bare-bones but acceptable for a night or two.',
      'Compact and simple. Bring earplugs — walls are thin.',
    ],
    service: [
      'Minimal staff presence but reception is open around the clock.',
      'Self-service feel — no concierge, just a helpful person at the desk.',
      'Staff are friendly but services are very limited.',
      'Basic reception service, check-in and check-out, that is about it.',
      'Do not expect room service, but the front desk team are nice.',
    ],
    vibe: [
      'A place to crash after long days sightseeing on a tight budget.',
      'Barebones but functional — backpacker territory.',
      'The cheapest option in the area, and you can tell, but it works.',
      'No atmosphere to speak of, but at this price point that is expected.',
      'Purely functional — a bed and a roof in London.',
    ],
    amenities: [
      'WiFi is patchy. Shared bathrooms on some floors.',
      'Free WiFi (when it works) and a vending machine.',
      'Communal kitchen, shared bathrooms, and a luggage storage area.',
      'Very limited — just WiFi and a reception desk.',
      'Basic WiFi and a small breakfast for an extra charge.',
    ],
  },
};

// ─── Amenities ───────────────────────────────────────────────────────────────

const AMENITIES_BY_MIN_STARS: [number, string[]][] = [
  [1, ['WiFi', '24-hour reception']],
  [3, ['Restaurant', 'Room service', 'Concierge', 'Luggage storage', 'Air conditioning']],
  [4, ['Fitness centre', 'Bar', 'Business centre', 'Laundry service', 'Meeting rooms']],
  [5, ['Spa', 'Pool', 'Valet parking', 'Rooftop bar', 'Michelin restaurant', 'Afternoon tea', 'Private dining']],
];

function generateAmenities(starRating: number): string[] {
  const amenities: string[] = [];
  for (const [minStars, options] of AMENITIES_BY_MIN_STARS) {
    if (starRating >= minStars) {
      if (minStars === 1) {
        // Always include base amenities (WiFi, 24-hour reception)
        amenities.push(...options);
      } else {
        // Higher-tier amenities: always include some, randomly exclude others for variety
        for (const opt of options) {
          if (starRating >= minStars + 1 || random() > 0.3) {
            amenities.push(opt);
          }
        }
      }
    }
  }
  return amenities;
}

// ─── Star Rating Distribution ────────────────────────────────────────────────

function assignStarRating(neighborhood: NeighborhoodInfo): number {
  const r = random();
  const lw = neighborhood.luxuryWeight;

  // Weighted distribution shifted by neighborhood luxury weight
  if (r < 0.07 * (1 - lw * 0.5)) return 1;
  if (r < 0.07 + 0.20 * (1 - lw * 0.4)) return 2;
  if (r < 0.07 + 0.20 + 0.40) return 3;
  if (r < 0.07 + 0.20 + 0.40 + 0.25 * (1 + lw * 0.3)) return 4;
  return 5;
}

// ─── Base Rate Generation ────────────────────────────────────────────────────

const BASE_RATE_RANGES: Record<number, [number, number]> = {
  1: [30, 70],
  2: [50, 110],
  3: [80, 180],
  4: [140, 300],
  5: [280, 600],
};

export function generateBaseRate(starRating: number, priceMultiplier: number): number {
  const [min, max] = BASE_RATE_RANGES[starRating];
  const base = min + random() * (max - min);
  const adjusted = base * priceMultiplier;
  // Clamp to reasonable bounds for the star rating
  const clampedMin = BASE_RATE_RANGES[starRating][0] * 0.8;
  const clampedMax = BASE_RATE_RANGES[starRating][1] * 1.3;
  return Math.round(Math.min(Math.max(adjusted, clampedMin), clampedMax));
}

// ─── Hotel Name Generation ───────────────────────────────────────────────────

function generateHotelName(starRating: number, neighborhood: string): string {
  const pattern = randomInt(1, 5);

  if (starRating >= 5) {
    switch (pattern) {
      case 1: return `${pick(LUXURY_PREFIXES)} ${neighborhood}`;
      case 2: return `${pick(UPSCALE_NAMES)} ${pick(LUXURY_SUFFIXES)}`;
      case 3: return `The ${pick(ADJECTIVES_LUXURY)} ${neighborhood}`;
      case 4: return `${pick(UPSCALE_NAMES)} Hotel ${neighborhood}`;
      default: return `${pick(UPSCALE_NAMES)} ${pick(HOTEL_TYPES_LUXURY)}`;
    }
  } else if (starRating >= 4) {
    switch (pattern) {
      case 1: return `The ${pick(ADJECTIVES_MID)} ${neighborhood}`;
      case 2: return `${pick(UPSCALE_NAMES)} Hotel ${neighborhood}`;
      case 3: return `${pick(UPSCALE_NAMES)} ${pick(HOTEL_TYPES_MID)}`;
      case 4: return `The ${pick(ADJECTIVES_LUXURY)} ${pick(HOTEL_TYPES_MID)}`;
      default: return `${pick(MID_NAMES)} ${pick(HOTEL_TYPES_MID)} ${neighborhood}`;
    }
  } else if (starRating >= 3) {
    switch (pattern) {
      case 1: return `${pick(MID_NAMES)} Hotel ${neighborhood}`;
      case 2: return `The ${pick(ADJECTIVES_MID)} ${pick(HOTEL_TYPES_MID)}`;
      case 3: return `${pick(MID_NAMES)} ${pick(HOTEL_TYPES_MID)}`;
      case 4: return `${pick(MID_NAMES)} ${neighborhood}`;
      default: return `${pick(ADJECTIVES_MID)} ${pick(HOTEL_TYPES_MID)} ${neighborhood}`;
    }
  } else if (starRating >= 2) {
    switch (pattern) {
      case 1: return `${pick(BUDGET_NAMES)} ${neighborhood}`;
      case 2: return `${pick(MID_NAMES)} ${pick(HOTEL_TYPES_BUDGET)} ${neighborhood}`;
      case 3: return `${pick(BUDGET_NAMES)} ${pick(HOTEL_TYPES_BUDGET)}`;
      case 4: return `The ${pick(ADJECTIVES_BUDGET)} ${pick(HOTEL_TYPES_BUDGET)}`;
      default: return `${pick(MID_NAMES)} ${pick(HOTEL_TYPES_BUDGET)} ${neighborhood}`;
    }
  } else {
    switch (pattern) {
      case 1: return `${pick(BUDGET_NAMES)} ${neighborhood}`;
      case 2: return `${pick(BUDGET_NAMES)} ${pick(HOTEL_TYPES_BUDGET)}`;
      case 3: return `${pick(ADJECTIVES_BUDGET)} ${pick(HOTEL_TYPES_BUDGET)} ${neighborhood}`;
      case 4: return `The ${pick(ADJECTIVES_BUDGET)} ${pick(HOTEL_TYPES_BUDGET)}`;
      default: return `${pick(BUDGET_NAMES)} Stay ${neighborhood}`;
    }
  }
}

// ─── Review Summary Generation ───────────────────────────────────────────────

function generateReviewSummary(starRating: number, neighborhood: NeighborhoodInfo): string {
  const templates = REVIEW_TEMPLATES[starRating];
  const landmarks = LANDMARKS_BY_AREA[neighborhood.area] || LANDMARKS_BY_AREA['central'];

  const locationTemplate = pick(templates.location);
  const location = locationTemplate
    .replace('{neighborhood}', neighborhood.name)
    .replace('{landmark}', pick(landmarks));

  const parts = [
    location,
    pick(templates.rooms),
    pick(templates.service),
  ];

  // Add vibe or amenities (3-5 sentences total)
  if (random() > 0.4) {
    parts.push(pick(templates.vibe));
  }
  if (random() > 0.3) {
    parts.push(pick(templates.amenities));
  }

  // Ensure 3-5 sentences
  while (parts.length < 3) {
    parts.push(pick(templates.vibe));
  }

  return parts.join(' ');
}

// ─── Pricing Factors Generation ──────────────────────────────────────────────

export function generateDemandCurve(starRating: number, area: string): number[] {
  // Business hotels (City, Canary Wharf) have higher weekday, lower weekend
  const isBusinessArea = area === 'city' || area === 'east';
  const isLuxury = starRating >= 4;

  const curve: number[] = [];
  for (let day = 0; day < 7; day++) {
    const isWeekend = day >= 5; // Sat=5, Sun=6
    let value: number;

    if (isBusinessArea && isLuxury) {
      // Business hotels: weekday high, weekend low
      value = isWeekend
        ? randomFloat(0.85, 0.95)
        : randomFloat(1.00, 1.15);
    } else {
      // Leisure hotels: weekday low, weekend high
      value = isWeekend
        ? randomFloat(1.00, 1.15)
        : randomFloat(0.85, 1.00);
    }
    curve.push(value);
  }
  return curve;
}

export function generateSeasonality(): number[] {
  // London tourism calendar
  const baseSeason = [0.85, 0.85, 0.90, 0.95, 1.00, 1.20, 1.30, 1.35, 1.20, 1.00, 0.85, 1.10];
  return baseSeason.map(base => {
    const variation = randomFloat(-0.05, 0.05);
    return parseFloat(Math.min(Math.max(base + variation, 0.80), 1.40).toFixed(2));
  });
}

export function generateOccupancyBase(starRating: number, priceMultiplier: number): number {
  // Luxury central: 75-90, budget outer: 40-65
  const starFactor = (starRating - 1) / 4; // 0-1
  const locationFactor = (priceMultiplier - 0.7) / 0.7; // ~0-1
  const base = 40 + starFactor * 25 + locationFactor * 15;
  const variation = randomFloat(-5, 5);
  return Math.round(Math.min(Math.max(base + variation, 30), 95));
}

export function generatePricingFactors(starRating: number, neighborhood: NeighborhoodInfo): PricingFactors {
  return {
    demand_curve: generateDemandCurve(starRating, neighborhood.area),
    seasonality: generateSeasonality(),
    occupancy_base: generateOccupancyBase(starRating, neighborhood.priceMultiplier),
  };
}

// ─── Coordinate Jitter ───────────────────────────────────────────────────────

function jitterCoord(base: number, range: number = 0.008): number {
  return parseFloat((base + (random() - 0.5) * range * 2).toFixed(6));
}

// ─── Main Generator ──────────────────────────────────────────────────────────

export interface GeneratedHotel extends Omit<Hotel, 'id' | 'created_at'> {}

export function generateHotels(count: number = 1050, seed: number = 42): GeneratedHotel[] {
  // Reset PRNG for reproducibility
  rng = mulberry32(seed);

  const hotels: GeneratedHotel[] = [];
  const usedKeys = new Set<string>();

  // Calculate hotels per neighborhood proportional to luxury weight
  // but ensure every neighborhood gets some hotels
  const totalWeight = NEIGHBORHOODS.reduce((sum, n) => sum + 0.5 + n.luxuryWeight, 0);

  let remaining = count;
  const neighborhoodCounts: Map<string, number> = new Map();

  for (const n of NEIGHBORHOODS) {
    const weight = 0.5 + n.luxuryWeight;
    const allocated = Math.max(8, Math.round((weight / totalWeight) * count));
    neighborhoodCounts.set(n.name, allocated);
    remaining -= allocated;
  }

  // Distribute remaining to popular areas
  const popularNeighborhoods = NEIGHBORHOODS
    .filter(n => n.luxuryWeight > 0.5)
    .map(n => n.name);

  while (remaining > 0) {
    const name = pick(popularNeighborhoods);
    neighborhoodCounts.set(name, (neighborhoodCounts.get(name) || 0) + 1);
    remaining--;
  }

  // Handle negative remaining by trimming from smaller neighborhoods
  while (remaining < 0) {
    const sortedNeighborhoods = Array.from(neighborhoodCounts.entries())
      .sort((a, b) => b[1] - a[1]);
    const [topName, topCount] = sortedNeighborhoods[0];
    if (topCount > 8) {
      neighborhoodCounts.set(topName, topCount - 1);
      remaining++;
    } else {
      break;
    }
  }

  for (const neighborhood of NEIGHBORHOODS) {
    const targetCount = neighborhoodCounts.get(neighborhood.name) || 8;
    let generated = 0;
    let attempts = 0;

    while (generated < targetCount && attempts < targetCount * 5) {
      attempts++;

      const starRating = assignStarRating(neighborhood);
      const name = generateHotelName(starRating, neighborhood.name);
      const key = `${name}|${neighborhood.name}`;

      if (usedKeys.has(key)) continue;
      usedKeys.add(key);

      const baseRate = generateBaseRate(starRating, neighborhood.priceMultiplier);
      const reviewSummary = generateReviewSummary(starRating, neighborhood);
      const amenities = generateAmenities(starRating);
      const pricingFactors = generatePricingFactors(starRating, neighborhood);

      hotels.push({
        name,
        neighborhood: neighborhood.name,
        lat: jitterCoord(neighborhood.lat),
        lng: jitterCoord(neighborhood.lng),
        star_rating: starRating,
        base_rate_gbp: baseRate,
        review_summary: reviewSummary,
        amenities,
        pricing_factors: pricingFactors,
        pinecone_id: crypto.randomUUID(),
      });

      generated++;
    }
  }

  return hotels;
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  const fs = await import('fs');
  const path = await import('path');

  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  console.log('Generating hotel data...');
  const hotels = generateHotels(1050);
  console.log(`Generated ${hotels.length} hotels`);

  // Star rating distribution
  const starDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const h of hotels) {
    starDist[h.star_rating]++;
  }
  console.log('Star rating distribution:');
  for (const [star, count] of Object.entries(starDist)) {
    console.log(`  ${star}-star: ${count} (${((count / hotels.length) * 100).toFixed(1)}%)`);
  }

  // Neighborhood distribution
  const neighborhoodDist: Record<string, number> = {};
  for (const h of hotels) {
    neighborhoodDist[h.neighborhood] = (neighborhoodDist[h.neighborhood] || 0) + 1;
  }
  console.log(`\nNeighborhoods: ${Object.keys(neighborhoodDist).length}`);

  const outputPath = path.join(dataDir, 'hotels.json');
  fs.writeFileSync(outputPath, JSON.stringify(hotels, null, 2));
  console.log(`\nSaved to ${outputPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}

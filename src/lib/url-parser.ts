import type { ParsedUrl } from '@/types';

/**
 * Pure client-side URL parsing.
 * Extracts hotel name, OTA source, and optional check-in date from a pasted URL.
 * No network calls. Wrapped in try/catch — invalid URLs return hotelName: null.
 */

function titleCase(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function slugToName(slug: string): string {
  // Strip locale suffix like .en-gb or .fr before processing
  const withoutLocale = slug.replace(/\.[a-z]{2}(-[a-z]{2,4})?$/, '');
  // Strip .html extension if present
  const withoutHtml = withoutLocale.replace(/\.html?$/, '');
  // Replace hyphens with spaces and title-case
  return titleCase(withoutHtml.replace(/-/g, ' '));
}

const CHECK_IN_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function parseHotelUrl(url: string): ParsedUrl {
  if (!url) {
    return { hotelName: null, source: 'unknown', originalUrl: url };
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;

    // --- Booking.com ---
    if (hostname.includes('booking.com')) {
      const match = pathname.match(/\/hotel\/[a-z]{2}\/([^/.]+)/);
      if (match) {
        const hotelName = slugToName(match[1]);

        // Extract check-in date only for Booking.com
        let checkInDate: string | undefined;
        const checkinParam = parsed.searchParams.get('checkin');
        if (checkinParam && CHECK_IN_DATE_REGEX.test(checkinParam)) {
          checkInDate = checkinParam;
        }

        return {
          hotelName,
          source: 'booking',
          originalUrl: url,
          ...(checkInDate !== undefined ? { checkInDate } : {}),
        };
      }
      return { hotelName: null, source: 'booking', originalUrl: url };
    }

    // --- Hotels.com ---
    if (hostname.includes('hotels.com')) {
      const match = pathname.match(/\/ho\d+\/([^/]+)/);
      if (match) {
        const hotelName = slugToName(match[1]);
        return { hotelName, source: 'hotels', originalUrl: url };
      }
      return { hotelName: null, source: 'hotels', originalUrl: url };
    }

    // --- Expedia ---
    if (hostname.includes('expedia.')) {
      const match = pathname.match(/Hotels?-(.+?)\.h\d+/);
      if (match) {
        const hotelName = slugToName(match[1]);
        return { hotelName, source: 'expedia', originalUrl: url };
      }
      return { hotelName: null, source: 'expedia', originalUrl: url };
    }

    // --- Generic fallback ---
    // Pick the longest meaningful path segment (length > 3)
    const segments = pathname
      .split('/')
      .filter((seg) => seg.length > 3)
      .sort((a, b) => b.length - a.length);

    if (segments.length > 0) {
      const hotelName = slugToName(segments[0]);
      return { hotelName, source: 'generic', originalUrl: url };
    }

    return { hotelName: null, source: 'generic', originalUrl: url };
  } catch {
    return { hotelName: null, source: 'unknown', originalUrl: url };
  }
}

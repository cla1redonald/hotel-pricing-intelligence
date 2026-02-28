const requestLog = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute

export function rateLimit(
  ip: string,
  maxRequests: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || 'unknown';

  const timestamps = requestLog.get(key) ?? [];
  const windowStart = now - WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= maxRequests) {
    requestLog.set(key, recent);
    return { allowed: false, remaining: 0 };
  }

  recent.push(now);
  requestLog.set(key, recent);
  return { allowed: true, remaining: maxRequests - recent.length };
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

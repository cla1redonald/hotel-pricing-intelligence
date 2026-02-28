/**
 * Pinecone warming utility.
 *
 * Pinecone's free-tier serverless index goes cold after inactivity, causing
 * a 5-10 second delay on the first query. This module fires a lightweight
 * dummy search on page load so that the index is warm by the time the user
 * submits a real query.
 *
 * The ping is intentionally fire-and-forget — it must never block rendering
 * or throw a visible error.
 */
export async function warmPinecone(): Promise<void> {
  try {
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'warm' }),
    });
  } catch {
    // Silently ignore — warming is best-effort
  }
}

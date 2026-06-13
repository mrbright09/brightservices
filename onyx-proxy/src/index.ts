/**
 * BFT Onyx Voice Agent — Cloudflare Worker API Proxy
 *
 * Responsibilities:
 *   - Keeps the Anthropic API key server-side (never exposed to the browser)
 *   - Rate limits requests to 25 per IP per hour using Workers KV
 *   - Proxies requests to the Anthropic Messages API
 *   - Returns clean, user-readable error messages on failure
 *   - Enforces CORS so only your domains can call this Worker
 */

import Anthropic from "@anthropic-ai/sdk";

interface Env {
  /** KV namespace for storing per-IP rate limit counters */
  BFT_RATE_LIMIT: KVNamespace;
  /** Anthropic API key — set via: wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY: string;
}

// ---------- Configuration ----------
const RATE_LIMIT_MAX = 25;          // max requests per window
const RATE_LIMIT_WINDOW_SEC = 3600; // 1 hour in seconds
const MODEL = "claude-sonnet-4-6";  // always use current model

// Domains allowed to call this Worker. Add your live domain here.
const ALLOWED_ORIGINS = [
  "https://brightfuturetechllc.com",
  "https://www.brightfuturetechllc.com",
  "http://localhost:3000",
  "http://127.0.0.1:5500", // Live Server dev
];

// ---------- CORS Helpers ----------
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function corsResponse(body: string, status: number, origin: string | null, extra?: Record<string, string>): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin),
      ...extra,
    },
  });
}

// ---------- Rate Limiter ----------
/**
 * Checks and increments the request count for a given IP.
 * KV key format: "rate:<ip>" — value is JSON { count, resetAt }
 * Returns { allowed: boolean, remaining: number, resetAt: number }
 */
async function checkRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `rate:${ip}`;
  const now = Math.floor(Date.now() / 1000);

  type RateLimitRecord = { count: number; resetAt: number };
  const raw = await kv.get(key);
  let record: RateLimitRecord;

  if (raw) {
    record = JSON.parse(raw) as RateLimitRecord;
    // If the window has expired, reset the counter
    if (now >= record.resetAt) {
      record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_SEC };
    }
  } else {
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_SEC };
  }

  record.count += 1;

  // Write back with TTL so KV auto-cleans expired keys
  await kv.put(key, JSON.stringify(record), { expirationTtl: RATE_LIMIT_WINDOW_SEC });

  const remaining = Math.max(0, RATE_LIMIT_MAX - record.count);
  return {
    allowed: record.count <= RATE_LIMIT_MAX,
    remaining,
    resetAt: record.resetAt,
  };
}

// ---------- Main Handler ----------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
    }

    // Only allow POST to /v1/messages
    if (request.method !== "POST") {
      return corsResponse(JSON.stringify({ error: "Method not allowed." }), 405, origin);
    }

    // Get client IP for rate limiting
    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown";

    // Check rate limit
    const { allowed, remaining, resetAt } = await checkRateLimit(env.BFT_RATE_LIMIT, ip);

    if (!allowed) {
      const resetIn = Math.ceil(resetAt - Date.now() / 1000);
      return corsResponse(
        JSON.stringify({
          error: `Demo rate limit reached. You've used all ${RATE_LIMIT_MAX} requests for this hour. Resets in ${Math.ceil(resetIn / 60)} minutes.`,
          reset_in_seconds: resetIn,
        }),
        429,
        origin,
        {
          "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(resetAt),
        }
      );
    }

    // Parse and validate request body
    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON in request body." }), 400, origin);
    }

    // Force correct model — never trust client-supplied model string
    body.model = MODEL;

    // Enforce max_tokens ceiling so clients can't abuse it
    if (!body.max_tokens || Number(body.max_tokens) > 1000) {
      body.max_tokens = 1000;
    }

    // Proxy to Anthropic
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

      const response = await client.messages.create(body as Parameters<typeof client.messages.create>[0]);

      return corsResponse(JSON.stringify(response), 200, origin, {
        "X-RateLimit-Limit": String(RATE_LIMIT_MAX),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(resetAt),
      });
    } catch (err: unknown) {
      console.error("Anthropic API error:", err);

      // Surface Anthropic error messages cleanly without leaking internals
      if (err instanceof Anthropic.APIError) {
        const status = err.status || 500;
        const message =
          status === 401
            ? "API authentication error. Please contact BFT support."
            : status === 429
            ? "Anthropic rate limit reached. Please try again shortly."
            : status >= 500
            ? "The AI service is temporarily unavailable. Please try again."
            : err.message;

        return corsResponse(JSON.stringify({ error: message }), status, origin);
      }

      return corsResponse(
        JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
        500,
        origin
      );
    }
  },
} satisfies ExportedHandler<Env>;

import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/register/route";

// Because Supabase admin is NOT configured (mock mode), the route short
// circuits with a 503 for real registration. We still use it to verify
// validation, rate limiting, and JSON parsing.

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readJson(res: Response): Promise<{ error?: string; ok?: boolean }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

describe("POST /api/auth/register", () => {
  // The rate limiter is a module-level Map — we use unique IPs per test
  // to keep counts independent, since Vitest shares the module across cases.
  let ipCounter = 0;
  const freshIp = () => `10.0.0.${++ipCounter}`;

  beforeEach(() => {
    // Nothing to reset; each test uses a distinct IP.
  });

  // ===========================================================================
  // JSON parsing
  // ===========================================================================
  describe("body parsing", () => {
    it("returns 400 on invalid JSON body", async () => {
      const req = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": freshIp() },
        body: "not-json-at-all{",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.error).toMatch(/json/i);
    });
  });

  // ===========================================================================
  // Field validation
  // ===========================================================================
  describe("validation", () => {
    it("rejects missing email", async () => {
      const res = await POST(
        makeRequest(
          { password: "password123", full_name: "A B" },
          { "x-forwarded-for": freshIp() }
        )
      );
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toMatch(/email/i);
    });

    it("rejects malformed email", async () => {
      const res = await POST(
        makeRequest(
          { email: "not-an-email", password: "password123", full_name: "A B" },
          { "x-forwarded-for": freshIp() }
        )
      );
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toMatch(/email/i);
    });

    it("rejects short password (< 8 chars)", async () => {
      const res = await POST(
        makeRequest(
          { email: "a@b.test", password: "abc", full_name: "A B" },
          { "x-forwarded-for": freshIp() }
        )
      );
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toMatch(/password/i);
    });

    it("rejects empty full_name", async () => {
      const res = await POST(
        makeRequest(
          { email: "a@b.test", password: "password123", full_name: "  " },
          { "x-forwarded-for": freshIp() }
        )
      );
      expect(res.status).toBe(400);
      expect((await readJson(res)).error).toMatch(/name/i);
    });

    it("returns 503 when validated but Supabase admin is not configured", async () => {
      const res = await POST(
        makeRequest(
          {
            email: "ok@tigress.test",
            password: "password123",
            full_name: "Valid Name",
          },
          { "x-forwarded-for": freshIp() }
        )
      );
      expect(res.status).toBe(503);
      expect((await readJson(res)).error).toMatch(/supabase/i);
    });
  });

  // ===========================================================================
  // Rate limiting (Fix 14) — 5 requests per 15 minutes per IP
  // ===========================================================================
  describe("rate limiting", () => {
    it("allows up to 5 requests per IP then blocks the 6th with 429", async () => {
      const ip = freshIp();
      // 5 requests that pass validation / hit the 503 branch consume 5 slots.
      for (let i = 0; i < 5; i++) {
        const res = await POST(
          makeRequest(
            {
              email: `ok${i}@tigress.test`,
              password: "password123",
              full_name: "Valid Name",
            },
            { "x-forwarded-for": ip }
          )
        );
        expect(res.status).not.toBe(429);
      }

      const blocked = await POST(
        makeRequest(
          {
            email: "ok-final@tigress.test",
            password: "password123",
            full_name: "Valid Name",
          },
          { "x-forwarded-for": ip }
        )
      );
      expect(blocked.status).toBe(429);
      expect((await readJson(blocked)).error).toMatch(/too many/i);
    });

    it("tracks limits per IP independently", async () => {
      const a = freshIp();
      const b = freshIp();
      for (let i = 0; i < 5; i++) {
        await POST(
          makeRequest(
            {
              email: `a${i}@tigress.test`,
              password: "password123",
              full_name: "A",
            },
            { "x-forwarded-for": a }
          )
        );
      }
      const blockedA = await POST(
        makeRequest(
          { email: "a-blocked@tigress.test", password: "password123", full_name: "A" },
          { "x-forwarded-for": a }
        )
      );
      expect(blockedA.status).toBe(429);

      // IP b is still fresh.
      const okB = await POST(
        makeRequest(
          { email: "b@tigress.test", password: "password123", full_name: "B" },
          { "x-forwarded-for": b }
        )
      );
      expect(okB.status).not.toBe(429);
    });

    it("uses the first IP in a comma-separated x-forwarded-for header", async () => {
      const ip = freshIp();
      // Each call should land on the same bucket since the first IP is shared.
      const chain = `${ip}, 10.99.0.1, 10.99.0.2`;
      for (let i = 0; i < 5; i++) {
        await POST(
          makeRequest(
            { email: `c${i}@tigress.test`, password: "password123", full_name: "C" },
            { "x-forwarded-for": chain }
          )
        );
      }
      const blocked = await POST(
        makeRequest(
          { email: "c-blocked@tigress.test", password: "password123", full_name: "C" },
          { "x-forwarded-for": chain }
        )
      );
      expect(blocked.status).toBe(429);
    });
  });
});

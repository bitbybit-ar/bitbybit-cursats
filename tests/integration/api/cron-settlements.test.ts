// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { testDb, cleanDb } from "../setup";
import { GET } from "@/app/api/cron/wapu-settlements/route";

// The settlement cron triggers real ARS payouts, so its only guard is a
// CRON_SECRET bearer token. Without that gate the endpoint would be an
// open "move money" trigger. These tests pin the gate: refuse unless the
// secret is configured AND the bearer matches.

const CRON_URL = "https://cursats.bitbybit.com.ar/api/cron/wapu-settlements";
const ORIGINAL_SECRET = process.env.CRON_SECRET;

function request(authorization?: string): NextRequest {
  return new NextRequest(CRON_URL, {
    headers: authorization ? { authorization } : {},
  });
}

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'orders'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'orders' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL_SECRET;
});

describe("GET /api/cron/wapu-settlements — CRON_SECRET gate", () => {
  it("401s when CRON_SECRET is not configured, even with a bearer", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(request("Bearer anything"));
    expect(res.status).toBe(401);
  });

  it("401s when the Authorization header is missing", async () => {
    process.env.CRON_SECRET = "right-secret";
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  it("401s when the bearer token does not match", async () => {
    process.env.CRON_SECRET = "right-secret";
    const res = await GET(request("Bearer wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("runs the sweep when the bearer matches", async () => {
    process.env.CRON_SECRET = "right-secret";
    const res = await GET(request("Bearer right-secret"));
    expect(res.status).toBe(200);
    // No orders seeded, so every pass reports zero — proof the handler
    // ran the sweep rather than short-circuiting on auth.
    const body = await res.json();
    expect(body).toMatchObject({
      polled_deposits: 0,
      retried_withdrawals: 0,
      polled_payouts: 0,
    });
  });
});

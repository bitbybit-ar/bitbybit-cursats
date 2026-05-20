// @vitest-environment node
import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { sql, eq } from "drizzle-orm";
import { testDb, cleanDb, seedUser } from "../setup";
import { offerings, orders } from "@/lib/db/schema";
import { createOrder } from "@/lib/orders";
import { GET } from "@/app/api/downloads/[orderId]/route";

const DOWNLOAD_BASE = "https://cursats.test/api/downloads";

beforeAll(async () => {
  const { rows } = await testDb.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'offerings'
    ) AS "exists"
  `);
  if (!rows[0]?.exists) {
    throw new Error(
      "Test database is missing the 'offerings' table. Run `npm run test:db:migrate` first."
    );
  }
});

beforeEach(async () => {
  await cleanDb();
});

async function seedDownloadOffering(downloadUrl: string | null) {
  const user = await seedUser({
    pubkey: `${Date.now().toString(16).padStart(64, "0")}`.slice(0, 64),
    slug: `dl-${Date.now().toString(36)}`,
  });
  const [row] = await testDb
    .insert(offerings)
    .values({
      user_id: user.id,
      slug: `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "download",
      title: "PDF",
      description: "A download.",
      price_amount: 500,
      price_currency: "ars" as const,
      download_url: downloadUrl,
    })
    .returning();
  return row;
}

async function seedCodeOffering() {
  const user = await seedUser({
    pubkey: `c${Date.now().toString(16).padStart(63, "0")}`.slice(0, 64),
    slug: `code-${Date.now().toString(36)}`,
  });
  const [row] = await testDb
    .insert(offerings)
    .values({
      user_id: user.id,
      slug: `code-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: "code",
      title: "Code",
      description: "A code offering.",
      price_amount: 500,
      price_currency: "ars" as const,
      code_pool: ["X"],
    })
    .returning();
  return row;
}

async function markPaid(orderId: string) {
  await testDb
    .update(orders)
    .set({ status: "paid", paid_at: new Date() })
    .where(eq(orders.id, orderId));
}

function buildRequest(orderId: string): {
  req: NextRequest;
  ctx: { params: Promise<{ orderId: string }> };
} {
  return {
    req: new NextRequest(`${DOWNLOAD_BASE}/${orderId}`),
    ctx: { params: Promise.resolve({ orderId }) },
  };
}

describe("GET /api/downloads/[orderId]", () => {
  it("redirects to the download URL for a paid download order", async () => {
    const offering = await seedDownloadOffering(
      "https://example.com/asset.pdf"
    );
    const { order_id } = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    await markPaid(order_id);

    const { req, ctx } = buildRequest(order_id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/asset.pdf");
  });

  it("returns 403 when the order is still pending", async () => {
    const offering = await seedDownloadOffering(
      "https://example.com/asset.pdf"
    );
    const { order_id } = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    // Do NOT mark paid.

    const { req, ctx } = buildRequest(order_id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_paid");
  });

  it("returns 404 for an unknown order id", async () => {
    const { req, ctx } = buildRequest("00000000-0000-0000-0000-000000000000");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a non-uuid order id", async () => {
    const { req, ctx } = buildRequest("not-a-uuid");
    const res = await GET(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 for a paid order whose offering is type=code", async () => {
    const offering = await seedCodeOffering();
    const { order_id } = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    await markPaid(order_id);

    const { req, ctx } = buildRequest(order_id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a paid order whose offering is archived", async () => {
    const offering = await seedDownloadOffering(
      "https://example.com/asset.pdf"
    );
    const { order_id } = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    await markPaid(order_id);

    await testDb
      .update(offerings)
      .set({ archived_at: new Date() })
      .where(eq(offerings.id, offering.id));

    const { req, ctx } = buildRequest(order_id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the offering has no download_url on file", async () => {
    const offering = await seedDownloadOffering(null);
    const { order_id } = await createOrder({
      offering_id: offering.id,
      pubkey: null,
    });
    await markPaid(order_id);

    const { req, ctx } = buildRequest(order_id);
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });
});

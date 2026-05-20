import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { claimOrderForBuyer } from "@/lib/orders";

const ParamsSchema = z.object({ orderId: z.string().uuid() });

/**
 * Attach an anonymous order to the current buyer's pubkey. The
 * opaque `orderId` from the receipt URL is the access key — if the
 * buyer can name it, they own it (ADR 0007). The session pubkey
 * always wins; we never trust a pubkey from the body.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
): Promise<NextResponse> {
  const resolved = await params;
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_order_id" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await claimOrderForBuyer({
    order_id: parsed.data.orderId,
    pubkey: session.pubkey,
  });

  if (result.status === "not_found") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (result.status === "already_claimed") {
    return NextResponse.json({ error: "already_claimed" }, { status: 409 });
  }
  return NextResponse.json({
    status: result.status,
    order_id: result.order.id,
  });
}

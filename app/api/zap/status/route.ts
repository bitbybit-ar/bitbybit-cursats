import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// BOLT11 invoices on mainnet start with `lnbc`; testnet/regtest variants
// (`lntb`, `lnbcrt`) are accepted so dev wallets work too. The schema
// keeps junk payloads from reaching the (future) NWC lookup path.
const ZapStatusBodySchema = z.object({
  invoice: z
    .string()
    .min(1)
    .regex(/^ln(bc|tb|bcrt)/i, "invalid_invoice_format"),
});

// Polling endpoint paired with `lib/hooks/useZapPolling.ts`. The full
// arena flow looks the BOLT11 invoice up via NWC; cursats does not yet
// have that wired, so this route is a no-op that matches arena's
// no-NWC fallback (`{ paid: false }`). The modal still works end-to-end
// — buyers pay via WebLN or by scanning the QR; auto-detection turns on
// when NWC is configured. See ADR 0005 for the broader autorenewal /
// NWC posture in this project.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = ZapStatusBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  return NextResponse.json({ paid: false });
}

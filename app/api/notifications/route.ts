import { type NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listForPubkey, markAllRead, markRead } from "@/lib/notifications";
import {
  notificationDtoSchema,
  notificationPatchSchema,
  type NotificationDTO,
} from "@/lib/schemas/notifications";

export const dynamic = "force-dynamic";

function rowToDto(
  row: Awaited<ReturnType<typeof listForPubkey>>[number]
): NotificationDTO {
  // Best-effort parse: the DB column is varchar(40) and the helper
  // emits only the kinds in the enum, but a future kind landing
  // before its TypeScript update would surface here. We pass the
  // raw value through to the client; the bell falls back to the
  // raw kind as the title key when the i18n lookup misses.
  const parsed = notificationDtoSchema.safeParse({
    id: row.id,
    recipient_pubkey: row.recipient_pubkey,
    kind: row.kind,
    payload: row.payload,
    read_at: row.read_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  });
  if (parsed.success) return parsed.data;
  // Fallback shape with the raw kind — keeps unknown kinds visible
  // rather than swallowing them.
  return {
    id: row.id,
    recipient_pubkey: row.recipient_pubkey,
    kind: row.kind as NotificationDTO["kind"],
    payload: row.payload,
    read_at: row.read_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  };
}

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await listForPubkey(session.pubkey);
  return NextResponse.json({ data: rows.map(rowToDto) });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = notificationPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  await markRead(parsed.data.id, session.pubkey);
  return NextResponse.json({ ok: true });
}

export async function POST(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await markAllRead(session.pubkey);
  return NextResponse.json({ ok: true });
}

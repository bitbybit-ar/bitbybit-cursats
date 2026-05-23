// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { verifyNip05 } from "@/lib/nostr/nip05";

const PUBKEY =
  "0".repeat(63) + "a"; // 64-char hex
const OTHER_PUBKEY = "f".repeat(64);

function fetchReturning(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () =>
    ({
      ok,
      status: ok ? 200 : 404,
      json: async () => body,
    }) as Response
  ) as unknown as typeof fetch;
}

describe("verifyNip05", () => {
  it("verifies when the well-known maps the name back to the pubkey", async () => {
    const fetchImpl = fetchReturning({ names: { anix: PUBKEY } });
    expect(
      await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })
    ).toBe(true);
  });

  it("is case-insensitive on the returned pubkey", async () => {
    const fetchImpl = fetchReturning({ names: { anix: PUBKEY.toUpperCase() } });
    expect(await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })).toBe(true);
  });

  it("fails when the well-known maps to a different pubkey", async () => {
    const fetchImpl = fetchReturning({ names: { anix: OTHER_PUBKEY } });
    expect(await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })).toBe(false);
  });

  it("resolves a bare domain against the root `_` name", async () => {
    const fetchImpl = fetchReturning({ names: { _: PUBKEY } });
    expect(await verifyNip05("hodl.ar", PUBKEY, { fetchImpl })).toBe(true);
  });

  it("rejects a malformed identifier without fetching", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await verifyNip05("not a nip05", PUBKEY, { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a non-hex expected pubkey without fetching", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await verifyNip05("anix@hodl.ar", "nope", { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns false on a non-ok response", async () => {
    const fetchImpl = fetchReturning({}, false);
    expect(await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })).toBe(false);
  });

  it("returns false when the name is absent from `names`", async () => {
    const fetchImpl = fetchReturning({ names: { someone: PUBKEY } });
    expect(await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })).toBe(false);
  });

  it("returns false when fetch throws (network/CORS)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await verifyNip05("anix@hodl.ar", PUBKEY, { fetchImpl })).toBe(false);
  });
});

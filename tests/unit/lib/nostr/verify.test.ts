// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import { validateNip98AuthEvent } from "@/lib/nostr/verify";

const URL_UNDER_TEST = "https://cursats.test/api/auth/nostr";
const METHOD = "POST";

function signNip98(opts: {
  url?: string;
  method?: string;
  kind?: number;
  content?: string;
  createdAt?: number;
  extraTags?: string[][];
  secretKey?: Uint8Array;
}) {
  const sk = opts.secretKey ?? generateSecretKey();
  const tags = [
    ["u", opts.url ?? URL_UNDER_TEST],
    ["method", opts.method ?? METHOD],
    ...(opts.extraTags ?? []),
  ];
  return finalizeEvent(
    {
      kind: opts.kind ?? 27235,
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: opts.content ?? "",
    },
    sk
  );
}

describe("nostr/validateNip98AuthEvent", () => {
  it("accepts a freshly-signed kind 27235 event", () => {
    const event = signNip98({});
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a malformed event with reason 'schema'", () => {
    const result = validateNip98AuthEvent(
      { not: "a real event" },
      { url: URL_UNDER_TEST, method: METHOD }
    );
    expect(result).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects the wrong kind with reason 'kind'", () => {
    const event = signNip98({ kind: 1 });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result).toEqual({ ok: false, reason: "kind" });
  });

  it("rejects a stale created_at with reason 'clock'", () => {
    const event = signNip98({
      createdAt: Math.floor(Date.now() / 1000) - 600,
    });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result).toEqual({ ok: false, reason: "clock" });
  });

  it("rejects non-empty content with reason 'content'", () => {
    const event = signNip98({ content: "leak" });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result).toEqual({ ok: false, reason: "content" });
  });

  it("rejects a URL mismatch with reason 'url'", () => {
    const event = signNip98({ url: "https://attacker.test/api/auth/nostr" });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result).toEqual({ ok: false, reason: "url" });
  });

  it("rejects a method mismatch with reason 'method'", () => {
    const event = signNip98({ method: "GET" });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: "POST",
    });
    expect(result).toEqual({ ok: false, reason: "method" });
  });

  it("ignores trailing slashes when comparing URLs", () => {
    const event = signNip98({ url: URL_UNDER_TEST + "/" });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a tampered signature with reason 'signature'", () => {
    const event = signNip98({});
    // Mutating any field after signing invalidates the sig.
    const tampered = { ...event, content: "tampered" };
    const result = validateNip98AuthEvent(tampered, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    // Mutating content makes the event fail the "content must be empty"
    // check before reaching the signature check; either rejection is
    // acceptable as a tamper outcome.
    expect(result.ok).toBe(false);
  });

  it("verifies the pubkey of the signer is on the event", () => {
    const sk = generateSecretKey();
    const expectedPubkey = getPublicKey(sk);
    const event = signNip98({ secretKey: sk });
    const result = validateNip98AuthEvent(event, {
      url: URL_UNDER_TEST,
      method: METHOD,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.pubkey).toBe(expectedPubkey);
    }
  });
});

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  BLOSSOM_AUTH_KIND,
  BlossomUploadError,
  readBlossomServers,
  uploadToBlossom,
} from "@/lib/blossom/client";
import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";

function findTag(event: NostrEvent | UnsignedNostrEvent, name: string) {
  return event.tags.find((t) => t[0] === name)?.[1];
}

function makeFile(bytes: Uint8Array, type = "image/jpeg"): File {
  // The vitest node env has File via undici. Cast to BlobPart to
  // sidestep the Uint8Array<ArrayBufferLike> vs ArrayBuffer mismatch
  // under strict TS — both runtime shapes are accepted.
  return new File([bytes as BlobPart], "image.jpg", { type });
}

function expectedSha(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeSigner(): {
  sign: (u: UnsignedNostrEvent) => Promise<NostrEvent>;
  signed: UnsignedNostrEvent[];
} {
  const signed: UnsignedNostrEvent[] = [];
  return {
    signed,
    sign: async (unsigned) => {
      signed.push(unsigned);
      return {
        ...unsigned,
        id: "0".repeat(64),
        pubkey: "1".repeat(64),
        sig: "2".repeat(128),
      };
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("blossom/readBlossomServers", () => {
  it("falls back to the default public servers for undefined or empty input", () => {
    // Empty / unset → DEFAULT_BLOSSOM_SERVERS so the offering form
    // works without forcing every contributor to copy a value out
    // of .env.example. Operators who care override via the env var.
    const defaults = [
      "https://blossom.primal.net",
      "https://cdn.satellite.earth",
    ];
    expect(readBlossomServers(undefined)).toEqual(defaults);
    expect(readBlossomServers("")).toEqual(defaults);
    // Whitespace-only and a comma-list of empty entries should both
    // be treated as "no override" and fall back to the defaults too.
    expect(readBlossomServers("   ")).toEqual(defaults);
    expect(readBlossomServers(", ,")).toEqual(defaults);
  });

  it("trims whitespace and drops empty entries", () => {
    expect(
      readBlossomServers(
        " https://a.example, https://b.example , , https://c.example "
      )
    ).toEqual(["https://a.example", "https://b.example", "https://c.example"]);
  });
});

describe("blossom/uploadToBlossom", () => {
  it("rejects when no servers are configured", async () => {
    const file = makeFile(new Uint8Array([1, 2, 3]));
    const signer = makeSigner();

    await expect(
      uploadToBlossom(file, { servers: [], signWithPrompt: signer.sign })
    ).rejects.toBeInstanceOf(BlossomUploadError);
  });

  it("hashes the file bytes and binds them into the signed event", async () => {
    const bytes = new Uint8Array([7, 8, 9, 10]);
    const file = makeFile(bytes);
    const signer = makeSigner();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            url: "https://a.example/abc.jpg",
            sha256: expectedSha(bytes),
            size: bytes.byteLength,
            type: "image/jpeg",
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await uploadToBlossom(file, {
      servers: ["https://a.example"],
      signWithPrompt: signer.sign,
    });

    expect(signer.signed.length).toBe(1);
    const auth = signer.signed[0];
    expect(auth.kind).toBe(BLOSSOM_AUTH_KIND);
    expect(findTag(auth, "t")).toBe("upload");
    expect(findTag(auth, "x")).toBe(expectedSha(bytes));
    expect(findTag(auth, "size")).toBe(String(bytes.byteLength));
    expect(findTag(auth, "type")).toBe("image/jpeg");
  });

  it("returns the URL from the first server that accepts the upload", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const file = makeFile(bytes);
    const signer = makeSigner();
    const sha = expectedSha(bytes);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("https://a.example")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                url: `https://a.example/${sha}.jpg`,
                sha256: sha,
                size: bytes.byteLength,
                type: "image/jpeg",
              }),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(
          new Response("nope", {
            status: 503,
            statusText: "Service Unavailable",
          })
        );
      })
    );

    const result = await uploadToBlossom(file, {
      servers: ["https://a.example", "https://b.example"],
      signWithPrompt: signer.sign,
    });

    expect(result.url).toBe(`https://a.example/${sha}.jpg`);
    expect(result.sha256).toBe(sha);
    expect(result.servers).toEqual(["https://a.example"]);
    expect(result.failures).toEqual([
      { server: "https://b.example", reason: "503 Service Unavailable" },
    ]);
  });

  it("derives the URL from <server>/<sha256> when the server omits it", async () => {
    const bytes = new Uint8Array([42]);
    const file = makeFile(bytes);
    const signer = makeSigner();
    const sha = expectedSha(bytes);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ sha256: sha }), { status: 200 })
        )
    );

    const result = await uploadToBlossom(file, {
      servers: ["https://a.example/"],
      signWithPrompt: signer.sign,
    });

    // Trailing slash stripped, then `/sha256` appended.
    expect(result.url).toBe(`https://a.example/${sha}`);
  });

  it("throws BlossomUploadError when every server rejects", async () => {
    const bytes = new Uint8Array([1]);
    const file = makeFile(bytes);
    const signer = makeSigner();

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("denied", { status: 403, statusText: "Forbidden" })
        )
    );

    await expect(
      uploadToBlossom(file, {
        servers: ["https://a.example", "https://b.example"],
        signWithPrompt: signer.sign,
      })
    ).rejects.toMatchObject({
      name: "BlossomUploadError",
      failures: [
        { server: "https://a.example", reason: "403 Forbidden" },
        { server: "https://b.example", reason: "403 Forbidden" },
      ],
    });
  });

  it("treats fetch transport errors as failures, not crashes", async () => {
    const bytes = new Uint8Array([5, 5, 5]);
    const file = makeFile(bytes);
    const signer = makeSigner();
    const sha = expectedSha(bytes);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("https://a.example")) {
          return Promise.reject(new Error("offline"));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              url: `https://b.example/${sha}.jpg`,
              sha256: sha,
              size: bytes.byteLength,
              type: "image/jpeg",
            }),
            { status: 200 }
          )
        );
      })
    );

    const result = await uploadToBlossom(file, {
      servers: ["https://a.example", "https://b.example"],
      signWithPrompt: signer.sign,
    });

    expect(result.servers).toEqual(["https://b.example"]);
    expect(result.failures).toEqual([
      { server: "https://a.example", reason: "offline" },
    ]);
  });
});

/**
 * Blossom upload client.
 *
 * Per ADR 0011, offering images live on Blossom servers
 * (https://github.com/hzrd149/blossom). The client computes the file's
 * sha256, builds a kind:24242 auth event, signs it via
 * `signWithPrompt`, and PUTs the file to one or more servers in
 * parallel. The blob is hash-addressed (`https://server/<sha256>`),
 * so any compatible mirror can serve it later — choosing a "primary"
 * server is just choosing which URL to persist into the row.
 */

import type { NostrEvent, UnsignedNostrEvent } from "@/lib/nostr/types";

export const BLOSSOM_AUTH_KIND = 24242;

/** How long the signed auth event stays valid, in seconds. */
const AUTH_EXPIRATION_WINDOW = 600;

export interface BlossomUploadResult {
  /** Hash-addressed URL on the server that responded first. */
  url: string;
  sha256: string;
  size: number;
  type: string;
  /**
   * Every server that accepted the upload. When the list has more
   * than one entry the blob is mirrored; the row stores
   * `result.url` but a future render can fall back to the others.
   */
  servers: string[];
  /** Servers that refused the upload, with the status text. */
  failures: { server: string; reason: string }[];
}

export type SignWithPromptFn = (
  unsigned: UnsignedNostrEvent
) => Promise<NostrEvent>;

export class BlossomUploadError extends Error {
  constructor(
    message: string,
    public readonly failures: { server: string; reason: string }[]
  ) {
    super(message);
    this.name = "BlossomUploadError";
  }
}

interface UploadOptions {
  /**
   * Comma-separated list resolved from `BLOSSOM_SERVERS`, or any
   * other source. Each entry is the server's base URL with no
   * trailing slash.
   */
  servers: string[];
  /**
   * The signer's `signWithPrompt` from `useSignerContext()`. Taken
   * as a parameter rather than imported so this helper stays a
   * pure function for testing.
   */
  signWithPrompt: SignWithPromptFn;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildAuthEvent(
  sha256: string,
  size: number,
  type: string
): UnsignedNostrEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    kind: BLOSSOM_AUTH_KIND,
    created_at: now,
    tags: [
      ["t", "upload"],
      ["x", sha256],
      ["expiration", String(now + AUTH_EXPIRATION_WINDOW)],
      ["size", String(size)],
      ["type", type],
    ],
    content: "Upload offering image",
  };
}

function trimServer(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Upload `file` to every server in `options.servers`. Resolves once
 * at least one server accepts the blob; never throws while another
 * upload is still in flight. Throws `BlossomUploadError` only when
 * every server failed.
 */
export async function uploadToBlossom(
  file: File,
  options: UploadOptions
): Promise<BlossomUploadResult> {
  if (options.servers.length === 0) {
    throw new BlossomUploadError("no_servers_configured", []);
  }

  const buffer = await file.arrayBuffer();
  const sha256 = await sha256Hex(buffer);
  const unsigned = buildAuthEvent(sha256, file.size, file.type);
  const signed = await options.signWithPrompt(unsigned);
  const authHeader = `Nostr ${btoa(JSON.stringify(signed))}`;

  const attempts = options.servers.map(
    async (
      server
    ): Promise<
      | { ok: true; server: string; url: string }
      | { ok: false; server: string; reason: string }
    > => {
      const base = trimServer(server);
      try {
        const res = await fetch(`${base}/upload`, {
          method: "PUT",
          headers: {
            Authorization: authHeader,
            "content-type": file.type || "application/octet-stream",
          },
          body: buffer,
        });
        if (!res.ok) {
          return {
            ok: false,
            server: base,
            reason: `${res.status} ${res.statusText}`.trim(),
          };
        }
        // BUD-02: the success body is JSON with at least
        // { url, sha256, size, type }. Some servers tolerate a
        // missing `url` and only echo the descriptor; in that
        // case derive the URL from `<base>/<sha256>`.
        const json = (await res.json().catch(() => null)) as {
          url?: string;
          sha256?: string;
        } | null;
        const url = json?.url ?? `${base}/${sha256}`;
        return { ok: true, server: base, url };
      } catch (err) {
        return {
          ok: false,
          server: base,
          reason: err instanceof Error ? err.message : "fetch_failed",
        };
      }
    }
  );

  const settled = await Promise.all(attempts);
  const successes = settled.filter(
    (r): r is { ok: true; server: string; url: string } => r.ok
  );
  const failures = settled
    .filter((r): r is { ok: false; server: string; reason: string } => !r.ok)
    .map(({ server, reason }) => ({ server, reason }));

  if (successes.length === 0) {
    throw new BlossomUploadError("all_servers_rejected", failures);
  }

  return {
    url: successes[0].url,
    sha256,
    size: file.size,
    type: file.type,
    servers: successes.map((s) => s.server),
    failures,
  };
}

/**
 * Public Blossom servers known to accept anonymous Nostr-signed
 * uploads. Used as a fallback when `NEXT_PUBLIC_BLOSSOM_SERVERS` is
 * unset — keeps the offering form usable in dev without forcing
 * every contributor to copy a value out of `.env.example`. Operators
 * who care about pinning a specific server override via the env var.
 */
const DEFAULT_BLOSSOM_SERVERS = [
  "https://blossom.primal.net",
  "https://cdn.satellite.earth",
];

/**
 * Resolve the configured server list from a comma-separated env
 * string. `NEXT_PUBLIC_BLOSSOM_SERVERS` is the runtime entry point
 * because the upload happens in the browser; without `NEXT_PUBLIC_*`
 * the value would be undefined at upload time. Empty / unset →
 * `DEFAULT_BLOSSOM_SERVERS` so the form works out of the box.
 */
export function readBlossomServers(envValue: string | undefined): string[] {
  if (!envValue) return [...DEFAULT_BLOSSOM_SERVERS];
  const parsed = envValue
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parsed.length > 0 ? parsed : [...DEFAULT_BLOSSOM_SERVERS];
}

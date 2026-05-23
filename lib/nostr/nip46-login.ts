/**
 * NIP-46 (Nostr Connect) login utilities.
 *
 * Two flows are supported:
 *   1. QR scan — we generate a `nostrconnect://` URI and the user
 *      scans it with their signer app (nsec.app, Amber, …).
 *   2. Bunker paste — the user pastes a `bunker://` URL their
 *      signer app produced.
 *
 * Both establish an encrypted relay channel; the remote signer
 * signs the NIP-98 challenge event without exposing the private
 * key to the browser. This module is purely client-side; the
 * server contract is unchanged (still NIP-98 over
 * `/api/auth/nostr`).
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import {
  BunkerSigner,
  parseBunkerInput,
  createNostrConnectURI,
} from "nostr-tools/nip46";

// Mobile signers (Amber over nostrconnect://) round-trip through
// public relays that can take a while to connect on cellular links;
// 60s was too tight and surfaced a spurious "couldn't connect" toast
// before the approval came back. 120s gives slow relays room.
export const NIP46_TIMEOUT_MS = 120_000;

export type BunkerLoginErrorCode = "bunker_invalid_url";

export class BunkerLoginError extends Error {
  constructor(public readonly code: BunkerLoginErrorCode) {
    super(code);
    this.name = "BunkerLoginError";
  }
}

/**
 * Relays used for the NIP-46 rendezvous channel.
 * `relay.nsec.app` MUST come first: nsec.app and most bunker apps
 * listen on it by default, and if the app-side URI doesn't
 * advertise it they never see the connect request.
 */
const NIP46_CONNECT_RELAYS = [
  "wss://relay.nsec.app",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

const LOCAL_CLIENT_KEY_STORAGE = "cursats-nip46-client-key";

/**
 * Get (or lazily create) the persistent client secret key used to
 * pair with a remote signer. Reusing the same key across connect
 * attempts lets a signer app recognise us on retry and avoids a
 * fresh handshake every time the panel re-mounts.
 */
function getLocalClientSecret(): Uint8Array {
  if (typeof localStorage === "undefined") return generateSecretKey();

  try {
    const saved = localStorage.getItem(LOCAL_CLIENT_KEY_STORAGE);
    if (saved && /^[0-9a-f]{64}$/i.test(saved)) {
      return hexToBytes(saved);
    }
  } catch {
    // Storage unavailable — fall through to a fresh key.
  }

  const key = generateSecretKey();
  try {
    localStorage.setItem(LOCAL_CLIENT_KEY_STORAGE, bytesToHex(key));
  } catch {
    // Ignore write failures; the in-memory key still works.
  }
  return key;
}

export interface BunkerLoginOptions {
  /**
   * Called when the remote signer returns an approval URL (Amber,
   * nsec.app when auth_url is required). The UI should render a
   * link/button that opens this URL so the user can approve.
   */
  onAuthUrl?: (url: string) => void;
}

interface NostrConnectSession {
  uri: string;
  clientSecretKey: Uint8Array;
}

/**
 * Generate a `nostrconnect://` URI for QR display. Returns the URI
 * and the client secret key needed to complete the connection.
 */
export function createConnectSession(): NostrConnectSession {
  const clientSecretKey = getLocalClientSecret();
  const clientPubkey = getPublicKey(clientSecretKey);
  const secret = bytesToHex(generateSecretKey()).slice(0, 16);

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: NIP46_CONNECT_RELAYS,
    secret,
    name: "BitByBit Cursats",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_BASE_URL || "https://cursats.bitbybit.com.ar",
  });

  return { uri, clientSecretKey };
}

/**
 * Wait for a remote signer to connect via the `nostrconnect://`
 * URI. Resolves when the signer approves; rejects on timeout or
 * abort.
 */
export async function waitForConnection(
  session: NostrConnectSession,
  options: BunkerLoginOptions & { abortSignal?: AbortSignal } = {}
): Promise<BunkerSigner> {
  const { abortSignal, onAuthUrl } = options;

  // BunkerSigner.fromURI's 4th arg accepts either a number
  // (timeout ms) or an AbortSignal — not both. We want both, so we
  // wire the abort signal through a Promise.race against our own
  // timeout.
  const fromUriPromise = BunkerSigner.fromURI(
    session.clientSecretKey,
    session.uri,
    {
      onauth: onAuthUrl,
    },
    NIP46_TIMEOUT_MS
  );

  if (!abortSignal) return fromUriPromise;

  return new Promise<BunkerSigner>((resolve, reject) => {
    const onAbort = () => reject(new Error("aborted"));
    if (abortSignal.aborted) {
      onAbort();
      return;
    }
    abortSignal.addEventListener("abort", onAbort, { once: true });
    fromUriPromise
      .then((signer) => {
        abortSignal.removeEventListener("abort", onAbort);
        resolve(signer);
      })
      .catch((err) => {
        abortSignal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

/**
 * Connect via a `bunker://` URL pasted by the user.
 */
export async function connectWithBunkerURL(
  bunkerInput: string,
  options: BunkerLoginOptions = {}
): Promise<BunkerSigner> {
  const bp = await parseBunkerInput(bunkerInput.trim());
  if (!bp) {
    throw new BunkerLoginError("bunker_invalid_url");
  }

  const clientSecretKey = getLocalClientSecret();
  const signer = BunkerSigner.fromBunker(clientSecretKey, bp, {
    onauth: options.onAuthUrl,
  });

  // Prime the connection and cache the user pubkey. Calling
  // connect + getPublicKey here means any auth-url prompt fires
  // now, not mid-finalize.
  await signer.connect();
  await signer.getPublicKey();
  return signer;
}

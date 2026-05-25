import type { NostrEvent } from "./types";
import { PUBLIC_RELAYS } from "./relays";

/** Per-relay deadline. A slow or unreachable relay can't hold the
 * share modal hostage; it just counts as a non-acceptance. */
const RELAY_TIMEOUT_MS = 5000;

export interface PublishResult {
  /**
   * How many relays had returned an `OK: true` frame for this event at
   * the moment we resolved. Since the publish resolves on the first
   * acknowledgement (slower relays keep broadcasting in the
   * background), treat this as a lower bound — `accepted > 0` means the
   * note landed; `accepted === 0` means none acknowledged before all
   * relays settled.
   */
  accepted: number;
  /** How many relays we attempted to broadcast to. */
  total: number;
}

/**
 * Publish an already-signed Nostr event to relays and report how many
 * accepted it.
 *
 * Signing is deferred to the SignerProvider so callers can use any
 * signer type (NIP-07 extension, in-memory nsec, NIP-46 bunker)
 * without caring which one is active. Each relay is given a bounded
 * window to return its NIP-01 `OK` frame; a relay that times out,
 * errors, or replies `OK: false` simply doesn't count toward
 * `accepted`. Callers that want to confirm the event actually landed
 * (rather than just leaving the browser) should check
 * `accepted > 0`.
 */
export async function publishSignedEvent(
  signedEvent: NostrEvent,
  relayUrls?: string[]
): Promise<PublishResult> {
  const urls = relayUrls ?? PUBLIC_RELAYS;
  return publishToRelays(signedEvent, urls);
}

function publishToRelays(
  event: NostrEvent,
  relayUrls: readonly string[]
): Promise<PublishResult> {
  const message = JSON.stringify(["EVENT", event]);
  const total = relayUrls.length;

  return new Promise<PublishResult>((resolve) => {
    if (total === 0) {
      resolve({ accepted: 0, total: 0 });
      return;
    }

    let accepted = 0;
    let settled = 0;
    let done = false;

    // Resolve as soon as one relay acknowledges (the share has landed,
    // no need to wait on slower relays — they keep broadcasting in the
    // background), or once every relay has settled without an ack.
    const maybeResolve = () => {
      if (done) return;
      if (accepted > 0 || settled === total) {
        done = true;
        resolve({ accepted, total });
      }
    };

    for (const url of relayUrls) {
      void publishToOneRelay(url, message, event.id).then((ok) => {
        if (ok) accepted += 1;
        settled += 1;
        maybeResolve();
      });
    }
  });
}

/**
 * Broadcast to a single relay and resolve `true` only when it returns
 * an `["OK", <event_id>, true, ...]` frame (NIP-01). Resolves `false`
 * on rejection, transport error, socket close, or timeout — never
 * rejects, so one bad relay can't fail the whole publish.
 */
function publishToOneRelay(
  url: string,
  message: string,
  eventId: string
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let ws: WebSocket | undefined;

    const deadline = setTimeout(() => finish(false), RELAY_TIMEOUT_MS);

    function finish(accepted: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      resolve(accepted);
    }

    try {
      ws = new WebSocket(url);
      ws.addEventListener("open", () => ws?.send(message));
      ws.addEventListener("message", (ev) => {
        try {
          const data = JSON.parse(
            typeof ev.data === "string" ? ev.data : ""
          ) as unknown;
          // ["OK", <event_id>, <true|false>, <message>]
          if (Array.isArray(data) && data[0] === "OK" && data[1] === eventId) {
            finish(data[2] === true);
          }
        } catch {
          // Ignore non-JSON or unrelated frames (NOTICE, EOSE, …).
        }
      });
      ws.addEventListener("error", () => finish(false));
      ws.addEventListener("close", () => finish(false));
    } catch {
      finish(false);
    }
  });
}

import type { NostrEvent } from "./types";
import { PUBLIC_RELAYS } from "./relays";

/**
 * Publish an already-signed Nostr event to relays.
 *
 * Signing is deferred to the SignerProvider so callers can use any
 * signer type (NIP-07 extension, in-memory nsec, NIP-46 bunker)
 * without caring which one is active. The relay broadcast itself is
 * fire-and-forget — one relay accepting the event is enough for the
 * UI to consider the share "published"; later relays get a chance
 * to pick up the event from each other.
 */
export async function publishSignedEvent(
  signedEvent: NostrEvent,
  relayUrls?: string[]
): Promise<void> {
  const urls = relayUrls ?? PUBLIC_RELAYS;
  await publishToRelays(signedEvent, urls);
}

async function publishToRelays(
  event: NostrEvent,
  relayUrls: readonly string[]
): Promise<void> {
  const message = JSON.stringify(["EVENT", event]);

  const promises = relayUrls.map(
    (url) =>
      new Promise<void>((resolve) => {
        try {
          const ws = new WebSocket(url);
          // 5-second per-relay deadline. Slow relays don't hold the
          // share modal hostage.
          const deadline = setTimeout(() => {
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            resolve();
          }, 5000);

          ws.addEventListener("open", () => {
            ws.send(message);
            // Give the relay a brief window to return an OK frame
            // before we close. We don't actually parse it — for the
            // UX, "the bytes left our browser" is good enough.
            setTimeout(() => {
              clearTimeout(deadline);
              try {
                ws.close();
              } catch {
                /* ignore */
              }
              resolve();
            }, 1000);
          });

          ws.addEventListener("error", () => {
            clearTimeout(deadline);
            resolve();
          });
        } catch {
          resolve();
        }
      })
  );

  // Don't block on every relay returning. 3 seconds of any response
  // is plenty for the modal to close.
  await Promise.race([
    Promise.all(promises),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
}

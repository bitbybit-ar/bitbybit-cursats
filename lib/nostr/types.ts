export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface UnsignedNostrEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedNostrEvent): Promise<NostrEvent>;
      getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
      nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
    webln?: {
      enable(): Promise<void>;
      sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
    };
  }
}

"use client";

import { keccak256, hexToBytes, bytesToHex, type Hex } from "viem";

/**
 * Browser-side encryption for the handoff service (libsodium sealed boxes, X25519).
 * The secret key is derived from a wallet signature and never leaves the browser.
 */

type Sodium = typeof import("libsodium-wrappers");
let sodiumP: Promise<Sodium> | null = null;
async function sodium(): Promise<Sodium> {
  sodiumP ??= import("libsodium-wrappers").then(async (m) => {
    const s = (m as unknown as { default?: Sodium }).default ?? (m as unknown as Sodium);
    await s.ready;
    return s;
  });
  return sodiumP;
}

export const KEY_DERIVE_MESSAGE =
  "Tally handoff key v1\n\nSign to unlock your encryption key for job specs and access details. This is not a transaction and costs nothing.";
export const KEY_PUBLISH_PREFIX = "Tally handoff encryption key\n";

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array; publicHex: Hex };

const cache = new Map<string, KeyPair>();

export async function deriveKeyPair(address: string, signature: Hex): Promise<KeyPair> {
  const s = await sodium();
  const seed = hexToBytes(keccak256(signature));
  const kp = s.crypto_box_seed_keypair(seed);
  const out = { publicKey: kp.publicKey, privateKey: kp.privateKey, publicHex: bytesToHex(kp.publicKey) };
  cache.set(address.toLowerCase(), out);
  return out;
}

export function cachedKeyPair(address?: string): KeyPair | undefined {
  return address ? cache.get(address.toLowerCase()) : undefined;
}

export async function sealTo(recipientPubHex: Hex, plaintext: string): Promise<string> {
  const s = await sodium();
  const ct = s.crypto_box_seal(s.from_string(plaintext), hexToBytes(recipientPubHex));
  return s.to_base64(ct, s.base64_variants.ORIGINAL);
}

export async function openSealed(kp: KeyPair, ciphertextB64: string): Promise<string> {
  const s = await sodium();
  const pt = s.crypto_box_seal_open(s.from_base64(ciphertextB64, s.base64_variants.ORIGINAL), kp.publicKey, kp.privateKey);
  return s.to_string(pt);
}

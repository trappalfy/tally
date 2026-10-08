"use client";

import { useCallback } from "react";
import { useAccount, useSignMessage, usePublicClient } from "wagmi";
import type { Address, Hex } from "viem";
import { activeChain } from "../chains";
import { handoff } from "./handoff";
import { KEY_DERIVE_MESSAGE, KEY_PUBLISH_PREFIX, cachedKeyPair, deriveKeyPair, type KeyPair } from "./crypto";

/**
 * Handoff session helpers: SIWE sign-in, deriving the wallet's encryption key, publishing the holder key.
 */
export function useHandoffSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const client = usePublicClient();

  const ensureSignedIn = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first.");
    const me = await handoff.me();
    if (me.address?.toLowerCase() === address.toLowerCase()) return;
    await handoff.signIn(address, activeChain.id, (message) => signMessageAsync({ message }));
  }, [address, signMessageAsync]);

  const ensureKey = useCallback(async (): Promise<KeyPair> => {
    if (!address) throw new Error("Connect a wallet first.");
    const cached = cachedKeyPair(address);
    if (cached) return cached;
    const sig = await signMessageAsync({ message: KEY_DERIVE_MESSAGE });
    return deriveKeyPair(address, sig);
  }, [address, signMessageAsync]);

  /** Holder: make sure the service has this wallet's public key, signed by the wallet. */
  const ensurePublishedKey = useCallback(async (): Promise<KeyPair> => {
    const kp = await ensureKey();
    let current: Hex | undefined;
    try {
      current = (await handoff.getKey(address as Address)).pubkey;
    } catch {
      current = undefined;
    }
    if (current?.toLowerCase() !== kp.publicHex.toLowerCase()) {
      await ensureSignedIn();
      const signature = await signMessageAsync({ message: KEY_PUBLISH_PREFIX + kp.publicHex.toLowerCase() });
      await handoff.publishKey(kp.publicHex, signature);
    }
    return kp;
  }, [address, ensureKey, ensureSignedIn, signMessageAsync]);

  /** Fetch a holder's published key and check the wallet signature before encrypting to it. */
  const verifiedHolderKey = useCallback(
    async (holder: Address): Promise<Hex> => {
      const k = await handoff.getKey(holder);
      const ok = await client!.verifyMessage({ address: holder, message: KEY_PUBLISH_PREFIX + k.pubkey.toLowerCase(), signature: k.signature });
      if (!ok) throw new Error("Holder key signature does not match. Do not send access details.");
      return k.pubkey;
    },
    [client],
  );

  return { ensureSignedIn, ensureKey, ensurePublishedKey, verifiedHolderKey };
}

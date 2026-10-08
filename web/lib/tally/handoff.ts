"use client";

import { createSiweMessage } from "viem/siwe";
import type { Address, Hex } from "viem";

const BASE = "/api/handoff";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export const handoff = {
  me: () => call<{ address: Address | null }>("/me"),
  async signIn(address: Address, chainId: number, signMessage: (m: string) => Promise<Hex>) {
    const { nonce } = await call<{ nonce: string }>("/nonce");
    const message = createSiweMessage({
      address,
      chainId,
      domain: window.location.host,
      nonce,
      uri: window.location.origin,
      version: "1",
      statement: "Sign in to Tally to pass job specs and access details. No transaction, no cost.",
    });
    const signature = await signMessage(message);
    return call<{ address: Address }>("/verify", { method: "POST", body: JSON.stringify({ message, signature }) });
  },
  logout: () => call("/logout", { method: "POST" }),
  publishKey: (pubkey: Hex, signature: Hex) =>
    call("/keys", { method: "POST", body: JSON.stringify({ pubkey, signature }) }),
  getKey: (address: Address) =>
    call<{ address: Address; pubkey: Hex; signature: Hex; message: string }>(`/keys/${address}`),
  postSpec: (provider: Address, ciphertext: string) =>
    call<{ hash: Hex }>("/specs", { method: "POST", body: JSON.stringify({ provider, ciphertext }) }),
  getSpec: (hash: Hex, rid?: bigint) =>
    call<{ ciphertext: string; holder: Address }>(`/specs/${hash}${rid !== undefined ? `?rid=${rid}` : ""}`),
  postAccess: (rid: bigint, ciphertext: string) =>
    call<{ hash: Hex }>(`/access/${rid}`, { method: "POST", body: JSON.stringify({ ciphertext }) }),
  getAccess: (rid: bigint) =>
    call<{ ciphertext: string; hash: Hex; onchainHash: Hex; matches: boolean }>(`/access/${rid}`),
  postEvidence: (rid: bigint, text: string, image?: string | null) =>
    call(`/evidence/${rid}`, { method: "POST", body: JSON.stringify({ text, image }) }),
  getEvidence: (rid: bigint) =>
    call<{ id: number; author: Address; role: string; text: string; image: string | null; createdAt: string }[]>(
      `/evidence/${rid}`,
    ),
  setContact: (webhook: string, email: string) =>
    call("/contact", { method: "POST", body: JSON.stringify({ webhook, email }) }),
  getContact: () => call<{ webhook?: string | null; email?: string | null }>("/contact"),
  notify: (rid: bigint) => call(`/notify/${rid}`, { method: "POST" }),
};

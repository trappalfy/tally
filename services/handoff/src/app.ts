import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import {
  createPublicClient,
  http,
  defineChain,
  getAddress,
  isAddress,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
  parseAbiItem,
} from "viem";
import { parseSiweMessage, generateSiweNonce } from "viem/siwe";
import { tallyHubAbi, getDeployment, Status } from "@tally/shared";
import { getStore } from "./store";

/**
 * Tally handoff service. Passes encrypted job specs and access details between holder and provider,
 * and keeps dispute evidence. It never touches money and never sees plaintext.
 * Mounted at /api/handoff (see web/app/api/handoff/[[...route]]/route.ts); can also run standalone.
 */

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
const RPC_URL =
  process.env.RPC_URL ??
  process.env.NEXT_PUBLIC_RPC_URL ??
  (CHAIN_ID === 46630 ? "https://rpc.testnet.chain.robinhood.com" : "https://rpc.mainnet.chain.robinhood.com");
const HUB = (process.env.HUB_ADDRESS ?? process.env.NEXT_PUBLIC_HUB_ADDRESS ?? getDeployment(CHAIN_ID)?.hub) as Address;

const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});
const client = createPublicClient({ chain, transport: http(RPC_URL) });

const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s ?? "dev-only-secret-change-me-dev-only-secret");
};

const KEY_MESSAGE_PREFIX = "Tally handoff encryption key\n";
const MAX_SPEC = 64 * 1024;
const MAX_IMAGE = 3 * 1024 * 1024;

type Vars = { Variables: { address: Address } };
export const app = new Hono<Vars>().basePath("/api/handoff");

const secure = process.env.NODE_ENV === "production";

async function sign(payload: Record<string, unknown>, exp: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(exp).sign(secret());
}

async function sessionAddress(c: Context): Promise<Address | null> {
  const tok = getCookie(c, "tally_session");
  if (!tok) return null;
  try {
    const { payload } = await jwtVerify(tok, secret());
    return typeof payload.sub === "string" && isAddress(payload.sub) ? getAddress(payload.sub) : null;
  } catch {
    return null;
  }
}

const auth = async (c: Context<Vars>, next: () => Promise<void>) => {
  const a = await sessionAddress(c);
  if (!a) return c.json({ error: "Sign in with your wallet first." }, 401);
  c.set("address", a);
  await next();
};

async function readRedemption(id: string) {
  if (!/^\d+$/.test(id)) return null;
  try {
    return await client.readContract({ address: HUB, abi: tallyHubAbi, functionName: "redemption", args: [BigInt(id)] });
  } catch {
    return null;
  }
}

async function arbiter(): Promise<Address> {
  return client.readContract({ address: HUB, abi: tallyHubAbi, functionName: "arbiter" });
}

// ---------------- SIWE ----------------

app.get("/nonce", async (c) => {
  const nonce = generateSiweNonce();
  setCookie(c, "tally_nonce", await sign({ nonce }, "10m"), { httpOnly: true, sameSite: "Lax", secure, path: "/" });
  return c.json({ nonce });
});

app.post("/verify", async (c) => {
  const { message, signature } = await c.req.json<{ message: string; signature: Hex }>();
  const tok = getCookie(c, "tally_nonce");
  if (!tok) return c.json({ error: "Nonce expired. Try again." }, 400);
  let nonce: string;
  try {
    nonce = String((await jwtVerify(tok, secret())).payload.nonce);
  } catch {
    return c.json({ error: "Nonce expired. Try again." }, 400);
  }
  const parsed = parseSiweMessage(message);
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
  if (!parsed.address || parsed.nonce !== nonce || (host && parsed.domain !== host)) {
    return c.json({ error: "Bad sign-in message." }, 400);
  }
  const ok = await client.verifySiweMessage({ message, signature, nonce, domain: parsed.domain });
  if (!ok) return c.json({ error: "Signature does not match." }, 401);
  deleteCookie(c, "tally_nonce", { path: "/" });
  const address = getAddress(parsed.address);
  setCookie(c, "tally_session", await sign({ sub: address }, "7d"), {
    httpOnly: true,
    sameSite: "Lax",
    secure,
    path: "/",
    maxAge: 7 * 86400,
  });
  return c.json({ address });
});

app.get("/me", async (c) => c.json({ address: await sessionAddress(c) }));

app.post("/logout", (c) => {
  deleteCookie(c, "tally_session", { path: "/" });
  return c.json({ ok: true });
});

// ---------------- holder encryption keys ----------------

app.post("/keys", auth, async (c) => {
  const address = c.get("address");
  const { pubkey, signature } = await c.req.json<{ pubkey: string; signature: Hex }>();
  if (!/^0x[0-9a-fA-F]{64}$/.test(pubkey)) return c.json({ error: "Bad key." }, 400);
  const message = KEY_MESSAGE_PREFIX + pubkey.toLowerCase();
  const ok = await client.verifyMessage({ address, message, signature });
  if (!ok) return c.json({ error: "Key signature does not match." }, 400);
  await getStore().putHolderKey({ address, pubkey: pubkey.toLowerCase(), signature, message });
  return c.json({ ok: true });
});

app.get("/keys/:address", async (c) => {
  const a = (c.req.param("address") ?? "");
  if (!isAddress(a)) return c.json({ error: "Bad address." }, 400);
  const k = await getStore().getHolderKey(getAddress(a));
  return k ? c.json(k) : c.json({ error: "No key published." }, 404);
});

// ---------------- job specs ----------------

app.post("/specs", auth, async (c) => {
  const holder = c.get("address");
  const { provider, ciphertext } = await c.req.json<{ provider: string; ciphertext: string }>();
  if (!isAddress(provider) || typeof ciphertext !== "string" || !ciphertext || ciphertext.length > MAX_SPEC) {
    return c.json({ error: "Bad spec." }, 400);
  }
  const hash = keccak256(stringToBytes(ciphertext));
  await getStore().putSpec({ hash, provider: getAddress(provider), holder, ciphertext });
  return c.json({ hash });
});

app.get("/specs/:hash", auth, async (c) => {
  const me = c.get("address");
  const spec = await getStore().getSpec((c.req.param("hash") ?? ""));
  if (!spec) return c.json({ error: "Not found." }, 404);
  if (me !== spec.holder) {
    const rid = c.req.query("rid");
    const r = rid ? await readRedemption(rid) : null;
    if (!r || r.specHash !== spec.hash || getAddress(r.provider) !== me) return c.json({ error: "Not yours." }, 403);
  }
  return c.json(spec);
});

// ---------------- access details ----------------

app.post("/access/:rid", auth, async (c) => {
  const me = c.get("address");
  const rid = (c.req.param("rid") ?? "");
  const r = await readRedemption(rid);
  if (!r) return c.json({ error: "Unknown redemption." }, 404);
  if (getAddress(r.provider) !== me) return c.json({ error: "Only the provider can post access details." }, 403);
  const { ciphertext } = await c.req.json<{ ciphertext: string }>();
  if (typeof ciphertext !== "string" || !ciphertext || ciphertext.length > MAX_SPEC) return c.json({ error: "Bad payload." }, 400);
  const hash = keccak256(stringToBytes(ciphertext));
  if (r.status !== Status.Requested && !(r.status >= Status.Started && r.startProofHash === hash)) {
    return c.json({ error: "Start already confirmed with different access details." }, 409);
  }
  await getStore().putAccess({ redemptionId: rid, ciphertext, hash });
  return c.json({ hash });
});

app.get("/access/:rid", auth, async (c) => {
  const me = c.get("address");
  const rid = (c.req.param("rid") ?? "");
  const r = await readRedemption(rid);
  if (!r) return c.json({ error: "Unknown redemption." }, 404);
  const allowed = getAddress(r.holder) === me || getAddress(r.provider) === me || (r.status === Status.Disputed && (await arbiter()) === me);
  if (!allowed) return c.json({ error: "Not yours." }, 403);
  const a = await getStore().getAccess(rid);
  return a ? c.json({ ...a, onchainHash: r.startProofHash, matches: a.hash === r.startProofHash }) : c.json({ error: "Not posted yet." }, 404);
});

// ---------------- dispute evidence ----------------

app.post("/evidence/:rid", auth, async (c) => {
  const me = c.get("address");
  const rid = (c.req.param("rid") ?? "");
  const r = await readRedemption(rid);
  if (!r) return c.json({ error: "Unknown redemption." }, 404);
  const role = getAddress(r.holder) === me ? "holder" : getAddress(r.provider) === me ? "provider" : null;
  if (!role) return c.json({ error: "Only the holder or the provider can add evidence." }, 403);
  if (r.status !== Status.Started && r.status !== Status.Disputed) return c.json({ error: "Evidence is closed for this redemption." }, 409);
  const { text, image } = await c.req.json<{ text: string; image?: string | null }>();
  if (typeof text !== "string" || text.length > 10_000) return c.json({ error: "Text too long." }, 400);
  if (image && (typeof image !== "string" || image.length > MAX_IMAGE || !image.startsWith("data:image/"))) {
    return c.json({ error: "Image must be a PNG or JPEG under 3 MB." }, 400);
  }
  await getStore().addEvidence({ redemptionId: rid, author: me, role, text, image: image ?? null });
  return c.json({ ok: true });
});

app.get("/evidence/:rid", auth, async (c) => {
  const me = c.get("address");
  const rid = (c.req.param("rid") ?? "");
  const r = await readRedemption(rid);
  if (!r) return c.json({ error: "Unknown redemption." }, 404);
  const allowed = getAddress(r.holder) === me || getAddress(r.provider) === me || (await arbiter()) === me;
  if (!allowed) return c.json({ error: "Not yours." }, 403);
  return c.json(await getStore().listEvidence(rid));
});

// ---------------- provider notifications ----------------

app.post("/contact", auth, async (c) => {
  const me = c.get("address");
  const { webhook, email } = await c.req.json<{ webhook?: string; email?: string }>();
  if (webhook && !safeWebhook(webhook)) return c.json({ error: "Webhook must be a public https URL." }, 400);
  await getStore().putContact({ address: me, webhook: webhook || null, email: email || null });
  return c.json({ ok: true });
});

app.get("/contact", auth, async (c) => c.json((await getStore().getContact(c.get("address"))) ?? {}));

function safeWebhook(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return false;
    const h = url.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

async function notify(rid: string) {
  const r = await readRedemption(rid);
  if (!r || r.status !== Status.Requested) return { sent: false, reason: "not pending" };
  const store = getStore();
  const contact = await store.getContact(getAddress(r.provider));
  if (!contact?.webhook) return { sent: false, reason: "no webhook" };
  if (!(await store.markNotified(rid))) return { sent: false, reason: "already sent" };
  const body = {
    type: "redemption.requested",
    redemptionId: rid,
    series: r.series.toString(),
    holder: r.holder,
    n: r.n.toString(),
    gpuType: r.gpuType,
    durationSeconds: r.duration.toString(),
    startBy: Number(r.startBy),
    secondsLeft: Number(r.startBy) - Math.floor(Date.now() / 1000),
    specHash: r.specHash,
  };
  try {
    await fetch(contact.webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* provider endpoint down; the app queue still shows it */
  }
  return { sent: true };
}

app.post("/notify/:rid", async (c) => c.json(await notify((c.req.param("rid") ?? ""))));

/** Cron: notify providers about recent redemptions that nobody pinged yet. */
app.get("/cron/scan", async (c) => {
  const cs = process.env.CRON_SECRET;
  if (cs && c.req.header("authorization") !== `Bearer ${cs}`) return c.json({ error: "unauthorized" }, 401);
  const latest = await client.getBlockNumber();
  const logs = await client.getLogs({
    address: HUB,
    event: parseAbiItem(
      "event RedemptionRequested(uint256 indexed id, address indexed holder, address indexed provider, uint256 series, uint256 n, uint8 gpuType, uint256 refWad, uint256 reserve, uint64 startBy)",
    ),
    fromBlock: latest > 20_000n ? latest - 20_000n : 0n,
    toBlock: latest,
  });
  const results = [];
  for (const l of logs) results.push(await notify(l.args.id!.toString()));
  return c.json({ scanned: logs.length, sent: results.filter((r) => r.sent).length });
});

app.get("/health", (c) => c.json({ ok: true, chainId: CHAIN_ID, hub: HUB }));

export default app;

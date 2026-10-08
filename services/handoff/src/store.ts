import postgres from "postgres";

/**
 * Storage for the handoff service. Postgres when DATABASE_URL is set; an in-memory map otherwise
 * (local development only — data is lost on restart). The service only ever stores ciphertext.
 */

export type HolderKey = { address: string; pubkey: string; signature: string; message: string };
export type Spec = { hash: string; provider: string; holder: string; ciphertext: string; createdAt: string };
export type Access = { redemptionId: string; ciphertext: string; hash: string; createdAt: string };
export type Evidence = {
  id: number;
  redemptionId: string;
  author: string;
  role: "holder" | "provider";
  text: string;
  image: string | null;
  createdAt: string;
};
export type Contact = { address: string; webhook: string | null; email: string | null };

export interface Store {
  putHolderKey(k: HolderKey): Promise<void>;
  getHolderKey(address: string): Promise<HolderKey | null>;
  putSpec(s: Omit<Spec, "createdAt">): Promise<void>;
  getSpec(hash: string): Promise<Spec | null>;
  putAccess(a: Omit<Access, "createdAt">): Promise<void>;
  getAccess(redemptionId: string): Promise<Access | null>;
  addEvidence(e: Omit<Evidence, "id" | "createdAt">): Promise<void>;
  listEvidence(redemptionId: string): Promise<Evidence[]>;
  putContact(c: Contact): Promise<void>;
  getContact(address: string): Promise<Contact | null>;
  markNotified(redemptionId: string): Promise<boolean>;
}

const now = () => new Date().toISOString();

function memoryStore(): Store {
  const keys = new Map<string, HolderKey>();
  const specs = new Map<string, Spec>();
  const access = new Map<string, Access>();
  const evidence: Evidence[] = [];
  const contacts = new Map<string, Contact>();
  const notified = new Set<string>();
  return {
    async putHolderKey(k) {
      keys.set(k.address, k);
    },
    async getHolderKey(a) {
      return keys.get(a) ?? null;
    },
    async putSpec(s) {
      specs.set(s.hash, { ...s, createdAt: now() });
    },
    async getSpec(h) {
      return specs.get(h) ?? null;
    },
    async putAccess(a) {
      access.set(a.redemptionId, { ...a, createdAt: now() });
    },
    async getAccess(id) {
      return access.get(id) ?? null;
    },
    async addEvidence(e) {
      evidence.push({ ...e, id: evidence.length + 1, createdAt: now() });
    },
    async listEvidence(id) {
      return evidence.filter((e) => e.redemptionId === id);
    },
    async putContact(c) {
      contacts.set(c.address, c);
    },
    async getContact(a) {
      return contacts.get(a) ?? null;
    },
    async markNotified(id) {
      if (notified.has(id)) return false;
      notified.add(id);
      return true;
    },
  };
}

function pgStore(url: string): Store {
  const sql = postgres(url, { max: 3, idle_timeout: 20, prepare: false });
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= sql.begin(async (tx) => {
      await tx`create table if not exists holder_keys (address text primary key, pubkey text not null, signature text not null, message text not null, created_at timestamptz default now())`;
      await tx`create table if not exists specs (hash text primary key, provider text not null, holder text not null, ciphertext text not null, created_at timestamptz default now())`;
      await tx`create table if not exists access (redemption_id text primary key, ciphertext text not null, hash text not null, created_at timestamptz default now())`;
      await tx`create table if not exists evidence (id serial primary key, redemption_id text not null, author text not null, role text not null, text text not null, image text, created_at timestamptz default now())`;
      await tx`create index if not exists evidence_rid on evidence (redemption_id)`;
      await tx`create table if not exists contacts (address text primary key, webhook text, email text)`;
      await tx`create table if not exists notified (redemption_id text primary key, at timestamptz default now())`;
    }));
  const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));
  return {
    async putHolderKey(k) {
      await init();
      await sql`insert into holder_keys (address, pubkey, signature, message) values (${k.address}, ${k.pubkey}, ${k.signature}, ${k.message})
        on conflict (address) do update set pubkey = excluded.pubkey, signature = excluded.signature, message = excluded.message`;
    },
    async getHolderKey(a) {
      await init();
      const [r] = await sql`select * from holder_keys where address = ${a}`;
      return r ? { address: r.address, pubkey: r.pubkey, signature: r.signature, message: r.message } : null;
    },
    async putSpec(s) {
      await init();
      await sql`insert into specs (hash, provider, holder, ciphertext) values (${s.hash}, ${s.provider}, ${s.holder}, ${s.ciphertext}) on conflict (hash) do nothing`;
    },
    async getSpec(h) {
      await init();
      const [r] = await sql`select * from specs where hash = ${h}`;
      return r ? { hash: r.hash, provider: r.provider, holder: r.holder, ciphertext: r.ciphertext, createdAt: iso(r.created_at) } : null;
    },
    async putAccess(a) {
      await init();
      await sql`insert into access (redemption_id, ciphertext, hash) values (${a.redemptionId}, ${a.ciphertext}, ${a.hash})
        on conflict (redemption_id) do update set ciphertext = excluded.ciphertext, hash = excluded.hash`;
    },
    async getAccess(id) {
      await init();
      const [r] = await sql`select * from access where redemption_id = ${id}`;
      return r ? { redemptionId: r.redemption_id, ciphertext: r.ciphertext, hash: r.hash, createdAt: iso(r.created_at) } : null;
    },
    async addEvidence(e) {
      await init();
      await sql`insert into evidence (redemption_id, author, role, text, image) values (${e.redemptionId}, ${e.author}, ${e.role}, ${e.text}, ${e.image})`;
    },
    async listEvidence(id) {
      await init();
      const rows = await sql`select * from evidence where redemption_id = ${id} order by id`;
      return rows.map((r) => ({
        id: r.id,
        redemptionId: r.redemption_id,
        author: r.author,
        role: r.role,
        text: r.text,
        image: r.image,
        createdAt: iso(r.created_at),
      }));
    },
    async putContact(c) {
      await init();
      await sql`insert into contacts (address, webhook, email) values (${c.address}, ${c.webhook}, ${c.email})
        on conflict (address) do update set webhook = excluded.webhook, email = excluded.email`;
    },
    async getContact(a) {
      await init();
      const [r] = await sql`select * from contacts where address = ${a}`;
      return r ? { address: r.address, webhook: r.webhook, email: r.email } : null;
    },
    async markNotified(id) {
      await init();
      const rows = await sql`insert into notified (redemption_id) values (${id}) on conflict do nothing returning redemption_id`;
      return rows.length > 0;
    },
  };
}

let store: Store | null = null;
export function getStore(): Store {
  if (!store) store = process.env.DATABASE_URL ? pgStore(process.env.DATABASE_URL) : memoryStore();
  return store;
}

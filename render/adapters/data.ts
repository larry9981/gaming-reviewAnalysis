import { Pool } from "pg";

export type AuthUser = {
  id: string;
  email: string;
  username?: string | null;
  role: string;
};

type QueryResult<T = Record<string, unknown>> = {
  results?: T[];
  meta?: { changes?: number };
};

const encoder = new TextEncoder();
let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when running on Render.");
  }
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 10),
  });
  return pool;
}

function normalizeSql(sql: string) {
  const upsertTrending =
    "INSERT OR REPLACE INTO trending_cache (cache_key, payload, updated_at) VALUES (?, ?, ?)";
  let normalized = sql.includes(upsertTrending)
    ? sql.replace(
        upsertTrending,
        "INSERT INTO trending_cache (cache_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at",
      )
    : sql;
  let index = 0;
  normalized = normalized.replace(/\?/g, () => `$${++index}`);
  return normalized;
}

function normalizeRow<T>(row: Record<string, unknown>): T {
  const aliases: Record<string, string> = {
    appid: "appId",
    updatedat: "updatedAt",
    createdat: "createdAt",
    registeredat: "registeredAt",
    currentperiodend: "currentPeriodEnd",
    entitlementcreatedat: "entitlementCreatedAt",
    entitlementcount: "entitlementCount",
    entitlementstatus: "entitlementStatus",
    passwordhash: "passwordHash",
    providerref: "providerRef",
    userid: "userId",
  };
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [aliases[key] || key, value])) as T;
}

class BoundStatement {
  constructor(
    private readonly sql: string,
    private readonly params: unknown[],
  ) {}

  async first<T = Record<string, unknown>>() {
    const result = await getPool().query(normalizeSql(this.sql), this.params);
    return result.rows[0] ? normalizeRow<T>(result.rows[0]) : null;
  }

  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const result = await getPool().query(normalizeSql(this.sql), this.params);
    return { results: result.rows.map((row) => normalizeRow<T>(row)) };
  }

  async run(): Promise<QueryResult> {
    const result = await getPool().query(normalizeSql(this.sql), this.params);
    return { meta: { changes: result.rowCount || 0 } };
  }
}

class PreparedStatement {
  constructor(private readonly sql: string) {}

  bind(...params: unknown[]) {
    return new BoundStatement(this.sql, params);
  }

  first<T = Record<string, unknown>>() {
    return new BoundStatement(this.sql, []).first<T>();
  }

  all<T = Record<string, unknown>>() {
    return new BoundStatement(this.sql, []).all<T>();
  }

  run() {
    return new BoundStatement(this.sql, []).run();
  }
}

export function getD1() {
  return {
    prepare(sql: string) {
      return new PreparedStatement(sql);
    },
    async batch(statements: BoundStatement[]) {
      for (const statement of statements) {
        await statement.run();
      }
    },
  };
}

export async function ensureSchema() {
  schemaReady ??= (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entitlements (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        app_id TEXT,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_ref TEXT UNIQUE,
        current_period_end BIGINT,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan TEXT NOT NULL,
        app_id TEXT,
        provider TEXT NOT NULL,
        provider_session_id TEXT,
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS game_reports (
        app_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        risk_score INTEGER NOT NULL,
        verdict TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trending_cache (
        cache_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS password_resets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        used_at BIGINT,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
      CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);
      CREATE INDEX IF NOT EXISTS checkout_provider_idx ON checkout_sessions (provider_session_id);
    `);
  })();
  await schemaReady;
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function hex(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${hex(salt)}:${password}`));
  return `sha256:${hex(salt)}:${hex(digest)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  if (scheme === "sha256") {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${saltHex}:${password}`));
    return hex(digest) === hashHex;
  }
  if (scheme !== "pbkdf2") return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120000 }, key, 256);
  return hex(bits) === hashHex;
}

export function sessionCookie(sessionId: string, expiresAt: number) {
  return `sg_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${new Date(expiresAt).toUTCString()}`;
}

export function clearSessionCookie() {
  return "sg_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getCurrentUser(request: Request): Promise<AuthUser | null> {
  await ensureSchema();
  const sessionId = getCookie(request, "sg_session");
  if (!sessionId) return null;
  const now = Date.now();
  const row = await getD1()
    .prepare(
      "SELECT users.id, users.email, users.username, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?",
    )
    .bind(sessionId, now)
    .first<AuthUser>();
  return row || null;
}

export async function hasReportAccess(userId: string, appId: string) {
  await ensureSchema();
  const now = Date.now();
  const row = await getD1()
    .prepare(
      "SELECT id FROM entitlements WHERE user_id = ? AND status = 'active' AND (kind = 'monthly' OR (kind = 'single' AND app_id = ?) OR (current_period_end IS NOT NULL AND current_period_end > ?)) LIMIT 1",
    )
    .bind(userId, appId, now)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function grantEntitlement({
  userId,
  kind,
  appId,
  provider,
  providerRef,
}: {
  userId: string;
  kind: "single" | "monthly";
  appId?: string;
  provider: string;
  providerRef?: string;
}) {
  await ensureSchema();
  if (providerRef) {
    const existing = await getD1().prepare("SELECT id FROM entitlements WHERE provider_ref = ?").bind(providerRef).first();
    if (existing) return;
  }
  const now = Date.now();
  const periodEnd = kind === "monthly" ? now + 1000 * 60 * 60 * 24 * 31 : null;
  await getD1()
    .prepare(
      "INSERT INTO entitlements (id, user_id, kind, app_id, status, provider, provider_ref, current_period_end, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)",
    )
    .bind(randomId("ent"), userId, kind, appId || null, provider, providerRef || null, periodEnd, now)
    .run();
}

export function isAdmin(user: AuthUser | null) {
  if (!user) return false;
  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return user.role === "admin" || admins.includes(user.email.toLowerCase());
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, { status, headers });
}

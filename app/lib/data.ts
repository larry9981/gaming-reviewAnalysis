import { env } from "cloudflare:workers";

type D1Database = typeof env.DB;

export type AuthUser = {
  id: string;
  email: string;
  role: string;
};

const encoder = new TextEncoder();

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error("D1 binding DB is not configured.");
  }
  return env.DB;
}

export async function ensureSchema() {
  const db = getD1();
  await db.batch([
    db.prepare(
      "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS entitlements (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, app_id TEXT, status TEXT NOT NULL, provider TEXT NOT NULL, provider_ref TEXT, current_period_end INTEGER, created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS checkout_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan TEXT NOT NULL, app_id TEXT, provider TEXT NOT NULL, provider_session_id TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL)",
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS game_reports (app_id TEXT PRIMARY KEY, title TEXT NOT NULL, risk_score INTEGER NOT NULL, verdict TEXT NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS checkout_provider_idx ON checkout_sessions (provider_session_id)"),
  ]);
}

export function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120000,
    },
    key,
    256,
  );
  return `pbkdf2:${hex(salt)}:${hex(bits)}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120000,
    },
    key,
    256,
  );
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
      "SELECT users.id, users.email, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at > ?",
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
    const existing = await getD1()
      .prepare("SELECT id FROM entitlements WHERE provider_ref = ?")
      .bind(providerRef)
      .first();
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
  const admins = (env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return user.role === "admin" || admins.includes(user.email.toLowerCase());
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(data, { status, headers });
}

import { env } from "cloudflare:workers";
import { ensureSchema, getD1, json, randomId } from "../../../lib/data";

const encoder = new TextEncoder();

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function tokenHash(token: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
}

export async function POST(request: Request) {
  await ensureSchema();
  const { email } = (await request.json().catch(() => ({}))) as { email?: string };
  const cleanEmail = (email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return json({ error: "Enter a valid email." }, 400);
  }

  const user = await getD1().prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first<{ id: string }>();
  if (user) {
    const token = randomId("reset");
    const now = Date.now();
    await getD1()
      .prepare("INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(randomId("rst"), user.id, await tokenHash(token), now + 1000 * 60 * 30, now)
      .run();
    if (env.RESET_PASSWORD_WEBHOOK_URL) {
      await fetch(env.RESET_PASSWORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          resetUrl: `${new URL(request.url).origin}/?reset_token=${encodeURIComponent(token)}`,
        }),
      }).catch(() => undefined);
    }
  }

  return json({
    ok: true,
    message: env.RESET_PASSWORD_WEBHOOK_URL
      ? "If an account exists, a reset link has been sent."
      : "Password reset was requested, but email delivery is not configured yet. Add RESET_PASSWORD_WEBHOOK_URL to send reset links.",
  });
}

import { ensureSchema, getD1, hashPassword, json } from "../../../lib/data";

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
  const { token, password } = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  if (!token) return json({ error: "Reset token is missing." }, 400);
  if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

  const now = Date.now();
  const reset = await getD1()
    .prepare("SELECT id, user_id as userId FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(await tokenHash(token), now)
    .first<{ id: string; userId: string }>();
  if (!reset) return json({ error: "Reset link is invalid or expired." }, 400);

  await getD1().batch([
    getD1().prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), reset.userId),
    getD1().prepare("UPDATE password_resets SET used_at = ? WHERE id = ?").bind(now, reset.id),
    getD1().prepare("DELETE FROM sessions WHERE user_id = ?").bind(reset.userId),
  ]);

  return json({ ok: true, message: "Password updated. Please log in with your new password." });
}

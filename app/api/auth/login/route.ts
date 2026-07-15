import { ensureSchema, getD1, json, randomId, sessionCookie, verifyPassword } from "../../../lib/data";

export async function POST(request: Request) {
  await ensureSchema();
  const { email, password } = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const cleanEmail = (email || "").trim().toLowerCase();
  const user = await getD1()
    .prepare("SELECT id, email, role, password_hash as passwordHash FROM users WHERE email = ?")
    .bind(cleanEmail)
    .first<{ id: string; email: string; role: string; passwordHash: string }>();
  if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
    return json({ error: "Invalid email or password." }, 401);
  }
  const sessionId = randomId("ses");
  const now = Date.now();
  const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
  await getD1()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, user.id, expiresAt, now)
    .run();
  return json(
    { user: { id: user.id, email: user.email, role: user.role } },
    200,
    { "Set-Cookie": sessionCookie(sessionId, expiresAt) },
  );
}

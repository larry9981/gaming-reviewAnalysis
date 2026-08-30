import { ensureSchema, getD1, isDataStoreConfigured, json, randomId, sessionCookie, verifyPassword } from "../../../lib/data";

export async function POST(request: Request) {
  if (!isDataStoreConfigured()) {
    return json({ error: "Account service is temporarily unavailable." }, 503);
  }
  try {
    await ensureSchema();
    const { email, password } = (await request.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
    };
    const cleanEmail = (email || "").trim().toLowerCase();
    const user = await getD1()
      .prepare("SELECT id, email, username, role, password_hash as passwordHash FROM users WHERE email = ?")
      .bind(cleanEmail)
      .first<{ id: string; email: string; username?: string | null; role: string; passwordHash: string }>();
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
      { user: { id: user.id, email: user.email, username: user.username, role: user.role } },
      200,
      { "Set-Cookie": sessionCookie(sessionId, expiresAt) },
    );
  } catch (error) {
    console.error("Login failed", error);
    return json({ error: "Login failed. Please try again later." }, 500);
  }
}

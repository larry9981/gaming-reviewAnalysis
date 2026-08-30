import { ensureSchema, getD1, hashPassword, isDataStoreConfigured, json, randomId, sessionCookie } from "../../../lib/data";

export async function POST(request: Request) {
  if (!isDataStoreConfigured()) {
    return json({ error: "Account service is temporarily unavailable." }, 503);
  }
  try {
    await ensureSchema();
    const { username, email, password } = (await request.json().catch(() => ({}))) as {
      username?: string;
      email?: string;
      password?: string;
    };
    const cleanUsername = (username || "").trim();
    const cleanEmail = (email || "").trim().toLowerCase();
    if (cleanUsername.length < 2) {
      return json({ error: "Username must be at least 2 characters." }, 400);
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return json({ error: "Enter a valid email." }, 400);
    }
    if (!password || password.length < 8) {
      return json({ error: "Password must be at least 8 characters." }, 400);
    }
    const existing = await getD1().prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (existing) {
      return json({ error: "An account already exists for this email." }, 409);
    }
    const userId = randomId("usr");
    const sessionId = randomId("ses");
    const now = Date.now();
    const expiresAt = now + 1000 * 60 * 60 * 24 * 30;
    const passwordHash = await hashPassword(password);
    await getD1().batch([
      getD1()
        .prepare("INSERT INTO users (id, email, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)")
        .bind(userId, cleanEmail, cleanUsername, passwordHash, now),
      getD1()
        .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(sessionId, userId, expiresAt, now),
    ]);
    return json(
      { user: { id: userId, email: cleanEmail, username: cleanUsername, role: "user" } },
      200,
      { "Set-Cookie": sessionCookie(sessionId, expiresAt) },
    );
  } catch (error) {
    console.error("Registration failed", error);
    return json({ error: "Registration failed. Please try again later." }, 500);
  }
}

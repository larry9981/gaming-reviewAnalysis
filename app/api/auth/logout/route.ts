import { clearSessionCookie, getCookie, getD1, json } from "../../../lib/data";

export async function POST(request: Request) {
  const sessionId = getCookie(request, "sg_session");
  if (sessionId) {
    await getD1().prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
}

import { ensureSchema, getD1, isDataStoreConfigured, json } from "../../lib/data";

export async function GET() {
  if (!isDataStoreConfigured()) {
    return json({ ok: false, database: "not_configured" }, 503, { "Cache-Control": "no-store" });
  }

  try {
    await ensureSchema();
    await getD1().prepare("SELECT 1 AS ok").first();
    return json({ ok: true, database: "connected" }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("Database health check failed", error);
    return json({ ok: false, database: "unavailable" }, 503, { "Cache-Control": "no-store" });
  }
}

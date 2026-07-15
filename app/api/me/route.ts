import { getCurrentUser, getD1, json } from "../../lib/data";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ user: null, entitlements: [] });
  const entitlements = await getD1()
    .prepare("SELECT kind, app_id as appId, status, current_period_end as currentPeriodEnd, created_at as createdAt FROM entitlements WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id)
    .all();
  return json({ user, entitlements: entitlements.results || [] });
}

import { getCurrentUser, getD1, isAdmin, json } from "../../lib/data";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!isAdmin(user)) return json({ error: "Admin access required." }, 403);

  const [users, entitlements, checkouts] = await Promise.all([
    getD1().prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>(),
    getD1().prepare("SELECT COUNT(*) as count FROM entitlements WHERE status = 'active'").first<{ count: number }>(),
    getD1().prepare("SELECT plan, status, COUNT(*) as count FROM checkout_sessions GROUP BY plan, status").all(),
  ]);
  const [userRows, entitlementRows] = await Promise.all([
    getD1()
      .prepare(
        "SELECT users.id, users.email, users.username, users.role, users.created_at as createdAt, COUNT(entitlements.id) as entitlementCount FROM users LEFT JOIN entitlements ON entitlements.user_id = users.id AND entitlements.status = 'active' GROUP BY users.id ORDER BY users.created_at DESC LIMIT 200",
      )
      .all(),
    getD1()
      .prepare(
        "SELECT entitlements.id, entitlements.user_id as userId, users.email, users.username, entitlements.kind, entitlements.app_id as appId, entitlements.status, entitlements.provider, entitlements.current_period_end as currentPeriodEnd, entitlements.created_at as createdAt FROM entitlements JOIN users ON users.id = entitlements.user_id ORDER BY entitlements.created_at DESC LIMIT 200",
      )
      .all(),
  ]);

  return json({
    users: users?.count || 0,
    activeEntitlements: entitlements?.count || 0,
    checkoutBreakdown: checkouts.results || [],
    userRows: userRows.results || [],
    entitlementRows: entitlementRows.results || [],
  });
}

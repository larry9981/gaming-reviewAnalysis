import { getCurrentUser, getD1, isAdmin, json } from "../../lib/data";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!isAdmin(user)) return json({ error: "Admin access required." }, 403);

  const [users, entitlements, checkouts] = await Promise.all([
    getD1().prepare("SELECT COUNT(*) as count FROM users").first<{ count: number }>(),
    getD1().prepare("SELECT COUNT(*) as count FROM entitlements WHERE status = 'active'").first<{ count: number }>(),
    getD1().prepare("SELECT plan, status, COUNT(*) as count FROM checkout_sessions GROUP BY plan, status").all(),
  ]);

  return json({
    users: users?.count || 0,
    activeEntitlements: entitlements?.count || 0,
    checkoutBreakdown: checkouts.results || [],
  });
}

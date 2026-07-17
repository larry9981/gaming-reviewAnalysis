import { getCurrentUser, getD1, json } from "../../../lib/data";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Log in before cancelling a subscription." }, 401);

  const now = Date.now();
  const result = await getD1()
    .prepare("UPDATE entitlements SET status = 'cancelled', current_period_end = ? WHERE user_id = ? AND kind = 'monthly' AND status = 'active'")
    .bind(now, user.id)
    .run();

  return json({
    ok: true,
    cancelled: result.meta?.changes || 0,
    message:
      "Your local monthly access has been cancelled. If this subscription was created through an external payment provider, also cancel it in that provider dashboard until provider-side cancellation is connected.",
  });
}

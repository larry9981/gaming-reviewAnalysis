import { getCurrentUser, getD1, json } from "../../../lib/data";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Log in before cancelling a subscription." }, 401);

  const subscription = await getD1()
    .prepare(
      "SELECT id FROM entitlements WHERE user_id = ? AND kind = 'monthly' AND provider = 'paypal' AND status = 'active' LIMIT 1",
    )
    .bind(user.id)
    .first<{ id: string }>();
  if (!subscription) return json({ error: "No active PayPal subscription was found." }, 404);

  return json({
    ok: true,
    manageUrl: "https://www.paypal.com/myaccount/autopay/",
    message: "Continue in PayPal to stop future automatic payments. Your access remains active through the paid period.",
  });
}

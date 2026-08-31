import { getCurrentUser, getD1, json } from "../../../lib/data";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Log in to check PayPal payment status." }, 401);

  const checkoutId = new URL(request.url).searchParams.get("checkout") || "";
  if (!checkoutId) return json({ error: "Missing PayPal checkout ID." }, 400);

  const checkout = await getD1()
    .prepare(
      "SELECT status, provider_session_id as providerSessionId FROM checkout_sessions WHERE id = ? AND user_id = ? AND provider = 'paypal' LIMIT 1",
    )
    .bind(checkoutId, user.id)
    .first<{ status: string; providerSessionId?: string | null }>();
  if (!checkout) return json({ error: "PayPal checkout was not found." }, 404);

  return json({
    status: checkout.status,
    paid: checkout.status === "paid",
    providerRef: checkout.status === "paid" ? checkout.providerSessionId : undefined,
  });
}

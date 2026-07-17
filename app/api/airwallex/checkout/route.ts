import { ensureSchema, getCurrentUser, getD1, json, randomId } from "../../../lib/data";
import { createAirwallexPaymentIntent } from "../../../lib/airwallex";
import type { CheckoutPlan } from "../../../lib/payments";

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Create an account or log in before card checkout." }, 401);

  const { plan, appId } = (await request.json().catch(() => ({}))) as {
    plan?: CheckoutPlan;
    appId?: string;
  };
  if (plan !== "single" && plan !== "monthly") return json({ error: "Unknown Airwallex plan." }, 400);
  if (plan === "single" && !appId) return json({ error: "Single report checkout requires an app ID." }, 400);

  try {
    const checkout = await createAirwallexPaymentIntent({
      plan,
      appId,
      userId: user.id,
      email: user.email,
      origin: new URL(request.url).origin,
    });
    await getD1()
      .prepare(
        "INSERT INTO checkout_sessions (id, user_id, plan, app_id, provider, provider_session_id, status, created_at) VALUES (?, ?, ?, ?, 'airwallex', ?, 'created', ?)",
      )
      .bind(randomId("chk"), user.id, plan, appId || null, checkout.id, Date.now())
      .run();
    return json(checkout);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Airwallex checkout failed." }, 502);
  }
}

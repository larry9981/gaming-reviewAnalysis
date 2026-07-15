import { ensureSchema, getCurrentUser, getD1, json, randomId } from "../../lib/data";
import { createStripeCheckoutSession, type CheckoutPlan } from "../../lib/payments";

export async function POST(request: Request) {
  await ensureSchema();
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Create an account or log in before checkout." }, 401);

  const { plan, appId } = (await request.json().catch(() => ({}))) as {
    plan?: CheckoutPlan;
    appId?: string;
  };
  if (plan !== "single" && plan !== "monthly") return json({ error: "Unknown checkout plan." }, 400);
  if (plan === "single" && !appId) return json({ error: "Single report checkout requires an app ID." }, 400);

  try {
    const origin = new URL(request.url).origin;
    const session = await createStripeCheckoutSession({
      plan,
      appId,
      userId: user.id,
      email: user.email,
      origin,
    });
    await getD1()
      .prepare(
        "INSERT INTO checkout_sessions (id, user_id, plan, app_id, provider, provider_session_id, status, created_at) VALUES (?, ?, ?, ?, 'stripe', ?, 'created', ?)",
      )
      .bind(randomId("chk"), user.id, plan, appId || null, session.id, Date.now())
      .run();
    return json({ checkoutUrl: session.url });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Checkout failed." }, 502);
  }
}

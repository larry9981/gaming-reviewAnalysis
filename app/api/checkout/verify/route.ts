import { ensureSchema, getD1, grantEntitlement, json } from "../../../lib/data";
import { getStripeCheckoutSession, type CheckoutPlan } from "../../../lib/payments";

export async function POST(request: Request) {
  const { sessionId } = (await request.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId) return json({ error: "Missing checkout session." }, 400);
  try {
    const session = await getStripeCheckoutSession(sessionId);
    const plan = session.metadata?.plan;
    const userId = session.metadata?.userId;
    if (!plan || !userId) return json({ error: "Checkout session has no entitlement metadata." }, 400);
    if (session.status === "complete" || session.payment_status === "paid") {
      await grantEntitlement({
        userId,
        kind: plan,
        appId: session.metadata?.appId || undefined,
        provider: "stripe",
        providerRef: session.subscription || session.payment_intent || session.id,
      });
      await getD1()
        .prepare("UPDATE checkout_sessions SET status = 'paid' WHERE provider_session_id = ?")
        .bind(sessionId)
        .run();
      return json({ ok: true });
    }
    return json({ error: "Checkout is not complete yet." }, 409);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Checkout verification failed." }, 502);
  }
}

import { ensureSchema, getD1, grantEntitlement, json } from "../../../lib/data";
import { getAirwallexPaymentIntent } from "../../../lib/airwallex";

export async function POST(request: Request) {
  await ensureSchema();
  const { intentId } = (await request.json().catch(() => ({}))) as { intentId?: string };
  if (!intentId) return json({ error: "Missing Airwallex payment intent." }, 400);

  try {
    const intent = await getAirwallexPaymentIntent(intentId);
    if (intent.status !== "SUCCEEDED") {
      return json({ error: "Airwallex payment is not complete yet." }, 409);
    }

    let userId = intent.metadata?.userId;
    let plan = intent.metadata?.plan;
    let appId = intent.metadata?.appId || undefined;
    if (!userId || (plan !== "single" && plan !== "monthly")) {
      const row = await getD1()
        .prepare(
          "SELECT user_id as userId, plan, app_id as appId FROM checkout_sessions WHERE provider_session_id = ? AND provider = 'airwallex' LIMIT 1",
        )
        .bind(intentId)
        .first<{ userId: string; plan: "single" | "monthly"; appId?: string | null }>();
      userId = row?.userId;
      plan = row?.plan;
      appId = row?.appId || undefined;
    }

    if (!userId || (plan !== "single" && plan !== "monthly")) {
      return json({ error: "Airwallex payment has no entitlement metadata." }, 400);
    }

    await grantEntitlement({
      userId,
      kind: plan,
      appId,
      provider: "airwallex",
      providerRef: intent.id,
    });
    await getD1()
      .prepare("UPDATE checkout_sessions SET status = 'paid' WHERE provider_session_id = ?")
      .bind(intentId)
      .run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Airwallex verification failed." }, 502);
  }
}

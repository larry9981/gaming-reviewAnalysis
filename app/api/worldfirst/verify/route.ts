import { ensureSchema, getD1, grantEntitlement, json } from "../../../lib/data";
import { getWorldFirstPayment } from "../../../lib/worldfirst";

function isPaid(status: string) {
  return ["SUCCESS", "SUCCEEDED", "SUCCESSFUL", "COMPLETED", "PAID"].includes(status.toUpperCase());
}

export async function POST(request: Request) {
  await ensureSchema();
  const body = (await request.json().catch(() => ({}))) as { paymentRequestId?: string; payment_request_id?: string };
  const paymentRequestId = body.paymentRequestId || body.payment_request_id;
  if (!paymentRequestId) return json({ error: "Missing WorldFirst payment request." }, 400);

  try {
    const payment = await getWorldFirstPayment(paymentRequestId);
    if (!isPaid(payment.status)) {
      return json({ error: "WorldFirst payment is not complete yet." }, 409);
    }

    const row = await getD1()
      .prepare(
        "SELECT user_id as userId, plan, app_id as appId FROM checkout_sessions WHERE provider_session_id = ? AND provider = 'worldfirst' LIMIT 1",
      )
      .bind(paymentRequestId)
      .first<{ userId: string; plan: "single" | "monthly"; appId?: string | null }>();

    if (!row?.userId || (row.plan !== "single" && row.plan !== "monthly")) {
      return json({ error: "WorldFirst payment has no entitlement metadata." }, 400);
    }

    await grantEntitlement({
      userId: row.userId,
      kind: row.plan,
      appId: row.appId || undefined,
      provider: "worldfirst",
      providerRef: payment.id,
    });
    await getD1()
      .prepare("UPDATE checkout_sessions SET status = 'paid' WHERE provider_session_id = ?")
      .bind(paymentRequestId)
      .run();
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "WorldFirst verification failed." }, 502);
  }
}

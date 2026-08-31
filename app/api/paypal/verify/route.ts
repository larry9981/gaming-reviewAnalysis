import { getCurrentUser, grantEntitlement, json } from "../../../lib/data";
import { capturePayPalOrder, getPayPalSubscription } from "../../../lib/paypal";

function parseCustomId(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as { userId?: string; plan?: "single" | "monthly"; appId?: string };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return json({ error: "Log in before confirming a PayPal payment." }, 401);

  const { orderId, subscriptionId } = (await request.json().catch(() => ({}))) as {
    orderId?: string;
    subscriptionId?: string;
  };
  try {
    if (orderId) {
      const order = await capturePayPalOrder(orderId);
      const meta = parseCustomId(order.purchase_units?.[0]?.custom_id);
      if (order.status !== "COMPLETED" || meta?.userId !== user.id || meta.plan !== "single") {
        return json({ error: "PayPal order is not complete." }, 409);
      }
      await grantEntitlement({
        userId: meta.userId,
        kind: "single",
        appId: meta.appId,
        provider: "paypal",
        providerRef: order.id,
      });
      return json({ ok: true });
    }

    if (subscriptionId) {
      const subscription = await getPayPalSubscription(subscriptionId);
      const meta = parseCustomId(subscription.custom_id);
      if (subscription.status !== "ACTIVE" || meta?.userId !== user.id) {
        return json({ error: "PayPal subscription is not active yet." }, 409);
      }
      await grantEntitlement({
        userId: meta.userId,
        kind: "monthly",
        appId: meta.appId,
        provider: "paypal",
        providerRef: subscription.id,
      });
      return json({ ok: true });
    }

    return json({ error: "Missing PayPal order or subscription ID." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "PayPal verification failed." }, 502);
  }
}

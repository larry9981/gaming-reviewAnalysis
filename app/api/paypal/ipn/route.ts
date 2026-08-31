import { ensureSchema, getD1, randomId } from "../../../lib/data";
import { getPayPalSettings, getPricingSettings } from "../../../lib/payment-settings";

const MONTH_MS = 1000 * 60 * 60 * 24 * 31;

function empty(status = 200) {
  return new Response("", { status, headers: { "Content-Type": "text/plain" } });
}

async function verifyIpn(rawBody: string, paypalEnv?: string) {
  const endpoint =
    paypalEnv === "sandbox"
      ? "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"
      : "https://ipnpb.paypal.com/cgi-bin/webscr";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Steam-Guardrail-PayPal-IPN/1.0",
    },
    body: `cmd=_notify-validate&${rawBody}`,
  });
  return response.ok && (await response.text()).trim() === "VERIFIED";
}

type PayPalCheckout = {
  userId: string;
  plan: string;
  appId?: string | null;
};

async function handleSinglePayment(params: URLSearchParams, checkoutId: string, checkout: PayPalCheckout) {
  if (!checkout.appId) return;

  const paymentStatus = params.get("payment_status") || "";
  if (["Refunded", "Reversed"].includes(paymentStatus)) {
    const originalTransactionId = params.get("parent_txn_id") || params.get("txn_id") || "";
    if (originalTransactionId) {
      await getD1()
        .prepare("UPDATE entitlements SET status = 'cancelled', current_period_end = ? WHERE provider_ref = ?")
        .bind(Date.now(), originalTransactionId)
        .run();
    }
    return;
  }

  const eventType = params.get("txn_type") || "";
  if (eventType !== "web_accept" || paymentStatus !== "Completed") return;

  const pricing = await getPricingSettings();
  const paidCents = Math.round(Number(params.get("mc_gross") || "") * 100);
  const quantity = params.get("quantity") || "1";
  if (
    params.get("mc_currency") !== "USD" ||
    paidCents !== pricing.singleAmountCents ||
    quantity !== "1" ||
    params.get("invoice") !== checkoutId ||
    params.get("item_number") !== checkout.appId
  ) {
    return;
  }

  const transactionId = params.get("txn_id") || "";
  if (!transactionId) return;
  const existingEvent = await getD1()
    .prepare(
      "SELECT id FROM payment_events WHERE provider = 'paypal-ipn' AND provider_event_id = ? AND event_type = ? AND status = ? LIMIT 1",
    )
    .bind(transactionId, eventType, paymentStatus)
    .first<{ id: string }>();
  if (existingEvent) return;

  const now = Date.now();
  try {
    await getD1().batch([
      getD1()
        .prepare(
          "INSERT INTO payment_events (id, provider, provider_event_id, event_type, status, created_at) VALUES (?, 'paypal-ipn', ?, ?, ?, ?)",
        )
        .bind(randomId("evt"), transactionId, eventType, paymentStatus, now),
      getD1()
        .prepare(
          "INSERT INTO entitlements (id, user_id, kind, app_id, status, provider, provider_ref, current_period_end, created_at) VALUES (?, ?, 'single', ?, 'active', 'paypal', ?, ?, ?)",
        )
        .bind(randomId("ent"), checkout.userId, checkout.appId, transactionId, now + MONTH_MS, now),
      getD1()
        .prepare("UPDATE checkout_sessions SET provider_session_id = ?, status = 'paid' WHERE id = ?")
        .bind(transactionId, checkoutId),
    ]);
  } catch (error) {
    const duplicate = await getD1()
      .prepare(
        "SELECT id FROM payment_events WHERE provider = 'paypal-ipn' AND provider_event_id = ? AND event_type = ? AND status = ? LIMIT 1",
      )
      .bind(transactionId, eventType, paymentStatus)
      .first<{ id: string }>();
    if (!duplicate) throw error;
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!rawBody) return empty();

  const settings = await getPayPalSettings().catch(() => null);
  if (!settings) return empty(503);

  let verified = false;
  try {
    verified = await verifyIpn(rawBody, settings.env);
  } catch {
    return empty(503);
  }
  if (!verified) return empty();

  const params = new URLSearchParams(rawBody);
  const expectedReceiver = (settings.receiverEmail || "").trim().toLowerCase();
  const receivers = [params.get("receiver_email"), params.get("business")]
    .filter(Boolean)
    .map((value) => value!.trim().toLowerCase());
  if (!expectedReceiver || !receivers.includes(expectedReceiver)) return empty();

  const paymentStatus = params.get("payment_status") || "";
  const parentTransactionId = params.get("parent_txn_id") || "";
  if (["Refunded", "Reversed"].includes(paymentStatus) && parentTransactionId) {
    await ensureSchema();
    await getD1()
      .prepare("UPDATE entitlements SET status = 'cancelled', current_period_end = ? WHERE provider_ref = ?")
      .bind(Date.now(), parentTransactionId)
      .run();
    return empty();
  }

  const checkoutId = params.get("custom") || "";
  const eventType = params.get("txn_type") || "";
  if (!checkoutId) return empty();

  await ensureSchema();
  const checkout = await getD1()
    .prepare(
      "SELECT user_id as userId, plan, app_id as appId FROM checkout_sessions WHERE id = ? AND provider = 'paypal' LIMIT 1",
    )
    .bind(checkoutId)
    .first<PayPalCheckout>();
  if (!checkout) return empty();

  if (checkout.plan === "single") {
    await handleSinglePayment(params, checkoutId, checkout);
    return empty();
  }
  if (checkout.plan !== "monthly") return empty();

  const subscriptionId = params.get("subscr_id") || "";
  if (!subscriptionId) return empty();

  if (["subscr_cancel", "subscr_eot"].includes(eventType)) {
    await getD1().batch([
      getD1()
        .prepare("UPDATE checkout_sessions SET provider_session_id = ?, status = 'cancelled' WHERE id = ?")
        .bind(subscriptionId, checkoutId),
      getD1()
        .prepare("UPDATE entitlements SET status = 'cancelled', current_period_end = ? WHERE provider_ref = ?")
        .bind(Date.now(), subscriptionId),
    ]);
    return empty();
  }

  if (eventType === "subscr_signup") {
    await getD1()
      .prepare("UPDATE checkout_sessions SET provider_session_id = ?, status = 'pending' WHERE id = ?")
      .bind(subscriptionId, checkoutId)
      .run();
    return empty();
  }

  if (eventType !== "subscr_payment") return empty();
  if (["Refunded", "Reversed"].includes(paymentStatus)) {
    await getD1()
      .prepare("UPDATE entitlements SET status = 'cancelled', current_period_end = ? WHERE provider_ref = ?")
      .bind(Date.now(), subscriptionId)
      .run();
    return empty();
  }
  if (paymentStatus !== "Completed") return empty();

  const pricing = await getPricingSettings();
  const paidCents = Math.round(Number(params.get("mc_gross") || "") * 100);
  if (params.get("mc_currency") !== "USD" || paidCents !== pricing.monthlyAmountCents) return empty();

  const transactionId = params.get("txn_id") || "";
  if (!transactionId) return empty();
  const existingEvent = await getD1()
    .prepare(
      "SELECT id FROM payment_events WHERE provider = 'paypal-ipn' AND provider_event_id = ? AND event_type = ? AND status = ? LIMIT 1",
    )
    .bind(transactionId, eventType, paymentStatus)
    .first<{ id: string }>();
  if (existingEvent) return empty();

  const now = Date.now();
  const entitlement = await getD1()
    .prepare("SELECT id, current_period_end as currentPeriodEnd FROM entitlements WHERE provider_ref = ? LIMIT 1")
    .bind(subscriptionId)
    .first<{ id: string; currentPeriodEnd?: number | null }>();
  const periodEnd = Math.max(now, Number(entitlement?.currentPeriodEnd || 0)) + MONTH_MS;
  const eventStatement = getD1()
    .prepare(
      "INSERT INTO payment_events (id, provider, provider_event_id, event_type, status, created_at) VALUES (?, 'paypal-ipn', ?, ?, ?, ?)",
    )
    .bind(randomId("evt"), transactionId, eventType, paymentStatus, now);
  const entitlementStatement = entitlement
    ? getD1()
        .prepare("UPDATE entitlements SET status = 'active', current_period_end = ? WHERE id = ?")
        .bind(periodEnd, entitlement.id)
    : getD1()
        .prepare(
          "INSERT INTO entitlements (id, user_id, kind, app_id, status, provider, provider_ref, current_period_end, created_at) VALUES (?, ?, 'monthly', ?, 'active', 'paypal', ?, ?, ?)",
        )
        .bind(randomId("ent"), checkout.userId, checkout.appId || null, subscriptionId, periodEnd, now);

  try {
    await getD1().batch([
      eventStatement,
      entitlementStatement,
      getD1()
        .prepare("UPDATE checkout_sessions SET provider_session_id = ?, status = 'paid' WHERE id = ?")
        .bind(subscriptionId, checkoutId),
    ]);
  } catch (error) {
    const duplicate = await getD1()
      .prepare(
        "SELECT id FROM payment_events WHERE provider = 'paypal-ipn' AND provider_event_id = ? AND event_type = ? AND status = ? LIMIT 1",
      )
      .bind(transactionId, eventType, paymentStatus)
      .first<{ id: string }>();
    if (!duplicate) throw error;
  }
  return empty();
}

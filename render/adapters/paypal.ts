import { getPayPalSettings } from "./payment-settings";
import { planConfig } from "./payments";

export type PayPalPlan = "single" | "monthly";

function paypalBaseUrl(paypalEnv?: string) {
  return paypalEnv === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

type ResolvedPayPalSettings = Awaited<ReturnType<typeof getPayPalSettings>>;

async function paypalAccessToken(settingsOverride?: ResolvedPayPalSettings) {
  const settings = settingsOverride || (await getPayPalSettings());
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error("PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  const credentials = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString("base64");
  const response = await fetch(`${paypalBaseUrl(settings.env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    const message =
      data.error_description === "Client Authentication failed"
        ? "PayPal credentials are not accepted. Check that PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are from the same Live PayPal app."
        : data.error_description || "Could not authenticate with PayPal.";
    throw new Error(message);
  }
  return { accessToken: data.access_token, settings };
}

function approveLink(links?: { href?: string; rel?: string }[]) {
  return links?.find((link) => link.rel === "approve")?.href;
}

export function buildPayPalHostedButtonUrl({
  buttonId,
  checkoutId,
  origin,
  paypalEnv,
  itemNumber,
}: {
  buttonId: string;
  checkoutId: string;
  origin: string;
  paypalEnv?: string;
  itemNumber?: string;
}) {
  const host = paypalEnv === "sandbox" ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  const url = new URL("/cgi-bin/webscr", host);
  url.searchParams.set("cmd", "_s-xclick");
  url.searchParams.set("hosted_button_id", buttonId);
  url.searchParams.set("custom", checkoutId);
  url.searchParams.set("invoice", checkoutId);
  if (itemNumber) url.searchParams.set("item_number", itemNumber);
  url.searchParams.set("notify_url", `${origin}/api/paypal/ipn`);
  url.searchParams.set("return", `${origin}/?paypal_hosted=success&checkout=${encodeURIComponent(checkoutId)}`);
  url.searchParams.set("cancel_return", `${origin}/?paypal=cancelled`);
  url.searchParams.set("rm", "1");
  url.searchParams.set("no_shipping", "1");
  return url.toString();
}

export function buildPayPalBuyNowUrl({
  receiverEmail,
  checkoutId,
  appId,
  amountCents,
  origin,
  paypalEnv,
}: {
  receiverEmail: string;
  checkoutId: string;
  appId: string;
  amountCents: number;
  origin: string;
  paypalEnv?: string;
}) {
  const host = paypalEnv === "sandbox" ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  const url = new URL("/cgi-bin/webscr", host);
  url.searchParams.set("cmd", "_xclick");
  url.searchParams.set("business", receiverEmail);
  url.searchParams.set("item_name", `Steam Guardrail full report ${appId}`);
  url.searchParams.set("item_number", appId);
  url.searchParams.set("amount", (amountCents / 100).toFixed(2));
  url.searchParams.set("currency_code", "USD");
  url.searchParams.set("custom", checkoutId);
  url.searchParams.set("invoice", checkoutId);
  url.searchParams.set("notify_url", `${origin}/api/paypal/ipn`);
  url.searchParams.set("return", `${origin}/?paypal_hosted=success&checkout=${encodeURIComponent(checkoutId)}`);
  url.searchParams.set("cancel_return", `${origin}/?paypal=cancelled`);
  url.searchParams.set("rm", "1");
  url.searchParams.set("no_shipping", "1");
  return url.toString();
}

export async function createPayPalCheckout({
  plan,
  appId,
  userId,
  origin,
  checkoutId,
}: {
  plan: PayPalPlan;
  appId?: string;
  userId: string;
  origin: string;
  checkoutId: string;
}) {
  const settings = await getPayPalSettings();
  const config = await planConfig(plan, appId);

  if (plan === "single") {
    if (!appId) throw new Error("Single report checkout requires an app ID.");
    if (!settings.receiverEmail) {
      throw new Error("PayPal receiver email is required for secure payment verification.");
    }
    if (settings.singleHostedButtonId) {
      return {
        id: settings.singleHostedButtonId,
        url: buildPayPalHostedButtonUrl({
          buttonId: settings.singleHostedButtonId,
          checkoutId,
          origin,
          paypalEnv: settings.env,
          itemNumber: appId,
        }),
        expectedAmountCents: config.amount,
        currency: "USD",
        accessDays: 30,
      };
    }
    return {
      id: `standard:${checkoutId}`,
      url: buildPayPalBuyNowUrl({
        receiverEmail: settings.receiverEmail,
        checkoutId,
        appId,
        amountCents: config.amount,
        origin,
        paypalEnv: settings.env,
      }),
      expectedAmountCents: config.amount,
      currency: "USD",
      accessDays: 30,
    };
  }

  if (plan === "monthly" && settings.monthlyHostedButtonId) {
    if (!settings.receiverEmail) {
      throw new Error("PayPal receiver email is required for secure Hosted Button verification.");
    }
    return {
      id: settings.monthlyHostedButtonId,
      url: buildPayPalHostedButtonUrl({
        buttonId: settings.monthlyHostedButtonId,
        checkoutId,
        origin,
        paypalEnv: settings.env,
      }),
      expectedAmountCents: config.amount,
      currency: "USD",
      accessDays: null,
    };
  }

  const { accessToken } = await paypalAccessToken(settings);

  if (!settings.monthlyPlanId) {
    throw new Error("PayPal monthly subscription requires a Hosted Button ID or PAYPAL_MONTHLY_PLAN_ID.");
  }
  const response = await fetch(`${paypalBaseUrl(settings.env)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: settings.monthlyPlanId,
      custom_id: JSON.stringify({ userId, plan, appId }),
      application_context: {
        brand_name: "Steam Guardrail",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${origin}/?paypal_subscription=success`,
        cancel_url: `${origin}/?paypal=cancelled`,
      },
    }),
  });
  const data = (await response.json()) as { id?: string; links?: { href?: string; rel?: string }[]; message?: string };
  const url = approveLink(data.links);
  if (!response.ok || !data.id || !url) throw new Error(data.message || "PayPal subscription could not be created.");
  return { id: data.id, url, expectedAmountCents: config.amount, currency: "USD", accessDays: null };
}

export async function updatePayPalMonthlyPlanPrice(amountCents: number, settingsOverride?: ResolvedPayPalSettings) {
  const { accessToken, settings } = await paypalAccessToken(settingsOverride);
  if (!settings.monthlyPlanId) throw new Error("PayPal monthly plan ID is not configured.");

  const planUrl = `${paypalBaseUrl(settings.env)}/v1/billing/plans/${encodeURIComponent(settings.monthlyPlanId)}`;
  const planResponse = await fetch(planUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  const plan = (await planResponse.json().catch(() => ({}))) as {
    billing_cycles?: Array<{ sequence?: number; tenure_type?: string }>;
    message?: string;
  };
  if (!planResponse.ok) throw new Error(plan.message || "PayPal monthly plan could not be loaded.");
  const regularSequence = plan.billing_cycles?.find((cycle) => cycle.tenure_type === "REGULAR")?.sequence;
  if (!regularSequence) throw new Error("PayPal monthly plan has no regular billing cycle.");

  const response = await fetch(`${planUrl}/update-pricing-schemes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pricing_schemes: [
        {
          billing_cycle_sequence: regularSequence,
          pricing_scheme: { fixed_price: { value: (amountCents / 100).toFixed(2), currency_code: "USD" } },
        },
      ],
    }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || "PayPal monthly plan price could not be updated.");
  }
}

export async function capturePayPalOrder(orderId: string) {
  const { accessToken, settings } = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl(settings.env)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const data = (await response.json()) as {
    id?: string;
    status?: string;
    purchase_units?: { custom_id?: string }[];
    message?: string;
  };
  if (!response.ok) throw new Error(data.message || "PayPal capture failed.");
  return data;
}

export async function getPayPalSubscription(subscriptionId: string) {
  const { accessToken, settings } = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl(settings.env)}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as { id?: string; status?: string; custom_id?: string; message?: string };
  if (!response.ok) throw new Error(data.message || "PayPal subscription lookup failed.");
  return data;
}

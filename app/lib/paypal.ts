import { env } from "cloudflare:workers";

export type PayPalPlan = "single" | "monthly";

function paypalBaseUrl() {
  return env.PAYPAL_ENV === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

async function paypalAccessToken() {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
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
  return data.access_token;
}

function approveLink(links?: { href?: string; rel?: string }[]) {
  return links?.find((link) => link.rel === "approve")?.href;
}

export async function createPayPalCheckout({
  plan,
  appId,
  userId,
  origin,
}: {
  plan: PayPalPlan;
  appId?: string;
  userId: string;
  origin: string;
}) {
  const accessToken = await paypalAccessToken();

  if (plan === "single") {
    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: JSON.stringify({ userId, plan, appId }),
            description: `Steam Guardrail full report ${appId || ""}`.trim(),
            amount: {
              currency_code: "USD",
              value: "29.99",
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: `${origin}/?paypal=success`,
              cancel_url: `${origin}/?paypal=cancelled`,
            },
          },
        },
      }),
    });
    const data = (await response.json()) as { id?: string; links?: { href?: string; rel?: string }[]; message?: string };
    const url = approveLink(data.links);
    if (!response.ok || !data.id || !url) throw new Error(data.message || "PayPal order could not be created.");
    return { id: data.id, url };
  }

  if (!env.PAYPAL_MONTHLY_PLAN_ID) {
    throw new Error("PayPal monthly subscription requires PAYPAL_MONTHLY_PLAN_ID.");
  }
  const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: env.PAYPAL_MONTHLY_PLAN_ID,
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
  return { id: data.id, url };
}

export async function capturePayPalOrder(orderId: string) {
  const accessToken = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
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
  const accessToken = await paypalAccessToken();
  const response = await fetch(`${paypalBaseUrl()}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as { id?: string; status?: string; custom_id?: string; message?: string };
  if (!response.ok) throw new Error(data.message || "PayPal subscription lookup failed.");
  return data;
}

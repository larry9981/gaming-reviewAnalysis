import { env } from "cloudflare:workers";
import { planConfig, type CheckoutPlan } from "./payments";
import { getAirwallexSettings } from "./payment-settings";

type AirwallexToken = {
  token?: string;
  expires_at?: string;
  message?: string;
  code?: string;
};

export type AirwallexIntent = {
  id?: string;
  client_secret?: string;
  status?: string;
  amount?: number;
  currency?: string;
  metadata?: {
    userId?: string;
    plan?: CheckoutPlan;
    appId?: string;
  };
  message?: string;
  code?: string;
};

function isDemoEnv(airwallexEnv?: string) {
  return airwallexEnv === "demo" || airwallexEnv === "sandbox";
}

function airwallexBaseUrl(airwallexEnv?: string) {
  return isDemoEnv(airwallexEnv)
    ? "https://api-demo.airwallex.com"
    : "https://api.airwallex.com";
}

function airwallexSdkEnv(airwallexEnv?: string) {
  return isDemoEnv(airwallexEnv) ? "demo" : "prod";
}

async function airwallexAccessToken() {
  const settings = await getAirwallexSettings();
  if (!settings.clientId || !settings.apiKey) {
    throw new Error("Airwallex is not configured. Add AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": settings.clientId,
    "x-api-key": settings.apiKey,
  };
  if (settings.accountId) headers["x-login-as"] = settings.accountId;

  const response = await fetch(`${airwallexBaseUrl(settings.env)}/api/v1/authentication/login`, {
    method: "POST",
    headers,
  });
  const data = (await response.json()) as AirwallexToken;
  if (!response.ok || !data.token) {
    throw new Error(data.message || data.code || "Could not authenticate with Airwallex.");
  }
  return { accessToken: data.token, settings };
}

export async function createAirwallexPaymentIntent({
  plan,
  appId,
  userId,
  email,
  origin,
}: {
  plan: CheckoutPlan;
  appId?: string;
  userId: string;
  email: string;
  origin: string;
}) {
  const { accessToken, settings } = await airwallexAccessToken();
  const config = await planConfig(plan, appId);
  const currency = settings.currency || env.AIRWALLEX_CURRENCY || "USD";
  const requestId = crypto.randomUUID();
  const merchantOrderId = `sg-${requestId}`;
  const response = await fetch(`${airwallexBaseUrl(settings.env)}/api/v1/pa/payment_intents/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      request_id: requestId,
      amount: config.amount / 100,
      currency,
      merchant_order_id: merchantOrderId,
      descriptor: "Steam Guardrail",
      return_url: `${origin}/?airwallex=success`,
      customer: { email },
      metadata: {
        userId,
        plan,
        appId: appId || "",
      },
    }),
  });
  const data = (await response.json()) as AirwallexIntent;
  if (!response.ok || !data.id || !data.client_secret) {
    const message = data.message || data.code || "Airwallex payment intent could not be created.";
    if (/merchant configuration|account manager|no available payment methods|not configured/i.test(message)) {
      throw new Error(
        "Airwallex merchant configuration does not currently allow this checkout. Enable online card payments for the selected currency/country in Airwallex, or ask your Airwallex account manager to activate it.",
      );
    }
    throw new Error(message);
  }
  return {
    id: data.id,
    clientSecret: data.client_secret,
    currency,
    countryCode: settings.countryCode || "US",
    env: airwallexSdkEnv(settings.env),
    successUrl: `${origin}/?airwallex=success&intent_id=${encodeURIComponent(data.id)}`,
    cancelUrl: `${origin}/?airwallex=cancelled`,
  };
}

export async function getAirwallexPaymentIntent(intentId: string) {
  const { accessToken, settings } = await airwallexAccessToken();
  const response = await fetch(`${airwallexBaseUrl(settings.env)}/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = (await response.json()) as AirwallexIntent;
  if (!response.ok) {
    throw new Error(data.message || data.code || "Airwallex payment intent lookup failed.");
  }
  return data;
}

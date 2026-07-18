import { env } from "cloudflare:workers";
import { planConfig, type CheckoutPlan } from "./payments";

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

function airwallexBaseUrl() {
  return env.AIRWALLEX_ENV === "demo" || env.AIRWALLEX_ENV === "sandbox"
    ? "https://api-demo.airwallex.com"
    : "https://api.airwallex.com";
}

function airwallexSdkEnv() {
  return env.AIRWALLEX_ENV === "demo" || env.AIRWALLEX_ENV === "sandbox" ? "demo" : "prod";
}

function airwallexCountryCode() {
  return env.AIRWALLEX_COUNTRY_CODE || "US";
}

async function airwallexAccessToken() {
  if (!env.AIRWALLEX_CLIENT_ID || !env.AIRWALLEX_API_KEY) {
    throw new Error("Airwallex is not configured. Add AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-client-id": env.AIRWALLEX_CLIENT_ID,
    "x-api-key": env.AIRWALLEX_API_KEY,
  };
  if (env.AIRWALLEX_ACCOUNT_ID) headers["x-login-as"] = env.AIRWALLEX_ACCOUNT_ID;

  const response = await fetch(`${airwallexBaseUrl()}/api/v1/authentication/login`, {
    method: "POST",
    headers,
  });
  const data = (await response.json()) as AirwallexToken;
  if (!response.ok || !data.token) {
    throw new Error(data.message || data.code || "Could not authenticate with Airwallex.");
  }
  return data.token;
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
  const accessToken = await airwallexAccessToken();
  const config = planConfig(plan, appId);
  const currency = env.AIRWALLEX_CURRENCY || "USD";
  const requestId = crypto.randomUUID();
  const merchantOrderId = `sg-${requestId}`;
  const response = await fetch(`${airwallexBaseUrl()}/api/v1/pa/payment_intents/create`, {
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
    countryCode: airwallexCountryCode(),
    env: airwallexSdkEnv(),
    successUrl: `${origin}/?airwallex=success&intent_id=${encodeURIComponent(data.id)}`,
    cancelUrl: `${origin}/?airwallex=cancelled`,
  };
}

export async function getAirwallexPaymentIntent(intentId: string) {
  const accessToken = await airwallexAccessToken();
  const response = await fetch(`${airwallexBaseUrl()}/api/v1/pa/payment_intents/${encodeURIComponent(intentId)}`, {
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

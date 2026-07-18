import { env } from "cloudflare:workers";
import { ensureSchema, getD1 } from "./data";

export type PayPalSettings = {
  env?: string;
  clientId?: string;
  clientSecret?: string;
  monthlyPlanId?: string;
};

export type AirwallexSettings = {
  env?: string;
  clientId?: string;
  apiKey?: string;
  accountId?: string;
  countryCode?: string;
  currency?: string;
};

export type PaymentSettings = {
  paypal: PayPalSettings;
  airwallex: AirwallexSettings;
};

function parsePayload<T>(payload?: string | null): Partial<T> {
  if (!payload) return {};
  try {
    return JSON.parse(payload) as Partial<T>;
  } catch {
    return {};
  }
}

async function readProvider<T>(provider: "paypal" | "airwallex") {
  await ensureSchema();
  const row = await getD1()
    .prepare("SELECT payload FROM payment_settings WHERE provider = ?")
    .bind(provider)
    .first<{ payload: string }>();
  return parsePayload<T>(row?.payload);
}

export async function getPayPalSettings(): Promise<Required<Pick<PayPalSettings, "env">> & PayPalSettings> {
  const stored = await readProvider<PayPalSettings>("paypal").catch(() => ({}));
  return {
    env: stored.env || env.PAYPAL_ENV || "live",
    clientId: stored.clientId || env.PAYPAL_CLIENT_ID || "",
    clientSecret: stored.clientSecret || env.PAYPAL_CLIENT_SECRET || "",
    monthlyPlanId: stored.monthlyPlanId || env.PAYPAL_MONTHLY_PLAN_ID || "",
  };
}

export async function getAirwallexSettings(): Promise<Required<Pick<AirwallexSettings, "env" | "countryCode" | "currency">> & AirwallexSettings> {
  const stored = await readProvider<AirwallexSettings>("airwallex").catch(() => ({}));
  return {
    env: stored.env || env.AIRWALLEX_ENV || "prod",
    clientId: stored.clientId || env.AIRWALLEX_CLIENT_ID || "",
    apiKey: stored.apiKey || env.AIRWALLEX_API_KEY || "",
    accountId: stored.accountId || env.AIRWALLEX_ACCOUNT_ID || "",
    countryCode: stored.countryCode || env.AIRWALLEX_COUNTRY_CODE || "US",
    currency: stored.currency || env.AIRWALLEX_CURRENCY || "USD",
  };
}

export async function savePaymentSettings(provider: "paypal" | "airwallex", payload: PayPalSettings | AirwallexSettings, userId: string) {
  await ensureSchema();
  await getD1()
    .prepare("INSERT OR REPLACE INTO payment_settings (provider, payload, updated_at, updated_by) VALUES (?, ?, ?, ?)")
    .bind(provider, JSON.stringify(payload), Date.now(), userId)
    .run();
}

function mask(value?: string) {
  if (!value) return { configured: false, preview: "" };
  if (value.length <= 8) return { configured: true, preview: "configured" };
  return { configured: true, preview: `${value.slice(0, 4)}...${value.slice(-4)}` };
}

export async function getMaskedPaymentSettings() {
  const [paypal, airwallex] = await Promise.all([getPayPalSettings(), getAirwallexSettings()]);
  return {
    paypal: {
      env: paypal.env,
      clientId: mask(paypal.clientId),
      clientSecret: mask(paypal.clientSecret),
      monthlyPlanId: mask(paypal.monthlyPlanId),
    },
    airwallex: {
      env: airwallex.env,
      clientId: mask(airwallex.clientId),
      apiKey: mask(airwallex.apiKey),
      accountId: mask(airwallex.accountId),
      countryCode: airwallex.countryCode,
      currency: airwallex.currency,
    },
  };
}

import { ensureSchema, getD1 } from "./data";

export type PayPalSettings = {
  env?: string;
  clientId?: string;
  clientSecret?: string;
  monthlyPlanId?: string;
  monthlyHostedButtonId?: string;
  receiverEmail?: string;
};

export type AirwallexSettings = {
  env?: string;
  clientId?: string;
  apiKey?: string;
  accountId?: string;
  countryCode?: string;
  currency?: string;
};

export type WorldFirstSettings = {
  env?: string;
  clientId?: string;
  privateKey?: string;
  keyVersion?: string;
  apiBaseUrl?: string;
  accountId?: string;
  currency?: string;
};

export type PricingSettings = {
  singleAmountCents?: number;
  monthlyAmountCents?: number;
  currency?: string;
};

type PaymentProvider = "paypal" | "airwallex" | "worldfirst" | "pricing";

const DEFAULT_PAYPAL_MONTHLY_HOSTED_BUTTON_ID = "MKHKXQTQPB8MU";

function isPayPalPlanId(value?: string) {
  return /^P-[A-Z0-9]+$/i.test(value || "");
}

function firstEmail(value?: string) {
  return (value || "").split(",")[0]?.trim().toLowerCase() || "";
}

function parsePayload<T>(payload?: string | null): Partial<T> {
  if (!payload) return {};
  try {
    return JSON.parse(payload) as Partial<T>;
  } catch {
    return {};
  }
}

async function readProvider<T>(provider: PaymentProvider) {
  await ensureSchema();
  const row = await getD1()
    .prepare("SELECT payload FROM payment_settings WHERE provider = ?")
    .bind(provider)
    .first<{ payload: string }>();
  return parsePayload<T>(row?.payload);
}

export async function getPayPalSettings(): Promise<Required<Pick<PayPalSettings, "env">> & PayPalSettings> {
  const stored: Partial<PayPalSettings> = await readProvider<PayPalSettings>("paypal").catch(() => ({}));
  const legacyMonthlyId = stored.monthlyPlanId || process.env.PAYPAL_MONTHLY_PLAN_ID || "";
  return {
    env: stored.env || process.env.PAYPAL_ENV || "live",
    clientId: stored.clientId || process.env.PAYPAL_CLIENT_ID || "",
    clientSecret: stored.clientSecret || process.env.PAYPAL_CLIENT_SECRET || "",
    monthlyPlanId: isPayPalPlanId(legacyMonthlyId) ? legacyMonthlyId : "",
    monthlyHostedButtonId:
      stored.monthlyHostedButtonId ||
      process.env.PAYPAL_MONTHLY_HOSTED_BUTTON_ID ||
      (!isPayPalPlanId(legacyMonthlyId) ? legacyMonthlyId : "") ||
      DEFAULT_PAYPAL_MONTHLY_HOSTED_BUTTON_ID,
    receiverEmail: (
      stored.receiverEmail ||
      process.env.PAYPAL_RECEIVER_EMAIL ||
      firstEmail(process.env.ADMIN_EMAILS)
    ).toLowerCase(),
  };
}

export async function getAirwallexSettings(): Promise<Required<Pick<AirwallexSettings, "env" | "countryCode" | "currency">> & AirwallexSettings> {
  const stored: Partial<AirwallexSettings> = await readProvider<AirwallexSettings>("airwallex").catch(() => ({}));
  return {
    env: stored.env || process.env.AIRWALLEX_ENV || "prod",
    clientId: stored.clientId || process.env.AIRWALLEX_CLIENT_ID || "",
    apiKey: stored.apiKey || process.env.AIRWALLEX_API_KEY || "",
    accountId: stored.accountId || process.env.AIRWALLEX_ACCOUNT_ID || "",
    countryCode: stored.countryCode || process.env.AIRWALLEX_COUNTRY_CODE || "US",
    currency: stored.currency || process.env.AIRWALLEX_CURRENCY || "USD",
  };
}

export async function getWorldFirstSettings(): Promise<
  Required<Pick<WorldFirstSettings, "env" | "keyVersion" | "apiBaseUrl" | "currency">> & WorldFirstSettings
> {
  const stored: Partial<WorldFirstSettings> = await readProvider<WorldFirstSettings>("worldfirst").catch(() => ({}));
  const worldFirstEnv = stored.env || process.env.WORLDFIRST_ENV || "prod";
  const defaultBaseUrl =
    worldFirstEnv === "sandbox" || worldFirstEnv === "test"
      ? process.env.WORLDFIRST_API_BASE_URL || ""
      : process.env.WORLDFIRST_API_BASE_URL || "https://open-na.worldfirst.com";
  return {
    env: worldFirstEnv,
    clientId: stored.clientId || process.env.WORLDFIRST_CLIENT_ID || "",
    privateKey: stored.privateKey || process.env.WORLDFIRST_PRIVATE_KEY || "",
    keyVersion: stored.keyVersion || process.env.WORLDFIRST_KEY_VERSION || "1",
    apiBaseUrl: stored.apiBaseUrl || defaultBaseUrl,
    accountId: stored.accountId || process.env.WORLDFIRST_ACCOUNT_ID || "",
    currency: stored.currency || process.env.WORLDFIRST_CURRENCY || "USD",
  };
}

function validCents(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 50 && value <= 999900 ? value : fallback;
}

export function priceInputToCents(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents >= 50 && cents <= 999900 ? cents : null;
}

export function centsToPrice(cents: number) {
  return (cents / 100).toFixed(2);
}

export async function getPricingSettings(): Promise<Required<PricingSettings>> {
  const stored: Partial<PricingSettings> = await readProvider<PricingSettings>("pricing").catch(() => ({}));
  const envSingle = priceInputToCents(process.env.SINGLE_REPORT_PRICE || "29.99") || 2999;
  const envMonthly = priceInputToCents(process.env.MONTHLY_SUBSCRIPTION_PRICE || "25.99") || 2599;
  return {
    singleAmountCents: validCents(stored.singleAmountCents, envSingle),
    monthlyAmountCents: validCents(stored.monthlyAmountCents, envMonthly),
    currency: "USD",
  };
}

export async function savePaymentSettings(
  provider: PaymentProvider,
  payload: PayPalSettings | AirwallexSettings | WorldFirstSettings | PricingSettings,
  userId: string,
) {
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
  const [paypal, airwallex, worldfirst, pricing] = await Promise.all([
    getPayPalSettings(),
    getAirwallexSettings(),
    getWorldFirstSettings(),
    getPricingSettings(),
  ]);
  return {
    paypal: {
      env: paypal.env,
      clientId: mask(paypal.clientId),
      clientSecret: mask(paypal.clientSecret),
      monthlyPlanId: mask(paypal.monthlyPlanId),
      monthlyHostedButtonId: mask(paypal.monthlyHostedButtonId),
      receiverEmail: paypal.receiverEmail || "",
    },
    airwallex: {
      env: airwallex.env,
      clientId: mask(airwallex.clientId),
      apiKey: mask(airwallex.apiKey),
      accountId: mask(airwallex.accountId),
      countryCode: airwallex.countryCode,
      currency: airwallex.currency,
    },
    worldfirst: {
      env: worldfirst.env,
      clientId: mask(worldfirst.clientId),
      privateKey: mask(worldfirst.privateKey),
      keyVersion: worldfirst.keyVersion,
      apiBaseUrl: worldfirst.apiBaseUrl,
      accountId: mask(worldfirst.accountId),
      currency: worldfirst.currency,
    },
    pricing: {
      singleAmount: centsToPrice(pricing.singleAmountCents),
      monthlyAmount: centsToPrice(pricing.monthlyAmountCents),
      currency: pricing.currency,
    },
  };
}

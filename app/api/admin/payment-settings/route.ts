import { getCurrentUser, isAdmin, json } from "../../../lib/data";
import {
  getMaskedPaymentSettings,
  getPayPalSettings,
  getAirwallexSettings,
  getWorldFirstSettings,
  savePaymentSettings,
} from "../../../lib/payment-settings";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function keepSecret(input: string, current?: string) {
  if (!input || input === "********") return current || "";
  return input;
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!isAdmin(user)) return json({ error: "Admin access required." }, 403);
  return json(await getMaskedPaymentSettings());
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!isAdmin(user)) return json({ error: "Admin access required." }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    paypal?: Record<string, unknown>;
    airwallex?: Record<string, unknown>;
    worldfirst?: Record<string, unknown>;
  };
  const [currentPayPal, currentAirwallex, currentWorldFirst] = await Promise.all([
    getPayPalSettings(),
    getAirwallexSettings(),
    getWorldFirstSettings(),
  ]);

  if (body.paypal) {
    await savePaymentSettings(
      "paypal",
      {
        env: clean(body.paypal.env) || currentPayPal.env,
        clientId: clean(body.paypal.clientId) || currentPayPal.clientId,
        clientSecret: keepSecret(clean(body.paypal.clientSecret), currentPayPal.clientSecret),
        monthlyPlanId: clean(body.paypal.monthlyPlanId) || currentPayPal.monthlyPlanId,
      },
      user.id,
    );
  }

  if (body.airwallex) {
    await savePaymentSettings(
      "airwallex",
      {
        env: clean(body.airwallex.env) || currentAirwallex.env,
        clientId: clean(body.airwallex.clientId) || currentAirwallex.clientId,
        apiKey: keepSecret(clean(body.airwallex.apiKey), currentAirwallex.apiKey),
        accountId: clean(body.airwallex.accountId) || currentAirwallex.accountId,
        countryCode: clean(body.airwallex.countryCode) || currentAirwallex.countryCode,
        currency: clean(body.airwallex.currency) || currentAirwallex.currency,
      },
      user.id,
    );
  }

  if (body.worldfirst) {
    await savePaymentSettings(
      "worldfirst",
      {
        env: clean(body.worldfirst.env) || currentWorldFirst.env,
        clientId: clean(body.worldfirst.clientId) || currentWorldFirst.clientId,
        privateKey: keepSecret(clean(body.worldfirst.privateKey), currentWorldFirst.privateKey),
        keyVersion: clean(body.worldfirst.keyVersion) || currentWorldFirst.keyVersion,
        apiBaseUrl: clean(body.worldfirst.apiBaseUrl) || currentWorldFirst.apiBaseUrl,
        accountId: clean(body.worldfirst.accountId) || currentWorldFirst.accountId,
        currency: clean(body.worldfirst.currency) || currentWorldFirst.currency,
      },
      user.id,
    );
  }

  return json({ message: "Payment settings saved.", settings: await getMaskedPaymentSettings() });
}

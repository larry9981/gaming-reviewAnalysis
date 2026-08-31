import { getCurrentUser, isAdmin, json } from "../../../lib/data";
import {
  getMaskedPaymentSettings,
  getPayPalSettings,
  getAirwallexSettings,
  getPricingSettings,
  getWorldFirstSettings,
  priceInputToCents,
  savePaymentSettings,
} from "../../../lib/payment-settings";
import { updatePayPalMonthlyPlanPrice } from "../../../lib/paypal";

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
  if (!user || !isAdmin(user)) return json({ error: "Admin access required." }, 403);

  const body = (await request.json().catch(() => ({}))) as {
    paypal?: Record<string, unknown>;
    airwallex?: Record<string, unknown>;
    worldfirst?: Record<string, unknown>;
    pricing?: Record<string, unknown>;
  };
  const [currentPayPal, currentAirwallex, currentWorldFirst, currentPricing] = await Promise.all([
    getPayPalSettings(),
    getAirwallexSettings(),
    getWorldFirstSettings(),
    getPricingSettings(),
  ]);

  const nextPayPal = body.paypal
    ? {
        env: clean(body.paypal.env) || currentPayPal.env,
        clientId: clean(body.paypal.clientId) || currentPayPal.clientId,
        clientSecret: keepSecret(clean(body.paypal.clientSecret), currentPayPal.clientSecret),
        monthlyPlanId: clean(body.paypal.monthlyPlanId) || currentPayPal.monthlyPlanId,
        monthlyHostedButtonId: clean(body.paypal.monthlyHostedButtonId) || currentPayPal.monthlyHostedButtonId,
        receiverEmail: (clean(body.paypal.receiverEmail) || currentPayPal.receiverEmail || "").toLowerCase(),
      }
    : currentPayPal;

  if (nextPayPal.monthlyPlanId && !/^P-[A-Z0-9]+$/i.test(nextPayPal.monthlyPlanId)) {
    return json({ error: "PayPal REST Plan ID must start with P-. Use Hosted Button ID for an _s-xclick button." }, 400);
  }
  if (nextPayPal.monthlyHostedButtonId && !/^[A-Z0-9]{8,32}$/i.test(nextPayPal.monthlyHostedButtonId)) {
    return json({ error: "Enter a valid PayPal Hosted Button ID." }, 400);
  }
  if (nextPayPal.monthlyHostedButtonId && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nextPayPal.receiverEmail || "")) {
    return json({ error: "PayPal receiver email is required to securely verify Hosted Button payments." }, 400);
  }

  let nextSingleAmount = currentPricing.singleAmountCents;
  let nextMonthlyAmount = currentPricing.monthlyAmountCents;
  if (body.pricing) {
    const singleAmount = priceInputToCents(body.pricing.singleAmount);
    const monthlyAmount = priceInputToCents(body.pricing.monthlyAmount);
    if (!singleAmount || !monthlyAmount) {
      return json({ error: "Enter valid USD prices between $0.50 and $9,999.00, with no more than two decimal places." }, 400);
    }
    nextSingleAmount = singleAmount;
    nextMonthlyAmount = monthlyAmount;
  }

  const monthlyPriceChanged = nextMonthlyAmount !== currentPricing.monthlyAmountCents;
  const syncPayPalPrice = body.pricing?.syncPaypalMonthlyPrice === true;
  if (monthlyPriceChanged && nextPayPal.monthlyPlanId && !syncPayPalPrice) {
    return json(
      {
        error:
          "Confirm PayPal monthly price synchronization before saving. PayPal will notify existing subscribers and apply its price-change timing rules.",
      },
      409,
    );
  }
  if (syncPayPalPrice && nextPayPal.monthlyPlanId) {
    try {
      await updatePayPalMonthlyPlanPrice(nextMonthlyAmount, nextPayPal);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "PayPal monthly price synchronization failed." }, 502);
    }
  }

  if (body.paypal) {
    await savePaymentSettings(
      "paypal",
      nextPayPal,
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

  if (body.pricing) {
    await savePaymentSettings(
      "pricing",
      {
        singleAmountCents: nextSingleAmount,
        monthlyAmountCents: nextMonthlyAmount,
        currency: "USD",
      },
      user.id,
    );
  }

  return json({
    message: syncPayPalPrice && nextPayPal.monthlyPlanId ? "Payment settings saved and PayPal monthly price synchronized." : "Payment settings saved.",
    settings: await getMaskedPaymentSettings(),
  });
}

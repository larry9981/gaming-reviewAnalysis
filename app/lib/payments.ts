import { env } from "cloudflare:workers";
import { getPricingSettings } from "./payment-settings";

const encoder = new TextEncoder();

export type CheckoutPlan = "single" | "monthly";

export async function planConfig(plan: CheckoutPlan, appId?: string) {
  const pricing = await getPricingSettings();
  if (plan === "single") {
    return {
      mode: "payment",
      name: appId ? `Steam Guardrail full report ${appId}` : "Steam Guardrail single report",
      amount: pricing.singleAmountCents,
      kind: "single",
      description: "One month access for one complete game report",
    };
  }
  return {
    mode: "subscription",
    name: "Steam Guardrail Monthly",
    amount: pricing.monthlyAmountCents,
    kind: "monthly",
    description: "Unlimited full reports while subscribed",
  };
}

function formBody(values: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) body.set(key, String(value));
  });
  return body;
}

export async function createStripeCheckoutSession({
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
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY to production environment variables.");
  }

  const config = await planConfig(plan, appId);
  const params: Record<string, string | number | undefined> = {
    mode: config.mode,
    success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/?checkout=cancelled`,
    customer_email: email,
    "client_reference_id": userId,
    "metadata[userId]": userId,
    "metadata[plan]": plan,
    "metadata[appId]": appId || "",
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": config.amount,
    "line_items[0][price_data][product_data][name]": config.name,
    "line_items[0][price_data][product_data][description]": config.description,
    "automatic_payment_methods[enabled]": "true",
  };

  if (plan === "monthly") {
    params["line_items[0][price_data][recurring][interval]"] = "month";
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody(params),
  });

  const data = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message || "Stripe Checkout session could not be created.");
  }
  return { id: data.id, url: data.url };
}

export async function getStripeCheckoutSession(sessionId: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });
  const data = (await response.json()) as {
    id?: string;
    mode?: string;
    payment_status?: string;
    status?: string;
    subscription?: string;
    payment_intent?: string;
    metadata?: {
      userId?: string;
      plan?: CheckoutPlan;
      appId?: string;
    };
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(data.error?.message || "Stripe session lookup failed.");
  return data;
}

export async function verifyStripeSignature(payload: string, signatureHeader: string) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook secret is not configured.");
  }
  const timestamp = signatureHeader.match(/t=([^,]+)/)?.[1];
  const signature = signatureHeader.match(/v1=([^,]+)/)?.[1];
  if (!timestamp || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.STRIPE_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const expected = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}

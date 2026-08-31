import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("admin can persist validated plan prices", async () => {
  const [settings, route, page] = await Promise.all([
    source("app/lib/payment-settings.ts"),
    source("app/api/admin/payment-settings/route.ts"),
    source("app/page.tsx"),
  ]);

  assert.match(settings, /"pricing"/);
  assert.match(settings, /singleAmountCents/);
  assert.match(settings, /monthlyAmountCents/);
  assert.match(route, /priceInputToCents/);
  assert.match(route, /syncPaypalMonthlyPrice/);
  assert.match(route, /confirmPaypalHostedPrices/);
  assert.match(route, /updatePayPalMonthlyPlanPrice/);
  assert.match(page, /name="singleAmount"/);
  assert.match(page, /name="monthlyAmount"/);
  assert.match(page, /name="syncPaypalMonthlyPrice"/);
  assert.match(page, /name="confirmPaypalHostedPrices"/);
  assert.match(page, /name="paypalSingleHostedButtonId"/);
});

test("public pricing and checkout use the stored amounts", async () => {
  const [pricingRoute, payments, paypal, paymentSettings, worldfirst, analyze] = await Promise.all([
    source("app/api/pricing/route.ts"),
    source("app/lib/payments.ts"),
    source("app/lib/paypal.ts"),
    source("app/lib/payment-settings.ts"),
    source("app/lib/worldfirst.ts"),
    source("app/api/analyze/route.ts"),
  ]);

  assert.match(pricingRoute, /getPricingSettings/);
  assert.match(payments, /amount: pricing\.singleAmountCents/);
  assert.match(payments, /amount: pricing\.monthlyAmountCents/);
  assert.match(paypal, /await planConfig\(plan, appId\)/);
  assert.match(paypal, /settings\.singleHostedButtonId/);
  assert.match(paypal, /buildPayPalHostedButtonUrl/);
  assert.match(paymentSettings, /M2BWCCYUQSDB8/);
  assert.match(paypal, /buildPayPalBuyNowUrl/);
  assert.match(paypal, /url\.searchParams\.set\("cmd", "_xclick"\)/);
  assert.match(paypal, /amountCents \/ 100/);
  assert.match(worldfirst, /await planConfig\(plan, appId\)/);
  assert.match(analyze, /getPricingSettings/);
});

test("PayPal Standard payments require a verified, exact IPN match", async () => {
  const ipn = await source("app/api/paypal/ipn/route.ts");

  assert.match(ipn, /eventType !== "web_accept"/);
  assert.match(ipn, /paymentStatus !== "Completed"/);
  assert.match(ipn, /paidCents !== expectedAmountCents/);
  assert.match(ipn, /expected_amount_cents as expectedAmountCents/);
  assert.match(ipn, /params\.get\("invoice"\) !== checkoutId/);
  assert.match(ipn, /params\.get\("item_number"\).*checkout\.appId/s);
  assert.match(ipn, /params\.get\("parent_txn_id"\)/);
  assert.match(ipn, /provider = 'paypal-ipn'/);
  assert.match(ipn, /cancel_at_period_end = 1/);
  assert.match(ipn, /eventType === "subscr_eot"/);
  assert.match(ipn, /status <> 'paid'/);
  assert.match(ipn, /addUtcMonth/);
});

test("PayPal return verification never grants approval-pending subscriptions", async () => {
  const verify = await source("app/api/paypal/verify/route.ts");

  assert.doesNotMatch(verify, /APPROVAL_PENDING/);
  assert.match(verify, /subscription\.status !== "ACTIVE"/);
  assert.match(verify, /meta\?\.userId !== user\.id/);
});

test("PayPal checkout persists immutable payment expectations", async () => {
  const [checkout, data, schema] = await Promise.all([
    source("app/api/paypal/checkout/route.ts"),
    source("app/lib/data.ts"),
    source("render/schema.sql"),
  ]);

  assert.match(checkout, /expected_amount_cents/);
  assert.match(checkout, /checkout\.expectedAmountCents/);
  assert.match(data, /cancel_at_period_end/);
  assert.match(schema, /expected_amount_cents BIGINT/);
  assert.match(schema, /billing_amount_cents BIGINT/);
});

test("subscription cancellation continues in PayPal without revoking paid access locally", async () => {
  const [route, page] = await Promise.all([
    source("app/api/account/cancel-subscription/route.ts"),
    source("app/page.tsx"),
  ]);

  assert.match(route, /paypal\.com\/myaccount\/autopay/);
  assert.doesNotMatch(route, /UPDATE entitlements SET status = 'cancelled'/);
  assert.match(page, /Manage \/ cancel in PayPal/);
});

test("Render includes persistent payment settings", async () => {
  const [prepare, data, settings] = await Promise.all([
    source("scripts/prepare-render.mjs"),
    source("render/adapters/data.ts"),
    source("render/adapters/payment-settings.ts"),
  ]);

  assert.match(prepare, /render\/adapters\/payment-settings\.ts/);
  assert.match(data, /CREATE TABLE IF NOT EXISTS payment_settings/);
  assert.match(settings, /getPricingSettings/);
  assert.match(settings, /ON CONFLICT|INSERT OR REPLACE/);
});

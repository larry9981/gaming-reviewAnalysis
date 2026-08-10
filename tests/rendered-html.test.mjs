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
  assert.match(route, /updatePayPalMonthlyPlanPrice/);
  assert.match(page, /name="singleAmount"/);
  assert.match(page, /name="monthlyAmount"/);
  assert.match(page, /name="syncPaypalMonthlyPrice"/);
});

test("public pricing and checkout use the stored amounts", async () => {
  const [pricingRoute, payments, paypal, worldfirst, analyze] = await Promise.all([
    source("app/api/pricing/route.ts"),
    source("app/lib/payments.ts"),
    source("app/lib/paypal.ts"),
    source("app/lib/worldfirst.ts"),
    source("app/api/analyze/route.ts"),
  ]);

  assert.match(pricingRoute, /getPricingSettings/);
  assert.match(payments, /amount: pricing\.singleAmountCents/);
  assert.match(payments, /amount: pricing\.monthlyAmountCents/);
  assert.match(paypal, /await planConfig\(plan, appId\)/);
  assert.match(paypal, /config\.amount \/ 100/);
  assert.match(worldfirst, /await planConfig\(plan, appId\)/);
  assert.match(analyze, /getPricingSettings/);
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

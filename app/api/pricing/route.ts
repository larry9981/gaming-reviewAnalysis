import { centsToPrice, getPricingSettings } from "../../lib/payment-settings";
import { json } from "../../lib/data";

export async function GET() {
  const pricing = await getPricingSettings();
  return json({
    singleAmount: centsToPrice(pricing.singleAmountCents),
    monthlyAmount: centsToPrice(pricing.monthlyAmountCents),
    currency: pricing.currency,
  });
}

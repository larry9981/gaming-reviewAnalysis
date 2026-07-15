import { grantEntitlement, json } from "../../../lib/data";
import { verifyStripeSignature, type CheckoutPlan } from "../../../lib/payments";

type StripeCheckoutEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      mode?: string;
      subscription?: string;
      payment_intent?: string;
      metadata?: {
        userId?: string;
        plan?: CheckoutPlan;
        appId?: string;
      };
    };
  };
};

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  try {
    if (!(await verifyStripeSignature(payload, signature))) {
      return json({ error: "Invalid Stripe signature." }, 400);
    }
    const event = JSON.parse(payload) as StripeCheckoutEvent;
    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const userId = session?.metadata?.userId;
      const plan = session?.metadata?.plan;
      if (userId && plan) {
        const providerRef = session.subscription || session.payment_intent || session.id;
        await grantEntitlement({
          userId,
          kind: plan,
          appId: session.metadata?.appId || undefined,
          provider: "stripe",
          providerRef: providerRef || undefined,
        });
      }
    }
    return json({ received: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Webhook failed." }, 400);
  }
}

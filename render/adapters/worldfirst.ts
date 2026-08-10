import { planConfig, type CheckoutPlan } from "./payments";
import { getWorldFirstSettings } from "./payment-settings";

type WorldFirstCreateResponse = {
  result?: { resultStatus?: string; resultCode?: string; resultMessage?: string };
  actionForm?: string;
  payToSummaries?: Array<{ payToRequestId?: string }>;
};

type WorldFirstInquiryResponse = {
  result?: { resultStatus?: string; resultCode?: string; resultMessage?: string };
  payToSummaries?: Array<{
    payToRequestId?: string;
    orderResult?: { status?: string };
  }>;
};

const encoder = new TextEncoder();

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function amountValue(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseActionForm(value?: string) {
  if (!value) return {};
  try {
    return JSON.parse(value) as { redirectUrl?: string };
  } catch {
    return {};
  }
}

async function signRequest(method: string, path: string, clientId: string, requestTime: string, body: string, privateKeyPem: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem.replace(/\\n/g, "\n").trim()),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const content = `${method} ${path}\n${clientId}.${requestTime}.${body}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(content));
  const bytes = new Uint8Array(signature);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function worldFirstFetch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const settings = await getWorldFirstSettings();
  if (!settings.clientId || !settings.privateKey) {
    throw new Error("WorldFirst is not configured. Add WORLDFIRST_CLIENT_ID and WORLDFIRST_PRIVATE_KEY.");
  }
  const baseUrl = settings.apiBaseUrl;
  if (!baseUrl) throw new Error("WorldFirst API base URL is missing.");
  const normalizedPath = normalizePath(path);
  const payload = JSON.stringify(body);
  const requestTime = new Date().toISOString();
  const signature = await signRequest("POST", normalizedPath, settings.clientId, requestTime, payload, settings.privateKey);
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${normalizedPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Client-Id": settings.clientId,
      "Request-Time": requestTime,
      Signature: `algorithm=RSA256,keyVersion=${settings.keyVersion},signature=${signature}`,
    },
    body: payload,
  });
  const data = (await response.json().catch(() => ({}))) as T & { result?: { resultMessage?: string; resultCode?: string } };
  if (!response.ok) throw new Error(data.result?.resultMessage || data.result?.resultCode || "WorldFirst request failed.");
  return data;
}

export async function createWorldFirstCheckout({
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
  const settings = await getWorldFirstSettings();
  const config = await planConfig(plan, appId);
  const currency = settings.currency;
  const payToRequestId = `sg_${crypto.randomUUID().replace(/-/g, "").slice(0, 28)}`;
  const response = await worldFirstFetch<WorldFirstCreateResponse>("/amsin/api/v1/business/create", {
    orderGroup: {
      orderBuyer: { referenceBuyerId: userId, buyerEmail: email },
      orderGroupDescription: config.name,
      orderGroupId: payToRequestId,
      orders: [
        {
          orderTotalAmount: { currency, value: amountValue(config.amount) },
          orderDescription: config.description,
          referenceOrderId: payToRequestId,
          transactionTime: new Date().toISOString(),
        },
      ],
    },
    industryProductCode: "ONLINE_DIRECT_PAY",
    paymentRedirectUrl: `${origin}/?worldfirst=success&payment_request_id=${encodeURIComponent(payToRequestId)}`,
    payToDetails: [
      {
        payToRequestId,
        payToAmount: { currency, value: amountValue(config.amount) },
        payToMethod: {
          paymentMethodType: "BALANCE",
          paymentMethodDataType: "PAYMENT_ACCOUNT_NO",
          paymentMethodData: settings.accountId || undefined,
        },
        paymentNotifyUrl: `${origin}/api/worldfirst/verify`,
        referenceOrderId: payToRequestId,
      },
    ],
    extendInfo: JSON.stringify({ userId, plan, appId: appId || "" }),
  });
  const checkoutUrl = parseActionForm(response.actionForm).redirectUrl;
  if (!checkoutUrl) throw new Error(response.result?.resultMessage || "WorldFirst checkout did not return a payment URL.");
  return { id: response.payToSummaries?.[0]?.payToRequestId || payToRequestId, checkoutUrl };
}

export async function getWorldFirstPayment(paymentRequestId: string) {
  const response = await worldFirstFetch<WorldFirstInquiryResponse>("/amsin/api/v1/business/inquiryPayOrder", {
    payToRequestIds: [paymentRequestId],
  });
  const summary = response.payToSummaries?.[0];
  return {
    id: summary?.payToRequestId || paymentRequestId,
    status: summary?.orderResult?.status || response.result?.resultStatus || "",
  };
}

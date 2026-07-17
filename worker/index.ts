/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TRUSTED_HOSTS?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const CANONICAL_HOST = "steam-guardrail-app.jqqbest.chatgpt.site";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https://www.paypal.com https://www.sandbox.paypal.com https://api-m.paypal.com https://api-m.sandbox.paypal.com https://checkout.stripe.com",
  "form-action 'self' https://www.paypal.com https://www.sandbox.paypal.com https://checkout.stripe.com",
  "upgrade-insecure-requests",
].join("; ");

function trustedHosts(env: Env) {
  return new Set([
    CANONICAL_HOST,
    ...(env.TRUSTED_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  ]);
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

function enforceCanonicalHost(request: Request, env: Env) {
  const url = new URL(request.url);
  const hostname = url.hostname.toLowerCase();
  if (isLocalHost(hostname) || trustedHosts(env).has(hostname)) return null;
  url.hostname = CANONICAL_HOST;
  url.protocol = "https:";
  return Response.redirect(url.toString(), 308);
}

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy);
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("X-Robots-Tag", "index, follow");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const hostRedirect = enforceCanonicalHost(request, env);
    if (hostRedirect) return withSecurityHeaders(hostRedirect);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withSecurityHeaders(response);
    }

    const response = await handler.fetch(request, env, ctx);
    return withSecurityHeaders(response);
  },
};

export default worker;

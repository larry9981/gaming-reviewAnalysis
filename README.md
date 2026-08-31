# Steam Guardrail

Steam Guardrail is a small monetization prototype for a Steam purchase risk
scanner. It uses account-bound paid access with two plans: one-month access for
a single selected game, or recurring monthly access. The default prices are $29.99
and $25.99/month, and an administrator can change both amounts from the payment settings page.

The app runs on [vinext](https://github.com/cloudflare/vinext), with optional
Cloudflare D1 and Drizzle support available if the prototype later needs
accounts, watchlist storage, or paid plan state.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: build for Render when Render environment variables are present; otherwise verify the vinext build output
- `npm run build:cloudflare`: explicitly verify the vinext/Cloudflare build output
- `npm run build:render`: switch to the Render/Postgres adapters and verify the Next.js build used by Render
- `npm run start`: start the Render server on Render; otherwise start vinext
- `npm run start:cloudflare`: explicitly start vinext
- `npm run start:render`: migrate Render Postgres and start the Next.js server on `$PORT`
- `npm run db:migrate:render`: create or upgrade the Render Postgres schema from `render/schema.sql`
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## GitHub + Render Deployment

This repository supports two deployment paths:

- Cloudflare/Sites: the current production path, using `vinext`, Cloudflare Workers, and D1.
- Render: a GitHub-connected Web Service using Next.js and Render Postgres.

Render uses `render.yaml` at the repo root. When Render builds the service, `scripts/prepare-render.mjs`
temporarily swaps the Cloudflare-specific data/payment modules for Node/Postgres adapters from
`render/adapters/`, then runs `next build`.

Recommended Render setup:

1. Push this repository to GitHub.
2. In Render, create a new Blueprint from the GitHub repository.
3. Let Render provision `steam-guardrail-db` Postgres from `render.yaml`.
4. Set the `sync: false` secrets in the Render dashboard:
   - `ADMIN_BOOTSTRAP_PASSWORD` once, to create the initial `jqqbest@gmail.com` administrator (12 characters minimum)
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_MONTHLY_HOSTED_BUTTON_ID` for a legacy `_s-xclick` Subscribe button
   - `PAYPAL_RECEIVER_EMAIL`, which must match the primary PayPal business email returned by IPN
   - `PAYPAL_MONTHLY_PLAN_ID` only when using the newer REST Subscriptions API (`P-...`)
   - `WORLDFIRST_ENV` (`prod`, `test`, or `sandbox`)
   - `WORLDFIRST_CLIENT_ID`
   - `WORLDFIRST_PRIVATE_KEY`
   - `WORLDFIRST_KEY_VERSION` (`1` by default)
   - `WORLDFIRST_API_BASE_URL` if WorldFirst assigns a gateway URL different from the default
   - `WORLDFIRST_ACCOUNT_ID` if WorldFirst requires a settlement/payment account number
   - `WORLDFIRST_CURRENCY` (`USD` by default)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `RESET_PASSWORD_WEBHOOK_URL` if password reset email delivery is connected
5. Deploy. Render injects the database's internal connection string as `DATABASE_URL`, runs `pnpm run db:migrate:render`, and then starts the service.

The migration is idempotent and creates the tables used for users, sessions, password resets, checkouts, entitlements, payment settings, game reports, and the daily trending cache. The `/api/health` deployment check returns success only when the database is connected. Runtime schema initialization remains as a fallback for manually configured Render services.
The admin bootstrap inserts the administrator only when that email does not exist; later deployments confirm the admin role without replacing the stored password. Remove `ADMIN_BOOTSTRAP_PASSWORD` from Render after the first successful deployment.

WorldFirst checkout uses the official Cashier Payment redirect flow: the server signs each create/inquiry request with
RSA256, the browser redirects to WorldFirst checkout, and the app verifies the payment before granting access. Store
WorldFirst credentials only in deployment environment variables or the admin-only payment settings page.
Plan prices are stored with the payment settings and are used by the public pricing UI and checkout APIs. When changing
the recurring price for a configured PayPal Billing Plan, the administrator must explicitly confirm synchronization;
PayPal then applies its notification and price-change timing rules to existing subscribers.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

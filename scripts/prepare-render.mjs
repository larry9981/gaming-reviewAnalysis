import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const replacements = [
  ["render/adapters/data.ts", "app/lib/data.ts"],
  ["render/adapters/payments.ts", "app/lib/payments.ts"],
  ["render/adapters/paypal.ts", "app/lib/paypal.ts"],
  ["render/adapters/forgot-password-route.ts", "app/api/auth/forgot-password/route.ts"],
];

for (const [source, target] of replacements) {
  copyFileSync(resolve(root, source), resolve(root, target));
  console.log(`render adapter: ${source} -> ${target}`);
}

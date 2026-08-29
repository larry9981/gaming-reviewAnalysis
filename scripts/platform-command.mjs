import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (action !== "build" && action !== "start") {
  console.error("Usage: node scripts/platform-command.mjs <build|start>");
  process.exit(1);
}

const isRender = process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);
const target = `${action}:${isRender ? "render" : "cloudflare"}`;
const packageManager = process.platform === "win32" ? "npm.cmd" : "npm";

console.log(`platform command: ${target}`);
const result = spawnSync(packageManager, ["run", target], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

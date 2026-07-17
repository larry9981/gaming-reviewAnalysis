import { getCurrentUser, hasReportAccess, isAdmin, json } from "../../lib/data";
import { analyzeSteamApp, extractAppId } from "../../lib/steam";

export async function POST(request: Request) {
  const { input } = (await request.json().catch(() => ({}))) as { input?: string };
  const appId = extractAppId(input || "");
  if (!appId) {
    return json({ error: "Paste a Steam store URL or numeric App ID." }, 400);
  }

  const user = await getCurrentUser(request);
  const allowed = user ? isAdmin(user) || (await hasReportAccess(user.id, appId)) : false;
  if (!allowed) {
    return json(
      {
        error: "Full report requires payment.",
        code: "PAYWALL",
        appId,
        defaultPlan: "single",
        plans: [
          { id: "single", label: "One-month single report", price: "$29.99", appId },
          { id: "monthly", label: "Recurring monthly access", price: "$25.99/month" },
        ],
      },
      402,
    );
  }

  try {
    return json(await analyzeSteamApp(appId));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Analysis failed." }, 502);
  }
}

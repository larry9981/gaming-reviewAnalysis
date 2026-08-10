import { getCurrentUser, hasReportAccess, isAdmin, json } from "../../lib/data";
import { analyzeSteamApp, extractAppId } from "../../lib/steam";
import { centsToPrice, getPricingSettings } from "../../lib/payment-settings";

type Report = Awaited<ReturnType<typeof analyzeSteamApp>>;

function previewReport(report: Report): Report {
  return {
    ...report,
    signals: report.signals.slice(0, 2),
    topComplaints: report.topComplaints.slice(0, 2),
    steamReviews: report.steamReviews.slice(0, 1),
    reddit: {
      ...report.reddit,
      posts: report.reddit.posts.slice(0, 1),
    },
    platformFeedback: report.platformFeedback.map((item) => ({
      ...item,
      summary:
        item.platform === "Steam" || item.platform === "Reddit"
          ? item.summary
          : "Paid access unlocks this platform's detailed buyer feedback.",
    })),
    contentBrief: {
      ...report.contentBrief,
      characters: report.contentBrief.characters.slice(0, 1),
      scenes: report.contentBrief.scenes.slice(0, 1),
      tips: report.contentBrief.tips.slice(0, 1),
      walkthroughSkills: ["Paid access unlocks the full walkthrough skill plan built from Steam, Reddit, and public review signals."],
      buyerAnalysis: `${report.verdict.label}: limited public preview. Paid access unlocks the complete buyer analysis, platform feedback, review samples, characters, scenes, and game tips.`,
    },
    limitations: ["Limited public preview. Full report unlocks after registration and payment."],
  };
}

export async function POST(request: Request) {
  const { input } = (await request.json().catch(() => ({}))) as { input?: string };
  const appId = extractAppId(input || "");
  if (!appId) {
    return json({ error: "Paste a Steam store URL or numeric App ID." }, 400);
  }

  const user = await getCurrentUser(request);
  const allowed = user ? isAdmin(user) || (await hasReportAccess(user.id, appId)) : false;
  if (!allowed) {
    try {
      const [report, pricing] = await Promise.all([analyzeSteamApp(appId), getPricingSettings()]);
      return json(
        {
          error: "Full report requires payment.",
          code: "PAYWALL",
          appId,
          preview: previewReport(report),
          defaultPlan: "single",
          plans: [
            { id: "single", label: "One-month single report", price: `$${centsToPrice(pricing.singleAmountCents)}`, appId },
            { id: "monthly", label: "Recurring monthly access", price: `$${centsToPrice(pricing.monthlyAmountCents)}/month` },
          ],
        },
        402,
      );
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Preview analysis failed." }, 502);
    }
  }

  try {
    return json(await analyzeSteamApp(appId));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Analysis failed." }, 502);
  }
}

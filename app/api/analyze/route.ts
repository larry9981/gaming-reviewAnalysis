import { getCurrentUser, hasReportAccess, isAdmin, json } from "../../lib/data";
import { analyzeSteamApp, extractAppId } from "../../lib/steam";

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
      summary: item.platform === "Steam" || item.platform === "Reddit" ? item.summary : "Subscribe to unlock detailed platform analysis.",
    })),
    contentBrief: {
      ...report.contentBrief,
      characters: report.contentBrief.characters.slice(0, 1),
      scenes: report.contentBrief.scenes.slice(0, 1),
      tips: report.contentBrief.tips.slice(0, 1),
      buyerAnalysis: `${report.verdict.label}: preview mode. Subscribe to unlock the full buyer analysis, characters, scenes, tips, and all source details.`,
    },
    limitations: ["Preview report. Full source detail unlocks after registration and subscription."],
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
      const report = await analyzeSteamApp(appId);
      return json(
        {
          error: "Full report requires payment.",
          code: "PAYWALL",
          appId,
          preview: previewReport(report),
          plans: [
            { id: "single", label: "Single report", price: "$19.90", appId },
            { id: "monthly", label: "Monthly subscription", price: "$12.99/month" },
          ],
        },
        402,
      );
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Preview failed." }, 502);
    }
  }

  try {
    return json(await analyzeSteamApp(appId));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Analysis failed." }, 502);
  }
}

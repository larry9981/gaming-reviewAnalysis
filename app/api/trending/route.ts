import { json } from "../../lib/data";
import { analyzeSteamApp, getTopSteamAppIds } from "../../lib/steam";

export async function GET() {
  try {
    const ids = await getTopSteamAppIds();
    const reports = await Promise.allSettled(ids.slice(0, 30).map((id) => analyzeSteamApp(id)));
    const games = reports
      .filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof analyzeSteamApp>>> => item.status === "fulfilled")
      .map((item) => ({
        appId: item.value.appId,
        name: item.value.game.name,
        image: item.value.game.image,
        price: item.value.game.price,
        reviewSummary: item.value.reviewSummary?.description || "Unknown",
        riskScore: item.value.riskScore,
        verdict: item.value.verdict.label,
        tone: item.value.verdict.tone,
        topSignals: item.value.signals.slice(0, 2).map((signal) => signal.label),
        redditAvailable: item.value.reddit.posts.length > 0,
        steamUrl: item.value.game.steamUrl,
      }));
    return json({ games, updatedAt: Date.now() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not fetch Steam top games." }, 502);
  }
}

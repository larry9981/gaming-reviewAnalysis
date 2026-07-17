import { ensureSchema, getD1, json } from "../../lib/data";
import { analyzeSteamApp, getTopSteamAppIds } from "../../lib/steam";

const CACHE_KEY = "steam-top-30-daily";
const DAY_MS = 1000 * 60 * 60 * 24;

export async function GET() {
  try {
    await ensureSchema();
    const cached = await getD1()
      .prepare("SELECT payload, updated_at as updatedAt FROM trending_cache WHERE cache_key = ?")
      .bind(CACHE_KEY)
      .first<{ payload: string; updatedAt: number }>();
    if (cached && Date.now() - cached.updatedAt < DAY_MS) {
      return json({ ...JSON.parse(cached.payload), updatedAt: cached.updatedAt, cached: true });
    }

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
    const updatedAt = Date.now();
    const payload = { games };
    await getD1()
      .prepare("INSERT OR REPLACE INTO trending_cache (cache_key, payload, updated_at) VALUES (?, ?, ?)")
      .bind(CACHE_KEY, JSON.stringify(payload), updatedAt)
      .run();
    return json({ ...payload, updatedAt, cached: false });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Could not fetch Steam top games." }, 502);
  }
}

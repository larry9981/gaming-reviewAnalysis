import { ensureSchema, getD1, isDataStoreConfigured, json } from "../../lib/data";
import { analyzeSteamApp, getTopSteamAppIds } from "../../lib/steam";

const CACHE_KEY = "steam-top-30-daily";
const DAY_MS = 1000 * 60 * 60 * 24;

async function fetchTrendingGames() {
  const ids = await getTopSteamAppIds();
  const reports = await Promise.allSettled(ids.slice(0, 30).map((id) => analyzeSteamApp(id)));
  return reports
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
}

export async function GET() {
  try {
    let storageAvailable = isDataStoreConfigured();
    if (storageAvailable) {
      try {
        await ensureSchema();
        const cached = await getD1()
          .prepare("SELECT payload, updated_at as updatedAt FROM trending_cache WHERE cache_key = ?")
          .bind(CACHE_KEY)
          .first<{ payload: string; updatedAt: number }>();
        if (cached && Date.now() - cached.updatedAt < DAY_MS) {
          return json({ ...JSON.parse(cached.payload), updatedAt: cached.updatedAt, cached: true });
        }
      } catch (error) {
        storageAvailable = false;
        console.error("Trending cache is unavailable", error);
      }
    }

    const games = await fetchTrendingGames();
    const updatedAt = Date.now();
    const payload = { games };
    if (storageAvailable) {
      await getD1()
        .prepare("INSERT OR REPLACE INTO trending_cache (cache_key, payload, updated_at) VALUES (?, ?, ?)")
        .bind(CACHE_KEY, JSON.stringify(payload), updatedAt)
        .run()
        .catch((error) => console.error("Could not update trending cache", error));
    }
    return json(
      { ...payload, updatedAt, cached: false, storageAvailable },
      200,
      { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
    );
  } catch (error) {
    console.error("Could not fetch Steam top games", error);
    return json({ error: "Could not fetch Steam top games." }, 502);
  }
}

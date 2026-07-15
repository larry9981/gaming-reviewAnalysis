type SteamAppDetails = {
  success?: boolean;
  data?: {
    name?: string;
    type?: string;
    is_free?: boolean;
    required_age?: number;
    detailed_description?: string;
    short_description?: string;
    about_the_game?: string;
    header_image?: string;
    website?: string;
    developers?: string[];
    publishers?: string[];
    price_overview?: {
      currency?: string;
      initial_formatted?: string;
      final_formatted?: string;
      discount_percent?: number;
    };
    metacritic?: {
      score?: number;
      url?: string;
    };
    categories?: { description?: string }[];
    genres?: { description?: string }[];
    recommendations?: { total?: number };
    release_date?: {
      coming_soon?: boolean;
      date?: string;
    };
  };
};

type SteamReviewResponse = {
  success?: number;
  query_summary?: {
    review_score?: number;
    review_score_desc?: string;
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
  reviews?: {
    recommendationid?: string;
    review?: string;
    voted_up?: boolean;
    votes_up?: number;
    timestamp_created?: number;
  }[];
};

type RedditSearchResponse = {
  data?: {
    children?: {
      data?: {
        title?: string;
        selftext?: string;
        subreddit?: string;
        score?: number;
        num_comments?: number;
        permalink?: string;
        created_utc?: number;
      };
    }[];
  };
};

type Signal = {
  id: string;
  label: string;
  weight: number;
  detail: string;
  pattern: RegExp;
  source: "Steam" | "Reviews" | "Reddit";
};

const riskSignals: Signal[] = [
  {
    id: "negative_reviews",
    label: "Weak review sentiment",
    weight: 24,
    detail: "The public review score is mixed or negative.",
    pattern: /mixed|negative|mostly negative|overwhelmingly negative/i,
    source: "Steam",
  },
  {
    id: "refund",
    label: "Refund language",
    weight: 18,
    detail: "Players mention refunding, regretting, or not recommending the game.",
    pattern: /refund|refunded|not worth|regret|don't buy|do not buy|avoid|scam/i,
    source: "Reviews",
  },
  {
    id: "performance",
    label: "Performance complaints",
    weight: 16,
    detail: "Players complain about crashes, stutters, optimization, or bugs.",
    pattern: /crash|stutter|performance|optimization|bug|broken|fps|freeze|unplayable/i,
    source: "Reviews",
  },
  {
    id: "drm",
    label: "DRM / launcher friction",
    weight: 16,
    detail: "Extra accounts, launchers, or DRM may add friction.",
    pattern: /denuvo|drm|ubisoft connect|ea app|rockstar launcher|third-party|3rd-party|account required/i,
    source: "Steam",
  },
  {
    id: "monetization",
    label: "Monetization risk",
    weight: 14,
    detail: "DLC, battle pass, loot boxes, or microtransactions appear in public discussion.",
    pattern: /dlc|microtransaction|battle pass|loot box|in-app purchase|paywall|season pass/i,
    source: "Steam",
  },
  {
    id: "server",
    label: "Online service risk",
    weight: 12,
    detail: "Online dependency creates server, matchmaking, anti-cheat, or shutdown risk.",
    pattern: /server|matchmaking|online only|anti-cheat|queue|disconnect|shutdown|dead game/i,
    source: "Reviews",
  },
  {
    id: "early_access",
    label: "Early Access uncertainty",
    weight: 12,
    detail: "Roadmaps and unfinished content can change after purchase.",
    pattern: /early access|roadmap|unfinished|abandoned/i,
    source: "Steam",
  },
  {
    id: "ai_content",
    label: "AI content controversy",
    weight: 10,
    detail: "AI-generated content may affect quality or community perception.",
    pattern: /ai-generated|generative ai|ai content|artificial intelligence/i,
    source: "Steam",
  },
];

const positiveSignals = [
  /very positive/i,
  /overwhelmingly positive/i,
  /worth it/i,
  /masterpiece/i,
  /runs well/i,
  /recommended/i,
];

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function extractAppId(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (match) return match[1];
  const numeric = trimmed.match(/^\d{3,}$/);
  return numeric ? numeric[0] : null;
}

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string, headers: HeadersInit = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SteamGuardrail/0.2 public-signal-research",
      ...headers,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function verdict(score: number, reviewDesc = "") {
  if (score >= 72) {
    return {
      label: "Avoid for now",
      tone: "danger",
      summary:
        "Public signals show meaningful purchase risk. Wait for fixes, deeper discounts, or stronger recent reviews.",
    };
  }
  if (score >= 46) {
    return {
      label: "Wait for sale",
      tone: "warn",
      summary:
        "There are enough red flags to avoid paying full price. Check recent Steam reviews and Reddit threads first.",
    };
  }
  if (score >= 22 || /mixed/i.test(reviewDesc)) {
    return {
      label: "Buy with caution",
      tone: "watch",
      summary:
        "The game may be fine for the right player, but confirm the main complaints do not affect your use case.",
    };
  }
  return {
    label: "Likely safe",
    tone: "ok",
    summary:
      "No major public red flags were found from the available sources. Still check refund rules and recent reviews.",
  };
}

function sourceUrl(permalink?: string) {
  return permalink ? `https://www.reddit.com${permalink}` : "https://www.reddit.com";
}

export async function POST(request: Request) {
  const { input } = (await request.json().catch(() => ({}))) as { input?: string };
  const appId = extractAppId(input || "");
  if (!appId) {
    return json({ error: "Paste a Steam store URL or numeric App ID." }, 400);
  }

  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,genres,categories,release_date,price_overview,platforms,metacritic,recommendations,developers,publishers`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=recent&language=all&purchase_type=all&num_per_page=30`;

  const [detailsResult, reviewsResult] = await Promise.allSettled([
    fetchJson<Record<string, SteamAppDetails>>(detailsUrl),
    fetchJson<SteamReviewResponse>(reviewsUrl),
  ]);

  if (detailsResult.status === "rejected") {
    return json({ error: "Could not reach Steam app details. Try again in a moment." }, 502);
  }

  const app = detailsResult.value[appId];
  if (!app?.success || !app.data?.name) {
    return json({ error: "Steam did not return a valid game for that App ID." }, 404);
  }

  const details = app.data;
  const reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value : null;
  const reviewText = (reviews?.reviews || [])
    .map((review) => stripHtml(review.review))
    .filter(Boolean);
  const reviewSummary = reviews?.query_summary;

  let redditPosts: {
    title: string;
    subreddit: string;
    score: number;
    comments: number;
    url: string;
    text: string;
  }[] = [];
  let redditError: string | null = null;

  try {
    const redditQuery = encodeURIComponent(`${details.name} Steam review OR bug OR refund OR worth it`);
    const reddit = await fetchJson<RedditSearchResponse>(
      `https://www.reddit.com/search.json?q=${redditQuery}&sort=relevance&limit=8&t=year`,
    );
    redditPosts = (reddit.data?.children || [])
      .map((item) => item.data)
      .filter(Boolean)
      .map((post) => ({
        title: post?.title || "Reddit discussion",
        subreddit: post?.subreddit || "reddit",
        score: post?.score || 0,
        comments: post?.num_comments || 0,
        url: sourceUrl(post?.permalink),
        text: `${post?.title || ""} ${post?.selftext || ""}`.trim(),
      }))
      .slice(0, 6);
  } catch (error) {
    redditError = error instanceof Error ? error.message : "Reddit unavailable";
  }

  const steamBlob = [
    details.name,
    details.short_description,
    details.detailed_description,
    details.about_the_game,
    details.categories?.map((item) => item.description).join(" "),
    details.genres?.map((item) => item.description).join(" "),
    reviewSummary?.review_score_desc,
  ]
    .map(stripHtml)
    .join(" ");
  const reviewBlob = reviewText.join(" ");
  const redditBlob = redditPosts.map((post) => post.text).join(" ");
  const allText = `${steamBlob} ${reviewBlob} ${redditBlob}`;

  const hits = riskSignals
    .filter((signal) => {
      const blob =
        signal.source === "Reddit" ? redditBlob : signal.source === "Reviews" ? reviewBlob : allText;
      return signal.pattern.test(blob);
    })
    .map((signal) => ({
      id: signal.id,
      label: signal.label,
      detail: signal.detail,
      source: signal.source,
      weight: signal.weight,
    }));

  const reviewScorePenalty = reviewSummary
    ? reviewSummary.total_reviews && reviewSummary.total_reviews > 0
      ? Math.max(0, Math.round((reviewSummary.total_negative / reviewSummary.total_reviews) * 36))
      : 0
    : 8;
  const publicDiscussionPenalty = Math.min(16, redditPosts.filter((post) => /refund|bug|crash|avoid|scam|broken|not worth/i.test(post.text)).length * 5);
  const positiveOffset = positiveSignals.some((pattern) => pattern.test(allText)) ? 8 : 0;
  const riskScore = Math.max(
    0,
    Math.min(100, hits.reduce((sum, hit) => sum + hit.weight, 0) + reviewScorePenalty + publicDiscussionPenalty - positiveOffset),
  );
  const resultVerdict = verdict(riskScore, reviewSummary?.review_score_desc || "");

  const topComplaints = [
    ["Performance / bugs", /crash|stutter|performance|optimization|bug|broken|fps|freeze|unplayable/i],
    ["Refund / regret", /refund|refunded|not worth|regret|don't buy|do not buy|avoid|scam/i],
    ["Monetization", /dlc|microtransaction|battle pass|loot box|in-app purchase|paywall|season pass/i],
    ["DRM / launcher", /denuvo|drm|ubisoft connect|ea app|rockstar launcher|third-party|3rd-party|account required/i],
    ["Online / servers", /server|matchmaking|online only|anti-cheat|queue|disconnect|shutdown|dead game/i],
  ]
    .map(([label, pattern]) => ({
      label: label as string,
      count: [reviewBlob, redditBlob].filter((blob) => (pattern as RegExp).test(blob)).length,
    }))
    .filter((item) => item.count > 0)
    .slice(0, 4);

  return json({
    appId,
    game: {
      name: details.name,
      image: details.header_image,
      developers: details.developers || [],
      publishers: details.publishers || [],
      price: details.is_free ? "Free to Play" : details.price_overview?.final_formatted || "Price unavailable",
      discount: details.price_overview?.discount_percent || 0,
      releaseDate: details.release_date?.date || "Unknown",
      comingSoon: Boolean(details.release_date?.coming_soon),
      metacritic: details.metacritic?.score || null,
      recommendations: details.recommendations?.total || null,
      steamUrl: `https://store.steampowered.com/app/${appId}`,
    },
    verdict: resultVerdict,
    riskScore,
    signals: hits,
    reviewSummary: reviewSummary
      ? {
          description: reviewSummary.review_score_desc || "Unknown",
          positive: reviewSummary.total_positive || 0,
          negative: reviewSummary.total_negative || 0,
          total: reviewSummary.total_reviews || 0,
        }
      : null,
    topComplaints,
    steamReviews: reviewText.slice(0, 5),
    reddit: {
      posts: redditPosts,
      error: redditError,
      searchUrl: `https://www.reddit.com/search/?q=${encodeURIComponent(`${details.name} Steam review bug refund worth it`)}`,
    },
    limitations: [
      "Reddit access uses public search and may be rate-limited.",
      "YouTube, X, TikTok, and Discord require official APIs or partner access for reliable production coverage.",
      "This is a purchase-assistance signal, not a guarantee of game quality.",
    ],
  });
}

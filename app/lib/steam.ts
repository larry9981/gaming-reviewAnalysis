export type AnalysisResult = {
  appId: string;
  game: {
    name: string;
    image?: string;
    developers: string[];
    publishers: string[];
    genres: string[];
    categories: string[];
    story: string;
    price: string;
    discount: number;
    releaseDate: string;
    comingSoon: boolean;
    metacritic: number | null;
    recommendations: number | null;
    steamUrl: string;
  };
  verdict: {
    label: string;
    tone: "danger" | "warn" | "watch" | "ok";
    summary: string;
  };
  riskScore: number;
  signals: {
    id: string;
    label: string;
    detail: string;
    source: string;
    weight: number;
  }[];
  reviewSummary: {
    description: string;
    positive: number;
    negative: number;
    total: number;
  } | null;
  topComplaints: {
    label: string;
    count: number;
  }[];
  steamReviews: string[];
  reddit: {
    posts: {
      title: string;
      subreddit: string;
      score: number;
      comments: number;
      url: string;
    }[];
    error: string | null;
    searchUrl: string;
  };
  platformFeedback: {
    platform: "Steam" | "Reddit" | "YouTube" | "TikTok" | "Facebook" | "Instagram";
    sentiment: "Positive" | "Mixed" | "Negative" | "Watch";
    score: number;
    volume: number;
    summary: string;
    source: string;
    url?: string;
  }[];
  sentimentBreakdown: {
    positive: number;
    mixed: number;
    negative: number;
  };
  contentBrief: {
    story: string;
    characters: string[];
    scenes: string[];
    tips: string[];
    walkthroughSkills: string[];
    buyerAnalysis: string;
  };
  limitations: string[];
};

type SteamAppDetails = {
  success?: boolean;
  data?: {
    name?: string;
    is_free?: boolean;
    detailed_description?: string;
    short_description?: string;
    about_the_game?: string;
    header_image?: string;
    developers?: string[];
    publishers?: string[];
    price_overview?: {
      final_formatted?: string;
      discount_percent?: number;
    };
    metacritic?: {
      score?: number;
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
  query_summary?: {
    review_score_desc?: string;
    total_positive?: number;
    total_negative?: number;
    total_reviews?: number;
  };
  reviews?: {
    review?: string;
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

export function extractAppId(input: string) {
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
      "User-Agent": "SteamGuardrail/0.3 public-signal-research",
      ...headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

function verdict(score: number, reviewDesc = "") {
  if (score >= 72) {
    return {
      label: "Avoid for now",
      tone: "danger" as const,
      summary:
        "Public signals show meaningful purchase risk. Wait for fixes, deeper discounts, or stronger recent reviews.",
    };
  }
  if (score >= 46) {
    return {
      label: "Wait for sale",
      tone: "warn" as const,
      summary:
        "There are enough red flags to avoid paying full price. Check recent Steam reviews and Reddit threads first.",
    };
  }
  if (score >= 22 || /mixed/i.test(reviewDesc)) {
    return {
      label: "Buy with caution",
      tone: "watch" as const,
      summary:
        "The game may be fine for the right player, but confirm the main complaints do not affect your use case.",
    };
  }
  return {
    label: "Likely safe",
    tone: "ok" as const,
    summary:
      "No major public red flags were found from the available sources. Still check refund rules and recent reviews.",
  };
}

function sourceUrl(permalink?: string) {
  return permalink ? `https://www.reddit.com${permalink}` : "https://www.reddit.com";
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function percentScore(value: number) {
  return Math.round(clamp(value));
}

function sentimentLabel(score: number): "Positive" | "Mixed" | "Negative" | "Watch" {
  if (score >= 70) return "Positive";
  if (score >= 48) return "Mixed";
  if (score >= 30) return "Watch";
  return "Negative";
}

function compactSummary(text = "", fallback: string) {
  const clean = stripHtml(text);
  if (!clean) return fallback;
  return clean.length > 360 ? `${clean.slice(0, 357)}...` : clean;
}

function buildContentBrief({
  name,
  shortDescription,
  about,
  genres,
  categories,
  riskScore,
  verdictLabel,
}: {
  name: string;
  shortDescription?: string;
  about?: string;
  genres: string[];
  categories: string[];
  riskScore: number;
  verdictLabel: string;
}) {
  const genreText = genres.length ? genres.join(", ") : "PC game";
  const categoryText = categories.join(" ").toLowerCase();
  const story = compactSummary(
    shortDescription || about,
    `${name} is positioned as a ${genreText} title. Use the full Steam page and recent reviews to confirm whether the theme, pacing, and content depth match what you want before buying.`,
  );
  const characters = [
    categoryText.includes("single-player") ? "Solo player progression and main playable role" : "Player squad, opponents, or online lobby roles",
    categoryText.includes("co-op") || categoryText.includes("multi-player")
      ? "Co-op teammates and competitive player archetypes"
      : "NPCs, bosses, companions, or world factions mentioned by the game page",
    genres.some((genre) => /rpg|adventure|story/i.test(genre))
      ? "Story-driving characters and quest givers"
      : "Core gameplay roles defined by the genre loop",
  ];
  const scenes = [
    genres.some((genre) => /strategy|simulation/i.test(genre)) ? "Planning screens, resource decisions, and long-session management" : "Opening tutorial and first-hour gameplay loop",
    genres.some((genre) => /action|shooter|fighting/i.test(genre)) ? "Combat arenas, boss encounters, and high-input moments" : "Exploration, progression, and repeatable challenge areas",
    categoryText.includes("online") ? "Matchmaking, servers, events, and late-game online systems" : "Campaign chapters, side content, and replayable modes",
  ];
  const tips = [
    "Read the most recent negative Steam reviews first; older praise can hide new bugs or monetization changes.",
    riskScore >= 46 ? "Wait for a discount or a patch cycle before paying full price." : "Still check refund-window performance on your own PC setup.",
    categoryText.includes("online") ? "Check server population, anti-cheat complaints, and region matchmaking before purchase." : "Check save system, difficulty curve, and first-hour pacing before keeping it.",
    "Compare YouTube gameplay footage with written reviews; edited trailers often hide grind, UI friction, and repeated content.",
  ];
  const walkthroughSkills = [
    genres.some((genre) => /strategy|simulation|management/i.test(genre))
      ? "Map the economy loop first: identify the resource that blocks progress, then build upgrades around that bottleneck instead of spreading upgrades evenly."
      : "Spend the first hour learning the core loop before chasing side objectives; most failed runs come from ignoring tutorial combat, movement, or resource habits.",
    genres.some((genre) => /action|shooter|fighting|souls/i.test(genre))
      ? "Practice dodge, parry, reload, stamina, or cooldown timing in low-risk fights before pushing bosses or ranked modes."
      : "Use early low-pressure areas to test controls, camera, inventory, quest tracking, and save behavior before passing the refund window.",
    categoryText.includes("co-op") || categoryText.includes("multi-player") || categoryText.includes("online")
      ? "For online progress, verify server region, matchmaking time, role balance, and anti-cheat complaints before committing to grind-heavy systems."
      : "For solo progress, keep a manual save before major branches, difficulty spikes, or irreversible upgrades so you can recover from bad choices.",
    genres.some((genre) => /rpg|adventure|open world/i.test(genre))
      ? "Prioritize survivability, mobility, and utility upgrades before pure damage; this usually reduces wasted time in exploration-heavy campaigns."
      : "Watch full gameplay segments instead of highlight clips to learn the real pacing, repeated objectives, UI friction, and endgame loop.",
    riskScore >= 46
      ? "Because public risk is elevated, delay advanced guides until after checking patch notes and recent negative reviews for broken quests, crashes, or balance changes."
      : "If the signal looks healthy, use creator walkthroughs mainly to confirm build paths, hidden mechanics, and difficulty spikes rather than to decide whether to buy.",
  ];
  const buyerAnalysis =
    riskScore >= 72
      ? `${verdictLabel}: the public signal mix suggests a high chance of buyer regret. Treat this as a waitlist game unless you strongly match its niche.`
      : riskScore >= 46
        ? `${verdictLabel}: the game may be worth watching, but the current signal mix argues against full-price impulse buying.`
        : `${verdictLabel}: public signals look relatively healthy, but the safest move is still to verify performance and recent complaints.`;
  return { story, characters, scenes, tips, walkthroughSkills, buyerAnalysis };
}

export async function analyzeSteamApp(appId: string): Promise<AnalysisResult> {
  const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic,genres,categories,release_date,price_overview,platforms,metacritic,recommendations,developers,publishers`;
  const reviewsUrl = `https://store.steampowered.com/appreviews/${appId}?json=1&filter=recent&language=english&purchase_type=all&num_per_page=30`;

  const [detailsResult, reviewsResult] = await Promise.allSettled([
    fetchJson<Record<string, SteamAppDetails>>(detailsUrl),
    fetchJson<SteamReviewResponse>(reviewsUrl),
  ]);

  if (detailsResult.status === "rejected") {
    throw new Error("Could not reach Steam app details.");
  }

  const app = detailsResult.value[appId];
  if (!app?.success || !app.data?.name) {
    throw new Error("Steam did not return a valid game for that App ID.");
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
      ? Math.max(0, Math.round(((reviewSummary.total_negative || 0) / reviewSummary.total_reviews) * 36))
      : 0
    : 8;
  const publicDiscussionPenalty = Math.min(
    16,
    redditPosts.filter((post) => /refund|bug|crash|avoid|scam|broken|not worth/i.test(post.text)).length * 5,
  );
  const positiveOffset = positiveSignals.some((pattern) => pattern.test(allText)) ? 8 : 0;
  const riskScore = Math.max(
    0,
    Math.min(100, hits.reduce((sum, hit) => sum + hit.weight, 0) + reviewScorePenalty + publicDiscussionPenalty - positiveOffset),
  );
  const resultVerdict = verdict(riskScore, reviewSummary?.review_score_desc || "");
  const genres = details.genres?.map((item) => item.description || "").filter(Boolean) || [];
  const categories = details.categories?.map((item) => item.description || "").filter(Boolean) || [];

  const gameName = details.name || `Steam App ${appId}`;

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

  const steamPositiveRatio = reviewSummary?.total_reviews
    ? Math.round(((reviewSummary.total_positive || 0) / reviewSummary.total_reviews) * 100)
    : clamp(82 - riskScore);
  const redditRiskHits = redditPosts.filter((post) => /refund|bug|crash|avoid|scam|broken|not worth/i.test(post.text)).length;
  const redditScore = redditPosts.length ? percentScore(66 - redditRiskHits * 12 + Math.min(12, redditPosts.length * 2)) : percentScore(58 - riskScore / 3);
  const socialBase = percentScore(76 - riskScore + Math.min(10, (reviewSummary?.total_reviews || 0) / 5000));
  const platformFeedback = [
    {
      platform: "Steam" as const,
      sentiment: sentimentLabel(steamPositiveRatio),
      score: percentScore(steamPositiveRatio),
      volume: reviewSummary?.total_reviews || 0,
      summary: `${reviewSummary?.review_score_desc || "Unknown"} across ${reviewSummary?.total_reviews?.toLocaleString("en-US") || "unknown"} public Steam reviews.`,
      source: "Steam public reviews",
      url: `https://store.steampowered.com/app/${appId}`,
    },
    {
      platform: "Reddit" as const,
      sentiment: sentimentLabel(redditScore),
      score: redditScore,
      volume: redditPosts.reduce((sum, post) => sum + post.comments, 0),
      summary: redditPosts.length
        ? `${redditPosts.length} public Reddit threads found; ${redditRiskHits} contain refund, bug, crash, or avoid language.`
        : "Reddit public search returned limited data for this title.",
      source: redditPosts.length ? "Reddit public search" : "Reddit search limited",
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(`${gameName} Steam review bug refund worth it`)}`,
    },
    {
      platform: "YouTube" as const,
      sentiment: sentimentLabel(socialBase + 4),
      score: percentScore(socialBase + 4),
      volume: Math.max(12, Math.round((reviewSummary?.total_reviews || 1000) / 180)),
      summary: "Modeled from public review strength and risk language. Use linked search to compare gameplay footage and review videos.",
      source: "Modeled signal + search link",
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${gameName} review gameplay Steam`)}`,
    },
    {
      platform: "TikTok" as const,
      sentiment: sentimentLabel(socialBase - 2),
      score: percentScore(socialBase - 2),
      volume: Math.max(8, Math.round((reviewSummary?.total_reviews || 1000) / 260)),
      summary: "Modeled short-form buzz signal. Useful for hype detection, clips, glitches, and first-impression complaints.",
      source: "Modeled signal + search link",
      url: `https://www.tiktok.com/search?q=${encodeURIComponent(`${gameName} game review`)}`,
    },
    {
      platform: "Facebook" as const,
      sentiment: sentimentLabel(socialBase - 6),
      score: percentScore(socialBase - 6),
      volume: Math.max(6, Math.round((reviewSummary?.total_reviews || 1000) / 320)),
      summary: "Modeled broad-community signal. Best used for group complaints, deal comments, and casual-player reactions.",
      source: "Modeled signal + search link",
      url: `https://www.facebook.com/search/top?q=${encodeURIComponent(`${gameName} game review`)}`,
    },
    {
      platform: "Instagram" as const,
      sentiment: sentimentLabel(socialBase),
      score: socialBase,
      volume: Math.max(6, Math.round((reviewSummary?.total_reviews || 1000) / 300)),
      summary: "Modeled visual buzz signal. Useful for trailer reception, aesthetic appeal, cosplay/fan-art momentum, and creator posts.",
      source: "Modeled signal + search link",
      url: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(gameName)}`,
    },
  ];
  const positive = Math.round(platformFeedback.reduce((sum, item) => sum + item.score, 0) / platformFeedback.length);
  const negative = clamp(riskScore);
  const mixed = clamp(100 - Math.round((positive + negative) / 2));
  const totalBreakdown = positive + mixed + negative || 1;
  const sentimentBreakdown = {
    positive: Math.round((positive / totalBreakdown) * 100),
    mixed: Math.round((mixed / totalBreakdown) * 100),
    negative: Math.round((negative / totalBreakdown) * 100),
  };
  const contentBrief = buildContentBrief({
    name: gameName,
    shortDescription: details.short_description,
    about: details.about_the_game,
    genres,
    categories,
    riskScore,
    verdictLabel: resultVerdict.label,
  });

  return {
    appId,
    game: {
      name: gameName,
      image: details.header_image,
      developers: details.developers || [],
      publishers: details.publishers || [],
      genres,
      categories,
      story: contentBrief.story,
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
    platformFeedback,
    sentimentBreakdown,
    contentBrief,
    limitations: [
      "Reddit access uses public search and may be rate-limited.",
      "Facebook, TikTok, YouTube, and Instagram cards are modeled public-signal summaries until official platform APIs are connected.",
      "This is a purchase-assistance signal, not a guarantee of game quality.",
    ],
  };
}

export async function getTopSteamAppIds() {
  const response = await fetch(
    "https://store.steampowered.com/search/results/?query&start=0&count=30&dynamic_data=&sort_by=_ASC&snr=1_7_7_topsellers_7&filter=topsellers&infinite=1",
    {
      headers: {
        "User-Agent": "SteamGuardrail/0.3 top-games-research",
      },
    },
  );
  if (!response.ok) throw new Error(`Steam top sellers unavailable: ${response.status}`);
  const data = (await response.json()) as { results_html?: string };
  const ids = [...(data.results_html || "").matchAll(/data-ds-appid="(\d+)"/g)].map((match) => match[1]);
  return [...new Set(ids)].slice(0, 30);
}

"use client";

import { useEffect, useMemo, useState } from "react";

type User = {
  id: string;
  email: string;
  role: string;
};

type TopGame = {
  appId: string;
  name: string;
  image?: string;
  price: string;
  reviewSummary: string;
  riskScore: number;
  verdict: string;
  tone: "danger" | "warn" | "watch" | "ok";
  topSignals: string[];
  redditAvailable: boolean;
  steamUrl: string;
};

type AnalysisResult = {
  appId: string;
  game: {
    name: string;
    image?: string;
    price: string;
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
  }[];
  reviewSummary: {
    description: string;
    positive: number;
    negative: number;
    total: number;
  } | null;
  topComplaints: { label: string; count: number }[];
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
};

type Paywall = {
  appId: string;
  plans: { id: "single" | "monthly"; label: string; price: string; appId?: string }[];
};

function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Unknown";
}

export default function Home() {
  const [games, setGames] = useState<TopGame[]>([]);
  const [gamesError, setGamesError] = useState("");
  const [loadingGames, setLoadingGames] = useState(true);
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<TopGame | null>(null);
  const [report, setReport] = useState<AnalysisResult | null>(null);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [admin, setAdmin] = useState<{ users: number; activeEntitlements: number } | null>(null);

  const highlighted = useMemo(() => selected || games[0] || null, [games, selected]);

  async function loadMe() {
    const response = await fetch("/api/me");
    const data = await response.json();
    setUser(data.user || null);
  }

  async function loadTrending() {
    setLoadingGames(true);
    setGamesError("");
    try {
      const response = await fetch("/api/trending");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load top games.");
      setGames(data.games || []);
      setSelected(data.games?.[0] || null);
    } catch (error) {
      setGamesError(error instanceof Error ? error.message : "Could not load top games.");
    } finally {
      setLoadingGames(false);
    }
  }

  async function verifyCheckout(sessionId: string) {
    const response = await fetch("/api/checkout/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage("Payment confirmed. Your full reports are unlocked.");
      await loadMe();
    } else {
      setMessage(data.error || "Checkout confirmation is still pending.");
    }
  }

  async function verifyPayPal(params: URLSearchParams) {
    const orderId = params.get("token");
    const subscriptionId = params.get("subscription_id") || params.get("ba_token");
    const response = await fetch("/api/paypal/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, subscriptionId }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage("PayPal payment confirmed. Your full reports are unlocked.");
      await loadMe();
    } else {
      setMessage(data.error || "PayPal confirmation is still pending.");
    }
  }

  useEffect(() => {
    loadMe();
    loadTrending();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") === "success" && sessionId) {
      verifyCheckout(sessionId);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("checkout") === "cancelled") {
      setMessage("Checkout cancelled. No charge was made.");
      window.history.replaceState({}, "", "/");
    }
    if (params.get("paypal") === "success" || params.get("paypal_subscription") === "success") {
      verifyPayPal(params);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("paypal") === "cancelled") {
      setMessage("PayPal checkout cancelled. No charge was made.");
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function auth() {
    setMessage("");
    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Authentication failed.");
      return;
    }
    setUser(data.user);
    setPassword("");
    setMessage("You are signed in.");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAdmin(null);
    setMessage("Signed out.");
  }

  async function openReport(appId = input || selected?.appId || "") {
    const clean = appId.trim();
    if (!clean) return;
    setMessage("");
    setReport(null);
    setPaywall(null);
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: clean }),
    });
    const data = await response.json();
    if (response.status === 402) {
      setPaywall(data);
      setMessage("Full report is locked. Choose a plan to continue.");
      return;
    }
    if (!response.ok) {
      setMessage(data.error || "Report failed.");
      return;
    }
    setReport(data);
  }

  async function checkout(plan: "single" | "monthly", appId?: string, provider: "stripe" | "paypal" = "stripe") {
    if (!user) {
      setMessage("Create an account or log in before checkout.");
      return;
    }
    const response = await fetch(provider === "paypal" ? "/api/paypal/checkout" : "/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, appId: appId || selected?.appId || paywall?.appId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Checkout could not start.");
      return;
    }
    window.location.href = data.checkoutUrl;
  }

  async function loadAdmin() {
    const response = await fetch("/api/admin");
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Admin unavailable.");
      return;
    }
    setAdmin(data);
  }

  return (
    <main className="app-shell">
      <section className="hero-band product-hero">
        <div className="hero-copy">
          <p className="eyebrow">Steam sale armor</p>
          <h1>Don&apos;t buy your next regret.</h1>
          <p className="subcopy">
            Steam Guardrail scans trending games before players spend. We surface review bombs, refund clues, DRM complaints,
            DLC traps, and social backlash so the hype does not empty your wallet.
          </p>
          <div className="hero-chips" aria-label="Product benefits">
            <span>Top 30 scanned live</span>
            <span>Refund-risk alerts</span>
            <span>DRM and DLC warnings</span>
            <span>Pay once or subscribe</span>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={loadTrending}>
              Scan the top 30 now
            </button>
            <button type="button" className="secondary-action" onClick={() => highlighted?.appId && openReport(highlighted.appId)}>
              Unlock a buyer&apos;s report
            </button>
          </div>
          <div className="search-box">
            <label htmlFor="steam-input">Analyze any Steam URL or App ID</label>
            <div className="search-row">
              <input
                id="steam-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://store.steampowered.com/app/..."
              />
              <button type="button" onClick={() => openReport()}>
                Check before buying
              </button>
            </div>
          </div>
          {message ? <div className="error-box neutral">{message}</div> : null}
        </div>

        <aside className="auth-panel">
          <p className="eyebrow">Player account</p>
          {user ? (
            <>
              <strong>{user.email}</strong>
              <span>Your paid reports and monthly unlocks follow this account across devices.</span>
              <button type="button" onClick={logout}>
                Sign out
              </button>
              {user.role === "admin" ? (
                <button type="button" onClick={loadAdmin}>
                  Load admin dashboard
                </button>
              ) : null}
            </>
          ) : (
            <>
              <span className="auth-pitch">Create an account to save unlocks, subscriptions, and every report you buy.</span>
              <div className="tab-row">
                <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                  Register
                </button>
                <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                  Login
                </button>
              </div>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
              <button type="button" onClick={auth}>
                {authMode === "register" ? "Create account" : "Log in"}
              </button>
            </>
          )}
        </aside>
      </section>

      {admin ? (
        <section className="admin-strip">
          <div>
            <span>Registered users</span>
            <strong>{admin.users}</strong>
          </div>
          <div>
            <span>Active paid entitlements</span>
            <strong>{admin.activeEntitlements}</strong>
          </div>
        </section>
      ) : null}

      <section className="workspace leaderboard">
        <section className="report-card">
          <div className="score-row">
            <div>
              <p>Steam Top 30 purchase board</p>
              <h2>Hype vs. regret</h2>
            </div>
            <button type="button" onClick={loadTrending}>
              Refresh
            </button>
          </div>
          {loadingGames ? <div className="review-snapshot">Fetching Steam top sellers and public review signals...</div> : null}
          {gamesError ? <div className="error-box">{gamesError}</div> : null}
          <div className="game-list">
            {games.map((game, index) => (
              <button
                key={game.appId}
                type="button"
                className={`game-row ${selected?.appId === game.appId ? "selected" : ""}`}
                onClick={() => setSelected(game)}
              >
                <span className="rank-badge">{index + 1}</span>
                <img src={game.image} alt="" />
                <div className="game-title">
                  <strong>{game.name}</strong>
                  <small>Risk {game.riskScore}/100</small>
                </div>
                <small>{game.reviewSummary}</small>
                <em className={game.tone}>{game.verdict}</em>
              </button>
            ))}
          </div>
        </section>

        <aside className={`verdict-panel ${highlighted?.tone || "watch"}`}>
          <p className="eyebrow">Before you buy</p>
          <strong>{highlighted?.name || "Choose a game"}</strong>
          <span>{highlighted ? `${highlighted.price} · ${highlighted.reviewSummary}` : "Select a top game to inspect its free summary."}</span>
          <div className="selected-meta">
            <div>
              <span>Risk score</span>
              <strong>{highlighted?.riskScore ?? "--"}</strong>
            </div>
            <div>
              <span>Buy verdict</span>
              <strong>{highlighted?.verdict || "Pick a game"}</strong>
            </div>
          </div>
          {highlighted ? (
            <>
              <div className="mini-signals">
                {(highlighted.topSignals.length ? highlighted.topSignals : ["No major public red flags"]).map((signal) => (
                  <span key={signal}>{signal}</span>
                ))}
              </div>
              <div className="conversion-list">
                <span>Steam reviews</span>
                <span>Public backlash</span>
                <span>Refund clues</span>
              </div>
              <button type="button" onClick={() => openReport(highlighted.appId)}>
                Unlock the buyer&apos;s report
              </button>
            </>
          ) : null}
        </aside>
      </section>

      {paywall ? (
        <section className="pricing-grid">
          <article className="price-card">
            <p className="eyebrow">One game, one clean answer</p>
            <h2>$19.90</h2>
            <p>Unlock the complete buy-or-skip report for Steam App {paywall.appId}. Best when one expensive game is on your mind.</p>
            <button type="button" onClick={() => checkout("single", paywall.appId, "stripe")}>
              Pay by card
            </button>
            <button type="button" onClick={() => checkout("single", paywall.appId, "paypal")}>
              PayPal
            </button>
          </article>
          <article className="price-card featured">
            <p className="eyebrow">Best for Steam sale season</p>
            <h2>$12.99/mo</h2>
            <p>Unlimited full reports while your subscription remains active. Compare wishlisted games before every checkout.</p>
            <button type="button" onClick={() => checkout("monthly", paywall.appId, "stripe")}>
              Subscribe by card
            </button>
            <button type="button" onClick={() => checkout("monthly", paywall.appId, "paypal")}>
              Subscribe with PayPal
            </button>
          </article>
          <article className="price-card">
            <p className="eyebrow">Payment methods</p>
            <h2>Cards + PayPal</h2>
            <p>PayPal is connected for real checkout. Credit card buttons use Stripe Checkout after Stripe keys are added.</p>
            <div className="method-row">
              <span>PayPal</span>
              <strong>Live</strong>
            </div>
            <div className="method-row muted">
              <span>Cards</span>
              <strong>Needs Stripe keys</strong>
            </div>
          </article>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="game-summary">
            <div className="game-art">{report.game.image ? <img src={report.game.image} alt="" /> : null}</div>
            <div className="game-facts">
              <p className="eyebrow">Paid full report</p>
              <h2>{report.game.name}</h2>
              <div className="fact-grid">
                <div>
                  <span>Verdict</span>
                  <strong>{report.verdict.label}</strong>
                </div>
                <div>
                  <span>Risk score</span>
                  <strong>{report.riskScore}</strong>
                </div>
                <div>
                  <span>Total reviews</span>
                  <strong>{formatNumber(report.reviewSummary?.total)}</strong>
                </div>
                <div>
                  <span>Metacritic</span>
                  <strong>{report.game.metacritic ?? "Unknown"}</strong>
                </div>
              </div>
              <a className="source-link" href={report.game.steamUrl} target="_blank" rel="noreferrer">
                Open Steam page
              </a>
            </div>
          </section>

          <section className="business-grid public-sources">
            <article className="pro-card">
              <div className="panel-heading">
                <p>Risk signals</p>
                <h2>{report.signals.length} red flags</h2>
              </div>
              <div className="signals-grid single-column">
                {(report.signals.length ? report.signals : [{ id: "clean", label: "No major red flags", detail: "Available public data looks relatively clean.", source: "Steam" }]).map((signal) => (
                  <article key={signal.id} className="signal-card">
                    <strong>{signal.label}</strong>
                    <span>{signal.detail}</span>
                    <small>{signal.source}</small>
                  </article>
                ))}
              </div>
            </article>

            <article className="watchlist-card">
              <div className="panel-heading">
                <p>Steam review snapshot</p>
                <h2>{report.reviewSummary?.description || "Unknown"}</h2>
              </div>
              {report.steamReviews.slice(0, 4).map((review, index) => (
                <div key={`${index}-${review.slice(0, 8)}`} className="watch-item">
                  <span>Recent public review</span>
                  <strong>{review.slice(0, 180)}</strong>
                </div>
              ))}
            </article>

            <article className="calculator-card">
              <div className="panel-heading">
                <p>Social discussion</p>
                <h2>Reddit / public web</h2>
              </div>
              {report.reddit.posts.length ? (
                report.reddit.posts.map((post) => (
                  <a key={post.url} className="reddit-item" href={post.url} target="_blank" rel="noreferrer">
                    <span>r/{post.subreddit}</span>
                    <strong>{post.title}</strong>
                    <small>{post.comments.toLocaleString("en-US")} comments</small>
                  </a>
                ))
              ) : (
                <div className="review-snapshot">
                  <strong>Reddit API limited</strong>
                  <p>{report.reddit.error || "No Reddit posts returned."}</p>
                  <a className="source-link" href={report.reddit.searchUrl} target="_blank" rel="noreferrer">
                    Search Reddit manually
                  </a>
                </div>
              )}
            </article>
          </section>
        </>
      ) : null}
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type User = {
  id: string;
  email: string;
  username?: string | null;
  role: string;
};

type Entitlement = {
  kind: string;
  appId?: string | null;
  status: string;
  provider?: string;
  currentPeriodEnd?: number | null;
  createdAt: number;
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
    developers?: string[];
    publishers?: string[];
    genres?: string[];
    categories?: string[];
    story?: string;
    price: string;
    discount?: number;
    releaseDate?: string;
    comingSoon?: boolean;
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
    buyerAnalysis: string;
  };
  limitations: string[];
};

type Paywall = {
  appId: string;
  preview?: AnalysisResult;
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
  const [reportLocked, setReportLocked] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [paywall, setPaywall] = useState<Paywall | null>(null);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("register");
  const [authBusy, setAuthBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<"single-stripe" | "single-paypal" | "monthly-stripe" | "monthly-paypal" | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [admin, setAdmin] = useState<{
    users: number;
    activeEntitlements: number;
    userRows?: { id: string; email: string; username?: string | null; role: string; entitlementCount: number; createdAt: number }[];
    entitlementRows?: { id: string; email: string; username?: string | null; kind: string; appId?: string | null; status: string; provider: string; createdAt: number }[];
  } | null>(null);

  const highlighted = useMemo(() => selected || games[0] || null, [games, selected]);
  const visibleGames = useMemo(() => games.slice(0, 10), [games]);
  const hiddenGames = useMemo(() => games.slice(10), [games]);
  const bannerGames = useMemo(() => games.filter((game) => game.image).slice(0, 3), [games]);
  const topFiveGames = useMemo(() => games.slice(0, 5), [games]);

  async function loadMe() {
    const response = await fetch("/api/me");
    const data = await response.json();
    setUser(data.user || null);
    setEntitlements(data.entitlements || []);
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
    setAuthBusy(true);
    try {
      if (authMode === "forgot") {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await response.json().catch(() => ({ error: "Password reset failed." }));
        setMessage(data.message || data.error || "Password reset requested.");
        return;
      }
      if (authMode === "reset") {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: resetToken, password }),
        });
        const data = await response.json().catch(() => ({ error: "Password reset failed." }));
        if (!response.ok) {
          setMessage(data.error || "Password reset failed.");
          return;
        }
        setMessage(data.message || "Password updated.");
        setPassword("");
        setResetToken("");
        setAuthMode("login");
        return;
      }
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await response.json().catch(() => ({ error: "Authentication failed. Please try again." }));
      if (!response.ok) {
        setMessage(data.error || "Authentication failed.");
        return;
      }
      setUser(data.user);
      setPassword("");
      setMessage("You are signed in. You can continue to PayPal checkout.");
      await loadMe();
    } catch {
      setMessage("Authentication failed. Please check your connection and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setEntitlements([]);
    setAdmin(null);
    setMessage("Signed out.");
  }

  async function cancelSubscription() {
    const response = await fetch("/api/account/cancel-subscription", { method: "POST" });
    const data = await response.json().catch(() => ({ error: "Cancellation failed." }));
    if (!response.ok) {
      setMessage(data.error || "Cancellation failed.");
      return;
    }
    setMessage(data.message || "Subscription cancelled.");
    await loadMe();
  }

  async function openReport(appId = input || selected?.appId || "") {
    const clean = appId.trim();
    if (!clean) return;
    setMessage("");
    setReport(null);
    setReportLocked(false);
    setPaywall(null);
    setReportBusy(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: clean }),
      });
      const data = await response.json().catch(() => ({ error: "Report failed." }));
      if (response.status === 402) {
        setPaywall(data);
        if (data.preview) {
          setReport(data.preview);
          setReportLocked(true);
        }
        setMessage("This game report is locked. Choose a plan to view the full analysis.");
        return;
      }
      if (!response.ok) {
        setMessage(data.error || "Report failed.");
        return;
      }
      setReport(data);
      setReportLocked(false);
      setMessage("Full report unlocked.");
    } catch {
      setMessage("Report failed. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }

  function selectGame(game: TopGame) {
    setSelected(game);
    setInput(game.appId);
    openReport(game.appId);
  }

  function openPaidPlatform() {
    setMessage("Subscribe or buy the single report to open detailed platform feedback sources.");
    setPaywall((current) => current || (report ? { appId: report.appId, plans: [] } : null));
    document.querySelector(".pricing-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function checkout(plan: "single" | "monthly", appId?: string, provider: "stripe" | "paypal" = "stripe") {
    if (!user) {
      setMessage("Create an account or log in before checkout. Your PayPal window opens after sign in.");
      return;
    }
    const busyKey = `${plan}-${provider}` as typeof checkoutBusy;
    setCheckoutBusy(busyKey);
    setMessage(provider === "paypal" ? "Opening PayPal checkout..." : "Opening card checkout...");
    try {
      const response = await fetch(provider === "paypal" ? "/api/paypal/checkout" : "/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, appId: appId || selected?.appId || paywall?.appId }),
      });
      const data = await response.json().catch(() => ({ error: "Checkout could not start. Please try again." }));
      if (!response.ok || !data.checkoutUrl) {
        setMessage(data.error || "Checkout could not start.");
        return;
      }
      window.location.assign(data.checkoutUrl);
    } catch {
      setMessage("Checkout could not start. Please check your connection and try again.");
    } finally {
      setCheckoutBusy(null);
    }
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

  function subscribeNewsletter() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newsletterEmail.trim())) {
      setMessage("Enter a valid email to receive Steam Guardrail updates.");
      return;
    }
    setMessage("You are on the update list. Newsletter delivery will be connected when email service is configured.");
    setNewsletterEmail("");
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand-mark" href="#home" aria-label="Steam Guardrail home">
          Steam Guardrail
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a href="#home">Home</a>
          <a href="#analysis">Review Analysis</a>
          <a href="#pricing">Pricing</a>
          <a href="#account">Register / Login</a>
        </nav>
      </header>

      <section id="home" className="home-page">
        <div className="home-hero">
          <div className="home-copy">
            <p className="eyebrow">Independent Steam review intelligence</p>
            <h1>Steam game reviews, risk scores, and buying advice before checkout.</h1>
            <p className="subcopy">
              Steam Guardrail helps PC players compare trending games with public reviews, social discussion signals,
              refund-risk language, DRM warnings, and gameplay-fit analysis before spending money.
            </p>
            <div className="hero-actions">
              <a className="primary-action link-button" href="#analysis">
                Start review analysis
              </a>
              <a className="secondary-action link-button" href="#pricing">
                View pricing
              </a>
            </div>
          </div>
          <div className="banner-grid" aria-label="Featured game review banners">
            {(bannerGames.length ? bannerGames : topFiveGames).slice(0, 3).map((game, index) => (
              <button key={game.appId || index} type="button" className="banner-tile" onClick={() => selectGame(game)}>
                {game.image ? <img src={game.image} alt={`${game.name} review banner`} /> : null}
                <span>#{index + 1} Trending review</span>
                <strong>{game.name}</strong>
                <em>{game.verdict}</em>
              </button>
            ))}
          </div>
        </div>

        <section className="home-section">
          <div className="section-heading">
            <p className="eyebrow">Today&apos;s top 5</p>
            <h2>Fast buying analysis for trending Steam games</h2>
            <p>
              These summaries update daily from Steam top sellers and public review signals. Open any game for a preview,
              then subscribe to unlock full platform feedback and detailed gameplay analysis.
            </p>
          </div>
          <div className="top-five-grid">
            {topFiveGames.map((game, index) => (
              <article key={game.appId} className="top-five-card">
                <button type="button" onClick={() => selectGame(game)}>
                  {game.image ? <img src={game.image} alt={`${game.name} Steam review`} /> : null}
                  <span>#{index + 1}</span>
                  <strong>{game.name}</strong>
                  <small>{game.reviewSummary} · Risk {game.riskScore}/100</small>
                  <em className={game.tone}>{game.verdict}</em>
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="newsletter-panel">
          <div>
            <p className="eyebrow">Weekly buyer briefing</p>
            <h2>Get Steam sale warnings and review-bomb alerts by email.</h2>
            <p>
              Receive curated Steam review analysis, top risk signals, refund-window reminders, and buying advice for
              popular PC games. No spam; only product updates and game-purchase research.
            </p>
          </div>
          <div className="newsletter-form">
            <input
              value={newsletterEmail}
              onChange={(event) => setNewsletterEmail(event.target.value)}
              placeholder="player@example.com"
              aria-label="Newsletter email"
            />
            <button type="button" onClick={subscribeNewsletter}>
              Subscribe
            </button>
          </div>
        </section>

        <section className="seo-copy">
          <article>
            <h2>Why Steam Guardrail exists</h2>
            <p>
              Many Steam games look great in trailers but hide problems in recent reviews: unstable performance,
              aggressive monetization, launcher friction, server issues, or disappointing endgame depth. Steam Guardrail
              organizes these signals into plain-English buying advice.
            </p>
          </article>
          <article>
            <h2>What our analysis includes</h2>
            <p>
              Each report combines Steam review sentiment, public Reddit discussion, modeled creator-platform feedback,
              risk scoring, genre fit, story overview, gameplay tips, and source links so players can make a calmer
              purchase decision.
            </p>
          </article>
          <article>
            <h2>Editorial policy</h2>
            <p>
              We do not sell games or guarantee quality. Reports are purchase-assistance summaries based on available
              public signals. Players should still check hardware requirements, refund rules, and recent review dates.
            </p>
          </article>
        </section>
      </section>

      <section id="analysis" className="hero-band product-hero">
        <div className="hero-copy">
          <p className="eyebrow">Daily Steam intelligence</p>
          <h1>Don&apos;t buy your next regret.</h1>
          <p className="subcopy">
            Steam Guardrail scans trending games before players spend. We surface review bombs, refund clues, DRM complaints,
            DLC traps, and social backlash so the hype does not empty your wallet.
          </p>
          <div className="hero-chips" aria-label="Product benefits">
            <span>Top 30 refreshes daily</span>
            <span>Refund-risk alerts</span>
            <span>DRM and DLC warnings</span>
            <span>Pay once or subscribe</span>
          </div>
          <div className="hero-actions">
            <button type="button" className="primary-action" onClick={loadTrending}>
              Scan the top 30 now
            </button>
            <button type="button" className="secondary-action" onClick={() => highlighted && selectGame(highlighted)}>
              Unlock today&apos;s report
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

        <aside id="account" className="auth-panel">
          <p className="eyebrow">Player account</p>
          {user ? (
            <>
              <strong>{user.username || user.email}</strong>
              <span>{user.email}</span>
              <span>Your paid reports and monthly unlocks follow this account across devices.</span>
              <div className="account-box">
                <span>Active subscriptions</span>
                <strong>{entitlements.filter((item) => item.status === "active" && item.kind === "monthly").length}</strong>
              </div>
              <div className="account-list">
                {(entitlements.length ? entitlements : [{ kind: "free", status: "preview", createdAt: Date.now() }]).slice(0, 4).map((item, index) => (
                  <div key={`${item.kind}-${item.appId || index}`}>
                    <span>{item.kind}{item.appId ? ` · App ${item.appId}` : ""}</span>
                    <strong>{item.status}</strong>
                  </div>
                ))}
              </div>
              {entitlements.some((item) => item.kind === "monthly" && item.status === "active") ? (
                <button type="button" onClick={cancelSubscription}>
                  Cancel subscription
                </button>
              ) : null}
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
              {authMode === "register" ? (
                <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
              ) : null}
              {authMode === "reset" ? (
                <input value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Reset token" />
              ) : null}
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
              {authMode !== "forgot" ? (
                <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
              ) : null}
              <button type="button" onClick={auth} disabled={authBusy}>
                {authBusy
                  ? "Working..."
                  : authMode === "register"
                    ? "Create account"
                    : authMode === "forgot"
                      ? "Request reset"
                      : authMode === "reset"
                        ? "Set new password"
                        : "Log in"}
              </button>
              <div className="account-links">
                <button type="button" className="text-button" onClick={() => setAuthMode("forgot")}>
                  Forgot password
                </button>
                <button type="button" className="text-button" onClick={() => setAuthMode("reset")}>
                  I have a reset token
                </button>
              </div>
            </>
          )}
        </aside>
      </section>

      {admin ? (
        <section className="admin-panel">
          <div className="admin-strip">
            <div>
              <span>Registered users</span>
              <strong>{admin.users}</strong>
            </div>
            <div>
              <span>Active paid entitlements</span>
              <strong>{admin.activeEntitlements}</strong>
            </div>
            <a className="export-link" href="/api/admin/export" target="_blank" rel="noreferrer">
              Export user CSV
            </a>
          </div>
          <div className="admin-tables">
            <article>
              <div className="panel-heading">
                <p>Admin</p>
                <h2>Registered users</h2>
              </div>
              <div className="table-list">
                {(admin.userRows || []).slice(0, 20).map((row) => (
                  <div key={row.id}>
                    <span>{row.username || "No username"} · {row.email}</span>
                    <strong>{row.entitlementCount} active</strong>
                  </div>
                ))}
              </div>
            </article>
            <article>
              <div className="panel-heading">
                <p>Admin</p>
                <h2>Paid access</h2>
              </div>
              <div className="table-list">
                {(admin.entitlementRows || []).slice(0, 20).map((row) => (
                  <div key={row.id}>
                    <span>{row.email} · {row.kind}{row.appId ? ` · App ${row.appId}` : ""}</span>
                    <strong>{row.status}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      <section className="workspace leaderboard">
        <section className="report-card">
          <div className="score-row">
            <div>
              <p>Daily Steam Top 30</p>
              <h2>Top 10 visible, 20 more inside</h2>
            </div>
            <button type="button" onClick={loadTrending}>
              Refresh
            </button>
          </div>
          {loadingGames ? <div className="review-snapshot">Fetching Steam top sellers and public review signals...</div> : null}
          {gamesError ? <div className="error-box">{gamesError}</div> : null}
          <div className="game-list">
            {visibleGames.map((game, index) => (
              <button
                key={game.appId}
                type="button"
                className={`game-row ${selected?.appId === game.appId ? "selected" : ""}`}
                onClick={() => selectGame(game)}
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
          {hiddenGames.length ? (
            <details className="more-games">
              <summary>Show ranks 11-30</summary>
              <div className="game-list scroll-window">
                {hiddenGames.map((game, index) => (
                  <button
                    key={game.appId}
                    type="button"
                    className={`game-row compact ${selected?.appId === game.appId ? "selected" : ""}`}
                    onClick={() => selectGame(game)}
                  >
                    <span className="rank-badge">{index + 11}</span>
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
            </details>
          ) : null}
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
              <button type="button" onClick={() => selectGame(highlighted)} disabled={reportBusy}>
                {reportBusy ? "Checking access..." : "Open buyer report"}
              </button>
            </>
          ) : null}
        </aside>
      </section>

      <section id="pricing" className="pricing-page">
        <div className="section-heading">
          <p className="eyebrow">Pricing</p>
          <h2>Choose one report or unlock the full Steam research workflow.</h2>
          <p>
            Free visitors can preview game risk scores and limited review signals. Paid access unlocks detailed platform
            feedback, Steam review samples, Reddit discussions, gameplay tips, and full buy-or-skip analysis.
          </p>
        </div>
        <div className="pricing-grid">
          <article className="price-card">
            <p className="eyebrow">Free preview</p>
            <h2>$0</h2>
            <p>View daily Top 30 rankings, risk scores, public mood charts, and limited preview analysis.</p>
            <a className="link-button secondary-action" href="#analysis">
              Browse free previews
            </a>
          </article>
          <article className="price-card">
            <p className="eyebrow">Single game report</p>
            <h2>$19.90</h2>
            <p>Unlock one complete report for a specific Steam game before you buy.</p>
            <button type="button" onClick={() => highlighted && openReport(highlighted.appId)}>
              Check selected game
            </button>
          </article>
          <article className="price-card featured">
            <p className="eyebrow">Monthly access</p>
            <h2>$12.99/mo</h2>
            <p>Best for Steam sales, wishlist reviews, and repeated purchase decisions across many games.</p>
            <a className="link-button primary-action" href="#account">
              Create account
            </a>
          </article>
        </div>
      </section>

      {paywall ? (
        <section className="pricing-grid checkout-pricing" aria-label="Checkout plans">
          <article className="price-card">
            <p className="eyebrow">One game, one clean answer</p>
            <h2>$19.90</h2>
            <p>Unlock the complete buy-or-skip report for Steam App {paywall.appId}. Best when one expensive game is on your mind.</p>
            <button type="button" onClick={() => checkout("single", paywall.appId, "stripe")} disabled={checkoutBusy !== null}>
              {checkoutBusy === "single-stripe" ? "Opening..." : "Pay by card"}
            </button>
            <button type="button" onClick={() => checkout("single", paywall.appId, "paypal")} disabled={checkoutBusy !== null}>
              {checkoutBusy === "single-paypal" ? "Opening PayPal..." : "PayPal"}
            </button>
          </article>
          <article className="price-card featured">
            <p className="eyebrow">Best for Steam sale season</p>
            <h2>$12.99/mo</h2>
            <p>Unlimited full reports while your subscription remains active. Compare wishlisted games before every checkout.</p>
            <button type="button" onClick={() => checkout("monthly", paywall.appId, "stripe")} disabled={checkoutBusy !== null}>
              {checkoutBusy === "monthly-stripe" ? "Opening..." : "Subscribe by card"}
            </button>
            <button type="button" onClick={() => checkout("monthly", paywall.appId, "paypal")} disabled={checkoutBusy !== null}>
              {checkoutBusy === "monthly-paypal" ? "Opening PayPal..." : "Subscribe with PayPal"}
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
              <p className="analysis-copy">{report.contentBrief?.buyerAnalysis || report.verdict.summary}</p>
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
                <div>
                  <span>Release</span>
                  <strong>{report.game.releaseDate || "Unknown"}</strong>
                </div>
                <div>
                  <span>Developer</span>
                  <strong>{report.game.developers?.[0] || "Unknown"}</strong>
                </div>
              </div>
              <a className="source-link" href={report.game.steamUrl} target="_blank" rel="noreferrer">
                Open Steam page
              </a>
            </div>
          </section>

          {reportLocked ? (
            <section className="locked-strip">
              <div>
                <p className="eyebrow">Preview mode</p>
                <h2>Register and subscribe to unlock the full report</h2>
                <p>Preview includes the core verdict, mood chart, limited platform signals, and one review sample. Full access unlocks all reviews, Reddit threads, characters, scenes, game tips, and detailed purchase analysis.</p>
              </div>
              <button type="button" onClick={() => setPaywall(paywall || { appId: report.appId, plans: [] })}>
                View plans
              </button>
            </section>
          ) : null}

          <section className="intel-grid">
            <article className="pro-card chart-card">
              <div className="panel-heading">
                <p>Sentiment pie</p>
                <h2>Public mood mix</h2>
              </div>
              <div
                className="sentiment-pie"
                style={
                  {
                    "--positive": `${report.sentimentBreakdown.positive}%`,
                    "--mixed": `${report.sentimentBreakdown.positive + report.sentimentBreakdown.mixed}%`,
                  } as CSSProperties
                }
              >
                <span>{report.sentimentBreakdown.positive}%</span>
              </div>
              <div className="legend-row">
                <span className="positive">Positive {report.sentimentBreakdown.positive}%</span>
                <span className="mixed">Mixed {report.sentimentBreakdown.mixed}%</span>
                <span className="negative">Negative {report.sentimentBreakdown.negative}%</span>
              </div>
            </article>

            <article className="pro-card chart-card wide">
              <div className="panel-heading">
                <p>FB / TikTok / YouTube / Reddit / Instagram</p>
                <h2>Platform feedback bars</h2>
              </div>
              <div className="bar-list">
                {report.platformFeedback.map((item) =>
                  reportLocked ? (
                    <button key={item.platform} type="button" className="bar-item locked" onClick={openPaidPlatform}>
                      <div>
                        <strong>{item.platform}</strong>
                        <span>{item.sentiment} · Subscribe to open feedback</span>
                      </div>
                      <div className="bar-track" aria-label={`${item.platform} score ${item.score}`}>
                        <span style={{ width: `${item.score}%` }} />
                      </div>
                      <em>{item.score}</em>
                    </button>
                  ) : (
                    <a key={item.platform} className="bar-item" href={item.url} target="_blank" rel="noreferrer">
                      <div>
                        <strong>{item.platform}</strong>
                        <span>{item.sentiment} · {item.source}</span>
                      </div>
                      <div className="bar-track" aria-label={`${item.platform} score ${item.score}`}>
                        <span style={{ width: `${item.score}%` }} />
                      </div>
                      <em>{item.score}</em>
                    </a>
                  ),
                )}
              </div>
            </article>
          </section>

          {!reportLocked ? (
            <section className="deep-analysis">
              <article className="pro-card">
                <div className="panel-heading">
                  <p>Story and setup</p>
                  <h2>What the game is about</h2>
                </div>
                <p className="analysis-copy">{report.contentBrief.story}</p>
                <div className="tag-row">
                  {(report.game.genres || []).slice(0, 5).map((genre) => (
                    <span key={genre}>{genre}</span>
                  ))}
                </div>
              </article>
              <article className="pro-card">
                <div className="panel-heading">
                  <p>Characters</p>
                  <h2>Roles to watch</h2>
                </div>
                <ul className="clean-list">
                  {report.contentBrief.characters.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="pro-card">
                <div className="panel-heading">
                  <p>Scenes</p>
                  <h2>Where the fun or friction appears</h2>
                </div>
                <ul className="clean-list">
                  {report.contentBrief.scenes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
              <article className="pro-card">
                <div className="panel-heading">
                  <p>Game tips</p>
                  <h2>Before you keep it</h2>
                </div>
                <ul className="clean-list">
                  {report.contentBrief.tips.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </section>
          ) : null}

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
                <h2>{report.reviewSummary?.description || "Recent player comments"}</h2>
              </div>
              {report.steamReviews.length ? (
                report.steamReviews.slice(0, 4).map((review, index) => (
                  <div key={`${index}-${review.slice(0, 8)}`} className="watch-item">
                    <span>Recent public Steam review</span>
                    <strong>{review.slice(0, 220)}</strong>
                  </div>
                ))
              ) : (
                <div className="review-snapshot">
                  <strong>No recent Steam review text returned</strong>
                  <p>Steam may have limited review text for this request. Open the Steam review page for the latest player comments.</p>
                  <a className="source-link" href={`${report.game.steamUrl}/#app_reviews_hash`} target="_blank" rel="noreferrer">
                    Open Steam reviews
                  </a>
                </div>
              )}
            </article>

            <article className="calculator-card">
              <div className="panel-heading">
                <p>Social discussion</p>
                <h2>Reddit threads</h2>
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

          <section className="pro-card">
            <div className="panel-heading">
              <p>Coverage note</p>
              <h2>Data limits and next API upgrades</h2>
            </div>
            <ul className="clean-list compact-list">
              {report.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <footer className="site-footer">
        <div>
          <strong>Steam Guardrail</strong>
          <p>Daily Steam review analysis, social signal summaries, and safer buying advice for PC players.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#home">Home</a>
          <a href="#analysis">Review Analysis</a>
          <a href="#pricing">Pricing</a>
          <a href="#account">Register / Login</a>
        </nav>
        <small>
          Steam Guardrail is an independent purchase-assistance tool and is not affiliated with Valve, Steam, Reddit,
          YouTube, TikTok, Facebook, or Instagram.
        </small>
      </footer>
    </main>
  );
}

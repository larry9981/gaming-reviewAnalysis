"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";

type User = {
  id: string;
  email: string;
  username?: string | null;
  role: string;
  isAdmin?: boolean;
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
    walkthroughSkills: string[];
    buyerAnalysis: string;
  };
  limitations: string[];
};

type Paywall = {
  appId: string;
  preview?: AnalysisResult;
  defaultPlan?: "single" | "monthly";
  plans: { id: "single" | "monthly"; label: string; price: string; appId?: string }[];
};

type CheckoutProvider = "paypal" | "airwallex";

type CheckoutDialog = {
  plan: "single" | "monthly";
  appId?: string;
  provider: CheckoutProvider;
};

type MaskedSecret = {
  configured: boolean;
  preview: string;
};

type AdminPaymentSettings = {
  paypal: {
    env: string;
    clientId: MaskedSecret;
    clientSecret: MaskedSecret;
    monthlyPlanId: MaskedSecret;
  };
  airwallex: {
    env: string;
    clientId: MaskedSecret;
    apiKey: MaskedSecret;
    accountId: MaskedSecret;
    countryCode: string;
    currency: string;
  };
};

function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Unknown";
}

function formatScore(value: number) {
  return Math.round(value);
}

function gameInitial(name?: string) {
  return (name || "Game").trim().slice(0, 1).toUpperCase();
}

function GameImage({
  image,
  name,
  className,
}: {
  image?: string;
  name: string;
  className: string;
}) {
  return image ? (
    <figure className={`${className} referenced-game-art`}>
      <img src={image} alt={`${name} official store artwork`} />
      <figcaption>Image copyright: respective publisher. Source: Steam public store asset.</figcaption>
    </figure>
  ) : (
    <div className={`${className} owned-art`} aria-hidden="true">
      <span>{gameInitial(name)}</span>
    </div>
  );
}

type SitePage = "home" | "reviews" | "pricing" | "account" | "admin";

const heroSlides = [
  {
    image: "/hero/steam-guardrail-hero-1.png",
    eyebrow: "AI-powered Steam review intelligence",
    title: "Know the risk before you buy.",
    summary: "Daily game signals, public mood, refund clues, and social feedback in one buyer report.",
  },
  {
    image: "/hero/steam-guardrail-hero-2.png",
    eyebrow: "Review bombs, hype cycles, hidden friction",
    title: "Turn public complaints into buying clarity.",
    summary: "See what players are praising, warning about, and refunding before you open checkout.",
  },
  {
    image: "/hero/steam-guardrail-hero-3.png",
    eyebrow: "For Steam sales and wishlist decisions",
    title: "Compare the game, not the trailer.",
    summary: "Use risk scores, platform feedback, and practical gameplay notes to avoid expensive regrets.",
  },
];

export function SteamGuardrailApp({ page = "home" }: { page?: SitePage }) {
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
  const [checkoutBusy, setCheckoutBusy] = useState<
    "single-stripe" | "single-paypal" | "single-airwallex" | "monthly-stripe" | "monthly-paypal" | "monthly-airwallex" | null
  >(null);
  const [checkoutDialog, setCheckoutDialog] = useState<CheckoutDialog | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [activeBanner, setActiveBanner] = useState(0);
  const [paymentSettings, setPaymentSettings] = useState<AdminPaymentSettings | null>(null);
  const [paymentSettingsBusy, setPaymentSettingsBusy] = useState(false);
  const [admin, setAdmin] = useState<{
    users: number;
    activeEntitlements: number;
    userRows?: { id: string; email: string; username?: string | null; role: string; entitlementCount: number; createdAt: number }[];
    entitlementRows?: { id: string; email: string; username?: string | null; kind: string; appId?: string | null; status: string; provider: string; createdAt: number }[];
  } | null>(null);

  const highlighted = useMemo(() => selected || games[0] || null, [games, selected]);
  const visibleGames = useMemo(() => games.slice(0, 10), [games]);
  const hiddenGames = useMemo(() => games.slice(10), [games]);
  const topFiveGames = useMemo(() => games.slice(0, 5), [games]);
  const selectedCheckoutGame = paywall?.appId || highlighted?.appId || "";
  const showHome = page === "home";
  const showReviews = page === "reviews";
  const showPricing = page === "pricing";
  const showAccount = page === "account";
  const showAdmin = page === "admin";

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

  async function verifyAirwallex(intentId: string) {
    const response = await fetch("/api/airwallex/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intentId }),
    });
    const data = await response.json();
    if (response.ok) {
      setMessage("Card payment confirmed. Your full reports are unlocked.");
      await loadMe();
    } else {
      setMessage(data.error || "Card payment confirmation is still pending.");
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
    const airwallexIntentId = params.get("intent_id");
    if (params.get("airwallex") === "success" && airwallexIntentId) {
      verifyAirwallex(airwallexIntentId);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("airwallex") === "cancelled") {
      setMessage("Card checkout cancelled. No charge was made.");
      window.history.replaceState({}, "", "/");
    }
    const appId = params.get("app");
    if (appId) {
      setInput(appId);
      openReport(appId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!showAdmin || !user?.isAdmin) return;
    loadAdmin();
    loadPaymentSettings();
  }, [showAdmin, user?.isAdmin]);

  useEffect(() => {
    if (heroSlides.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveBanner((current) => (current + 1) % heroSlides.length);
    }, 4600);
    return () => window.clearInterval(timer);
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
      setMessage("You are signed in. You can continue to checkout.");
      await loadMe();
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      if (returnTo?.startsWith("/")) {
        window.location.assign(returnTo);
      }
    } catch {
      setMessage("Authentication failed. Please check your connection and try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function adminLogin() {
    setMessage("");
    setAuthBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({ error: "Admin login failed. Please try again." }));
      if (!response.ok) {
        setMessage(data.error || "Admin login failed.");
        return;
      }
      setUser(data.user);
      setPassword("");
      await loadMe();
      setMessage("Admin signed in.");
    } catch {
      setMessage("Admin login failed. Please check your connection and try again.");
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
        setMessage(
          user
            ? "Limited analysis is shown. Choose a paid plan to unlock the full report."
            : "Limited analysis is shown. Register or log in, then choose a paid plan to unlock the full report.",
        );
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
    setMessage("Choose a paid plan to open detailed platform feedback sources.");
    setPaywall((current) => current || (report ? { appId: report.appId, plans: [] } : null));
    document.querySelector(".pricing-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function requestPaidDetail(detail = "detailed source links") {
    setMessage(user ? `Choose a paid plan to unlock ${detail}.` : `Register or log in, then choose a paid plan to unlock ${detail}.`);
    setPaywall((current) => current || (report ? { appId: report.appId, plans: [] } : null));
    document.querySelector(".checkout-pricing, .pricing-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function showPlansForReport() {
    if (!report) return;
    setPaywall((current) => current || { appId: report.appId, plans: [] });
    window.setTimeout(() => {
      document.querySelector(".checkout-pricing, .pricing-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function openCheckoutDialog(plan: "single" | "monthly", appId?: string) {
    if (!user) {
      setMessage("Create an account or log in before checkout.");
      if (showAccount) {
        document.querySelector(".auth-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.location.assign(`/account?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      }
      return;
    }
    if (plan === "single" && !(appId || selected?.appId || paywall?.appId)) {
      setMessage("Select a Steam game before buying one-month single-game access.");
      return;
    }
    setMessage("");
    setCheckoutDialog({
      plan,
      appId: appId || selected?.appId || paywall?.appId,
      provider: "paypal",
    });
  }

  async function checkout(plan: "single" | "monthly", appId?: string, provider: CheckoutProvider = "paypal", paymentWindow?: Window | null) {
    const busyKey = `${plan}-${provider}` as typeof checkoutBusy;
    setCheckoutBusy(busyKey);
    setMessage(provider === "paypal" ? "Opening PayPal checkout..." : "Opening card checkout...");
    try {
      const endpoint =
        provider === "paypal" ? "/api/paypal/checkout" : provider === "airwallex" ? "/api/airwallex/checkout" : "/api/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, appId: appId || selected?.appId || paywall?.appId }),
      });
      const data = await response.json().catch(() => ({ error: "Checkout could not start. Please try again." }));
      if (provider === "airwallex") {
        if (!response.ok || !data.id || !data.clientSecret) {
          paymentWindow?.close();
          setMessage(data.error || "Card checkout could not start.");
          return;
        }
        const { init, redirectToCheckout } = await import("@airwallex/components-sdk");
        const sdk = (await init({
          env: data.env || "prod",
          enabledElements: ["payments"],
        } as never)) as { payments?: { redirectToCheckout?: typeof redirectToCheckout } } | void;
        const openHostedCheckout = sdk?.payments?.redirectToCheckout || redirectToCheckout;
        const redirectResult = openHostedCheckout({
          intent_id: data.id,
          client_secret: data.clientSecret,
          currency: data.currency || "USD",
          country_code: data.countryCode || "US",
          shopper_email: user.email,
          methods: ["card"],
          submitType: plan === "monthly" ? "subscribe" : "pay",
          successUrl: data.successUrl,
        });
        if (typeof redirectResult === "string") window.location.assign(redirectResult);
        return;
      }
      if (!response.ok || !data.checkoutUrl) {
        paymentWindow?.close();
        setMessage(data.error || "Checkout could not start.");
        return;
      }
      if (paymentWindow) {
        paymentWindow.location.href = data.checkoutUrl;
      } else {
        window.location.assign(data.checkoutUrl);
      }
    } catch (error) {
      paymentWindow?.close();
      const detail = error instanceof Error ? error.message : "";
      setMessage(
        /merchant configuration|account manager|no available payment methods|not configured/i.test(detail)
          ? "Card checkout is connected, but this Airwallex merchant account is not enabled for this card/currency/country configuration yet. Please enable Online Payments/card acquiring in Airwallex or contact your Airwallex account manager."
          : "Checkout could not start. Please check your connection and try again.",
      );
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function continueCheckout() {
    if (!checkoutDialog) return;
    if (checkoutDialog.provider === "airwallex") {
      const form = document.getElementById("card-billing-form") as HTMLFormElement | null;
      if (form && !form.reportValidity()) return;
    }
    const paymentWindow = checkoutDialog.provider === "paypal" ? window.open("about:blank", "steam_guardrail_paypal") : null;
    await checkout(checkoutDialog.plan, checkoutDialog.appId, checkoutDialog.provider, paymentWindow);
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

  async function loadPaymentSettings() {
    const response = await fetch("/api/admin/payment-settings");
    const data = await response.json().catch(() => ({ error: "Payment settings unavailable." }));
    if (!response.ok) {
      setMessage(data.error || "Payment settings unavailable.");
      return;
    }
    setPaymentSettings(data);
  }

  async function savePaymentSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentSettingsBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/payment-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paypal: {
            env: form.get("paypalEnv"),
            clientId: form.get("paypalClientId"),
            clientSecret: form.get("paypalClientSecret"),
            monthlyPlanId: form.get("paypalMonthlyPlanId"),
          },
          airwallex: {
            env: form.get("airwallexEnv"),
            clientId: form.get("airwallexClientId"),
            apiKey: form.get("airwallexApiKey"),
            accountId: form.get("airwallexAccountId"),
            countryCode: form.get("airwallexCountryCode"),
            currency: form.get("airwallexCurrency"),
          },
        }),
      });
      const data = await response.json().catch(() => ({ error: "Payment settings could not be saved." }));
      if (!response.ok) {
        setMessage(data.error || "Payment settings could not be saved.");
        return;
      }
      setPaymentSettings(data.settings);
      setMessage(data.message || "Payment settings saved.");
    } finally {
      setPaymentSettingsBusy(false);
    }
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
        <a className="brand-mark" href="/" aria-label="Steam Guardrail home">
          Steam Guardrail
        </a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a className={showHome ? "active" : ""} href="/">Home</a>
          <a className={showReviews ? "active" : ""} href="/reviews">Review Analysis</a>
          <a className={showPricing ? "active" : ""} href="/pricing">Pricing</a>
          <a className={`account-nav ${showAccount ? "active" : ""}`} href="/account" title={user ? "View account and subscription details" : "Register or log in"}>
            {user ? (
              <>
                <span className="account-avatar" aria-hidden="true">
                  {(user.username || user.email).slice(0, 1).toUpperCase()}
                </span>
                <span>{user.username || user.email}</span>
              </>
            ) : (
              "Register / Login"
            )}
          </a>
          {user?.isAdmin ? <a className={showAdmin ? "active" : ""} href="/admin">Admin</a> : <a className={showAdmin ? "active" : ""} href="/admin">Admin Login</a>}
        </nav>
      </header>

      {showHome ? (
      <section className="home-page">
        <div className="home-hero commercial-hero">
          <div className="banner-carousel" aria-label="AI-generated Steam review hero banners">
            {heroSlides.map((slide, index) => (
              <section
                key={slide.image}
                className={`banner-slide ${activeBanner === index ? "active" : ""}`}
                style={{ transform: `translateX(${(index - activeBanner) * 100}%)` }}
              >
                <img src={slide.image} alt="" />
                <div className="banner-copy">
                  <span>{slide.eyebrow}</span>
                  <strong>{slide.title}</strong>
                  <p>{slide.summary}</p>
                  <div className="hero-actions">
                    <a className="primary-action link-button" href="/reviews">
                      Start review analysis
                    </a>
                    <a className="secondary-action link-button" href="/pricing">
                      View pricing
                    </a>
                  </div>
                </div>
              </section>
            ))}
            <div className="banner-dots" aria-label="Banner controls">
              {heroSlides.map((slide, index) => (
                <button
                  key={`${slide.image}-dot`}
                  type="button"
                  aria-label={`Show banner ${index + 1}`}
                  className={activeBanner === index ? "active" : ""}
                  onClick={() => setActiveBanner(index)}
                />
              ))}
            </div>
          </div>
        </div>

        <section className="home-section">
          <div className="section-heading">
            <p className="eyebrow">Today&apos;s top 5</p>
            <h2>Fast buying analysis for trending Steam games</h2>
            <p>
              These summaries update daily from Steam top sellers and public review signals. Open any game to start a
              paid full report with platform feedback and detailed gameplay analysis.
            </p>
          </div>
          <div className="top-five-feature-list">
            {topFiveGames.map((game, index) => (
              <article key={game.appId} className="top-five-feature">
                <GameImage image={game.image} name={game.name} className="game-cover" />
                <div>
                  <span>#{index + 1} Trending</span>
                  <strong>{game.name}</strong>
                  <p>{game.reviewSummary}</p>
                  <small>{game.verdict} · Risk {game.riskScore}/100 · {game.price}</small>
                </div>
                <a className="link-button primary-action analysis-button" href={`/reviews?app=${game.appId}`}>
                  Analysis
                </a>
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
      ) : null}

      {showReviews ? (
      <>
      <section className="hero-band product-hero">
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

        <aside className="verdict-panel watch">
          <p className="eyebrow">How reports work</p>
          <strong>Preview first, unlock when ready.</strong>
          <span>Free visitors can inspect limited public signals. Paid users see complete platform feedback, review samples, story notes, characters, scenes, and buyer tips.</span>
          <div className="conversion-list">
            <span>Steam</span>
            <span>Reddit</span>
            <span>Social mood</span>
          </div>
          <a className="link-button primary-action" href="/pricing">Compare plans</a>
        </aside>
      </section>

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
                <GameImage image={game.image} name={game.name} className="game-thumb" />
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
                    <GameImage image={game.image} name={game.name} className="game-thumb" />
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
      </>
      ) : null}

      {showAccount ? (
      <>
      <section className="hero-band account-page">
        <div className="hero-copy">
          <p className="eyebrow">Account access</p>
          <h1>Register, log in, and manage your Steam reports.</h1>
          <p className="subcopy">
            Save report unlocks, review your subscription status, cancel monthly access, and let admins export user and payment data.
          </p>
          {message ? <div className="error-box neutral">{message}</div> : null}
        </div>
        <aside className="auth-panel">
          <p className="eyebrow">Player account</p>
          {user ? (
            <>
              <strong>{user.username || user.email}</strong>
              <span>{user.email}</span>
              <span>Your paid reports and monthly unlocks follow this account across devices.</span>
              <div className="account-list account-details">
                <div>
                  <span>Username</span>
                  <strong>{user.username || "Not set"}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{user.email}</strong>
                </div>
                <div>
                  <span>Account role</span>
                  <strong>{user.role}</strong>
                </div>
                <div>
                  <span>Account ID</span>
                  <strong>{user.id.slice(0, 10)}</strong>
                </div>
              </div>
              <div className="account-box">
                <span>Active subscriptions</span>
                <strong>{entitlements.filter((item) => item.status === "active" && item.kind === "monthly").length}</strong>
              </div>
              <p className="eyebrow">Subscriptions and paid access</p>
              <div className="account-list">
                {(entitlements.length ? entitlements : [{ kind: "none", status: "No active paid access", createdAt: Date.now() }]).slice(0, 4).map((item, index) => (
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
              {user.isAdmin ? <a className="link-button secondary-action" href="/admin">Open admin dashboard</a> : null}
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

      {showAccount && admin ? (
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
      </>
      ) : null}

      {showAdmin ? (
        <>
          <section className="hero-band admin-login-page">
            <div className="hero-copy">
              <p className="eyebrow">Admin console</p>
              <h1>Manage users, paid access, and payment settings.</h1>
              <p className="subcopy">
                This page is the separate administrator entrance for Steam Guardrail. Only approved admin accounts can
                view purchase records, export users, or edit PayPal and credit card payment configuration.
              </p>
              {message ? <div className="error-box neutral">{message}</div> : null}
            </div>
            <aside className="auth-panel">
              {user?.isAdmin ? (
                <>
                  <p className="eyebrow">Signed in as admin</p>
                  <strong>{user.username || user.email}</strong>
                  <span>{user.email}</span>
                  <button type="button" onClick={loadAdmin}>Refresh users</button>
                  <button type="button" onClick={loadPaymentSettings}>Refresh payment settings</button>
                  <button type="button" onClick={logout}>Sign out</button>
                </>
              ) : user ? (
                <>
                  <p className="eyebrow">Access denied</p>
                  <strong>{user.username || user.email}</strong>
                  <span>This account is signed in, but it is not configured as an administrator.</span>
                  <button type="button" onClick={logout}>Sign out and use admin account</button>
                </>
              ) : (
                <>
                  <p className="eyebrow">Admin login</p>
                  <span className="auth-pitch">Use the administrator email configured for this site to enter the dashboard.</span>
                  <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
                  <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" type="password" />
                  <button type="button" onClick={adminLogin} disabled={authBusy}>
                    {authBusy ? "Signing in..." : "Admin login"}
                  </button>
                  <button type="button" className="text-button" onClick={() => setAuthMode("forgot")}>
                    Forgot password
                  </button>
                </>
              )}
            </aside>
          </section>

          {user?.isAdmin ? (
            <section className="admin-panel">
              <div className="admin-strip">
                <div>
                  <span>Registered users</span>
                  <strong>{admin?.users ?? "--"}</strong>
                </div>
                <div>
                  <span>Active paid entitlements</span>
                  <strong>{admin?.activeEntitlements ?? "--"}</strong>
                </div>
                <a className="export-link" href="/api/admin/export" target="_blank" rel="noreferrer">
                  Export user CSV
                </a>
              </div>

              <div className="admin-tables">
                <article>
                  <div className="panel-heading">
                    <p>Admin</p>
                    <h2>All registered users</h2>
                  </div>
                  <div className="table-list">
                    {(admin?.userRows || []).map((row) => (
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
                    <h2>All purchase records</h2>
                  </div>
                  <div className="table-list">
                    {(admin?.entitlementRows || []).map((row) => (
                      <div key={row.id}>
                        <span>{row.email} · {row.kind}{row.appId ? ` · App ${row.appId}` : ""} · {row.provider}</span>
                        <strong>{row.status}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <form className="payment-config-panel" onSubmit={savePaymentSettings} key={JSON.stringify(paymentSettings || {})}>
                <div className="panel-heading">
                  <p>Payment configuration</p>
                  <h2>PayPal and credit card settings</h2>
                </div>
                <p className="admin-note">
                  Existing secrets are masked. Leave a secret field blank to keep the current value, or enter a new value to replace it.
                </p>
                <div className="payment-config-grid">
                  <article>
                    <h3>PayPal</h3>
                    <label>
                      Environment
                      <select name="paypalEnv" defaultValue={paymentSettings?.paypal.env || "live"}>
                        <option value="live">live</option>
                        <option value="sandbox">sandbox</option>
                      </select>
                    </label>
                    <label>
                      Client ID
                      <input name="paypalClientId" placeholder={paymentSettings?.paypal.clientId.preview || "PayPal client ID"} />
                    </label>
                    <label>
                      Client Secret
                      <input name="paypalClientSecret" type="password" placeholder={paymentSettings?.paypal.clientSecret.configured ? "********" : "PayPal client secret"} />
                    </label>
                    <label>
                      Monthly Plan ID
                      <input name="paypalMonthlyPlanId" placeholder={paymentSettings?.paypal.monthlyPlanId.preview || "PayPal subscription plan ID"} />
                    </label>
                  </article>
                  <article>
                    <h3>Credit card / Airwallex</h3>
                    <label>
                      Environment
                      <select name="airwallexEnv" defaultValue={paymentSettings?.airwallex.env || "prod"}>
                        <option value="prod">prod</option>
                        <option value="demo">demo</option>
                        <option value="sandbox">sandbox</option>
                      </select>
                    </label>
                    <label>
                      Client ID
                      <input name="airwallexClientId" placeholder={paymentSettings?.airwallex.clientId.preview || "Airwallex client ID"} />
                    </label>
                    <label>
                      API Key
                      <input name="airwallexApiKey" type="password" placeholder={paymentSettings?.airwallex.apiKey.configured ? "********" : "Airwallex API key"} />
                    </label>
                    <label>
                      Account ID
                      <input name="airwallexAccountId" placeholder={paymentSettings?.airwallex.accountId.preview || "Optional account ID"} />
                    </label>
                    <div className="config-pair">
                      <label>
                        Country
                        <input name="airwallexCountryCode" defaultValue={paymentSettings?.airwallex.countryCode || "US"} />
                      </label>
                      <label>
                        Currency
                        <input name="airwallexCurrency" defaultValue={paymentSettings?.airwallex.currency || "USD"} />
                      </label>
                    </div>
                  </article>
                </div>
                <button type="submit" className="primary-action" disabled={paymentSettingsBusy}>
                  {paymentSettingsBusy ? "Saving settings..." : "Save payment settings"}
                </button>
              </form>
            </section>
          ) : null}
        </>
      ) : null}

      {showPricing ? (
      <section className="pricing-page">
        <div className="section-heading">
          <p className="eyebrow">Pricing</p>
          <h2>Choose one paid access plan.</h2>
          <p>
            Steam Guardrail supports two paid options: one-month access for a single selected game, or recurring monthly
            access for repeated Steam purchase decisions.
          </p>
          {message ? <div className="error-box neutral">{message}</div> : null}
        </div>
        <div className="pricing-grid">
          <article className="price-card featured">
            <p className="eyebrow">Default choice</p>
            <h2>$29.99</h2>
            <p>One-month access to the complete report for one selected Steam game, bound to your registered account.</p>
            <button type="button" onClick={() => openCheckoutDialog("single", selectedCheckoutGame)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("single-") ? "Opening checkout..." : "Pay $29.99"}
            </button>
          </article>
          <article className="price-card">
            <p className="eyebrow">Recurring monthly</p>
            <h2>$25.99/mo</h2>
            <p>Continuous monthly access for Steam sales, wishlist reviews, and repeated purchase decisions.</p>
            <button type="button" onClick={() => openCheckoutDialog("monthly", selectedCheckoutGame)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("monthly-") ? "Opening checkout..." : "Subscribe $25.99/mo"}
            </button>
          </article>
        </div>
      </section>
      ) : null}

      {showReviews && paywall ? (
        <section className="pricing-grid checkout-pricing" aria-label="Checkout plans">
          <article className="price-card featured">
            <p className="eyebrow">Default choice</p>
            <h2>$29.99</h2>
            <p>One-month access to the complete buy-or-skip report for Steam App {paywall.appId}, tied to your account.</p>
            <button type="button" onClick={() => openCheckoutDialog("single", paywall.appId)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("single-") ? "Opening checkout..." : "Pay $29.99"}
            </button>
          </article>
          <article className="price-card">
            <p className="eyebrow">Recurring monthly</p>
            <h2>$25.99/mo</h2>
            <p>Unlimited full reports while your subscription remains active. Compare wishlisted games before every checkout.</p>
            <button type="button" onClick={() => openCheckoutDialog("monthly", paywall.appId)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("monthly-") ? "Opening checkout..." : "Subscribe $25.99/mo"}
            </button>
          </article>
          <article className="price-card">
            <p className="eyebrow">Secure checkout</p>
            <h2>Account-bound access</h2>
            <p>Payment starts only after login. Successful payments are verified server-side and attached to your registered user account.</p>
            <div className="method-row">
              <span>Default payment</span>
              <strong>PayPal</strong>
            </div>
            <div className="method-row">
              <span>Credit cards</span>
              <strong>Airwallex</strong>
            </div>
            <div className="method-row">
              <span>Default plan</span>
              <strong>$29.99</strong>
            </div>
          </article>
        </section>
      ) : null}

      {showReviews && report ? (
        <>
          <section className="game-summary">
            <GameImage image={report.game.image} name={report.game.name} className="game-art" />
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
              {reportLocked ? (
                <button type="button" className="source-link locked-link" onClick={() => requestPaidDetail("the Steam source page")}>
                  Open Steam page
                </button>
              ) : (
                <a className="source-link" href={report.game.steamUrl} target="_blank" rel="noreferrer">
                  Open Steam page
                </a>
              )}
            </div>
          </section>

          {reportLocked ? (
            <section className="locked-strip">
              <div>
                <p className="eyebrow">Locked report</p>
                <h2>Register and subscribe to unlock the full report</h2>
                <p>Full access unlocks platform feedback, Steam reviews, Reddit threads, characters, scenes, game tips, and detailed purchase analysis.</p>
              </div>
              <button type="button" onClick={showPlansForReport}>
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
                {report.platformFeedback.map((item) => {
                  const score = formatScore(item.score);
                  return reportLocked ? (
                    <button key={item.platform} type="button" className="bar-item locked" onClick={openPaidPlatform}>
                      <div>
                        <strong>{item.platform}</strong>
                        <span>{item.sentiment} · Subscribe to open feedback</span>
                      </div>
                      <div className="bar-track" aria-label={`${item.platform} score ${score}`}>
                        <span style={{ width: `${score}%` }} />
                      </div>
                      <em>{score}</em>
                      <span className="detail-pill">Subscribe</span>
                    </button>
                  ) : (
                    <a key={item.platform} className="bar-item" href={item.url} target="_blank" rel="noreferrer">
                      <div>
                        <strong>{item.platform}</strong>
                        <span>{item.sentiment} · {item.source}</span>
                      </div>
                      <div className="bar-track" aria-label={`${item.platform} score ${score}`}>
                        <span style={{ width: `${score}%` }} />
                      </div>
                      <em>{score}</em>
                      <span className="detail-pill">Check Detail</span>
                    </a>
                  );
                })}
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
              <article className="pro-card">
                <div className="panel-heading">
                  <p>Walkthrough skills</p>
                  <h2>How to clear the game smarter</h2>
                </div>
                <ul className="clean-list">
                  {(report.contentBrief.walkthroughSkills || []).map((item) => (
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
                  {reportLocked ? (
                    <button type="button" className="source-link locked-link" onClick={() => requestPaidDetail("Steam review links")}>
                      Open Steam reviews
                    </button>
                  ) : (
                    <a className="source-link" href={`${report.game.steamUrl}/#app_reviews_hash`} target="_blank" rel="noreferrer">
                      Open Steam reviews
                    </a>
                  )}
                </div>
              )}
            </article>

            <article className="calculator-card">
              <div className="panel-heading">
                <p>Social discussion</p>
                <h2>Reddit threads</h2>
              </div>
              {report.reddit.posts.length ? (
                report.reddit.posts.map((post) =>
                  reportLocked ? (
                    <button key={post.url} type="button" className="reddit-item locked-link" onClick={() => requestPaidDetail("Reddit thread links")}>
                      <span>r/{post.subreddit}</span>
                      <strong>{post.title}</strong>
                      <small>{post.comments.toLocaleString("en-US")} comments · Subscribe to open</small>
                    </button>
                  ) : (
                    <a key={post.url} className="reddit-item" href={post.url} target="_blank" rel="noreferrer">
                      <span>r/{post.subreddit}</span>
                      <strong>{post.title}</strong>
                      <small>{post.comments.toLocaleString("en-US")} comments</small>
                    </a>
                  ),
                )
              ) : (
                <div className="review-snapshot">
                  <strong>Reddit API limited</strong>
                  <p>{report.reddit.error || "No Reddit posts returned."}</p>
                  {reportLocked ? (
                    <button type="button" className="source-link locked-link" onClick={() => requestPaidDetail("Reddit search links")}>
                      Search Reddit manually
                    </button>
                  ) : (
                    <a className="source-link" href={report.reddit.searchUrl} target="_blank" rel="noreferrer">
                      Search Reddit manually
                    </a>
                  )}
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

      {checkoutDialog ? (
        <div className="checkout-modal-backdrop" role="presentation" onClick={() => (checkoutBusy ? undefined : setCheckoutDialog(null))}>
          <section
            className="checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Secure payment</p>
                <h2 id="checkout-modal-title">
                  {checkoutDialog.plan === "single" ? "Pay $29.99" : "Subscribe $25.99/mo"}
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setCheckoutDialog(null)} disabled={checkoutBusy !== null} aria-label="Close payment dialog">
                Close
              </button>
            </div>
            <p className="modal-copy">
              Choose how you want to pay. PayPal is selected by default; card payments are securely processed by Airwallex.
            </p>
            {message ? <div className="error-box neutral modal-message">{message}</div> : null}
            <div className="payment-methods" role="radiogroup" aria-label="Payment method">
              <button
                type="button"
                className={checkoutDialog.provider === "paypal" ? "active" : ""}
                onClick={() => setCheckoutDialog({ ...checkoutDialog, provider: "paypal" })}
                role="radio"
                aria-checked={checkoutDialog.provider === "paypal"}
              >
                <strong>PayPal</strong>
                <span>Default · Pay with PayPal balance or PayPal-supported cards</span>
              </button>
              <button
                type="button"
                className={checkoutDialog.provider === "airwallex" ? "active" : ""}
                onClick={() => setCheckoutDialog({ ...checkoutDialog, provider: "airwallex" })}
                role="radio"
                aria-checked={checkoutDialog.provider === "airwallex"}
              >
                <strong>Credit card</strong>
                <span>Visa / Mastercard through Airwallex checkout</span>
              </button>
            </div>
            {checkoutDialog.provider === "airwallex" ? (
              <form id="card-billing-form" className="card-entry-form">
                <div className="form-row wide">
                  <label htmlFor="card-name">Name on card</label>
                  <input id="card-name" name="cardName" autoComplete="cc-name" placeholder="Jane Player" required />
                </div>
                <div className="form-row wide">
                  <label htmlFor="card-number">Card number</label>
                  <input id="card-number" name="cardNumber" autoComplete="cc-number" inputMode="numeric" placeholder="1234 1234 1234 1234" required />
                </div>
                <div className="form-row">
                  <label htmlFor="card-expiry">Expiry</label>
                  <input id="card-expiry" name="cardExpiry" autoComplete="cc-exp" placeholder="MM / YY" required />
                </div>
                <div className="form-row">
                  <label htmlFor="card-cvc">CVC</label>
                  <input id="card-cvc" name="cardCvc" autoComplete="cc-csc" inputMode="numeric" placeholder="CVC" required />
                </div>
                <div className="form-row wide">
                  <label htmlFor="billing-email">Email address</label>
                  <input id="billing-email" name="billingEmail" type="email" autoComplete="email" defaultValue={user?.email || ""} placeholder="player@example.com" required />
                </div>
                <div className="form-row wide">
                  <label htmlFor="billing-address">Billing address</label>
                  <input id="billing-address" name="billingAddress" autoComplete="billing street-address" placeholder="Street address" required />
                </div>
                <p className="secure-note">
                  These fields stay in the browser for checkout preparation. Final card authorization is completed on Airwallex secure payment infrastructure.
                </p>
              </form>
            ) : null}
            <div className="modal-summary">
              <div>
                <span>Plan</span>
                <strong>{checkoutDialog.plan === "single" ? "One-month single report" : "Recurring monthly access"}</strong>
              </div>
              <div>
                <span>Provider</span>
                <strong>{checkoutDialog.provider === "paypal" ? "PayPal" : "Airwallex card"}</strong>
              </div>
            </div>
            <button type="button" className="primary-action modal-pay-button" onClick={continueCheckout} disabled={checkoutBusy !== null}>
              {checkoutBusy ? "Opening secure checkout..." : checkoutDialog.provider === "paypal" ? "Continue with PayPal" : "Continue with credit card"}
            </button>
          </section>
        </div>
      ) : null}

      <footer className="site-footer">
        <div className="footer-cta">
          <div>
            <span>Steam Guardrail</span>
            <h2>Stop guessing which game is worth your money.</h2>
            <p>Use review intelligence, player complaints, and platform feedback before your next Steam checkout.</p>
          </div>
          <a className="link-button primary-action" href="/reviews">Analyze a game</a>
        </div>
        <div className="footer-brand">
          <strong>Steam Guardrail</strong>
          <p>Independent Steam review analysis, social signal summaries, and safer buying advice for PC players.</p>
          <div className="footer-badges">
            <span>Independent</span>
            <span>Daily signals</span>
            <span>Player-first</span>
          </div>
        </div>
        <nav className="footer-column" aria-label="Product navigation">
          <strong>Product</strong>
          <a href="/">Home</a>
          <a href="/reviews">Review Analysis</a>
          <a href="/pricing">Pricing</a>
          <a href="/account">Register / Login</a>
          <a href="/admin">Admin Login</a>
        </nav>
        <nav className="footer-column" aria-label="Company navigation">
          <strong>Company</strong>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/security">Security</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Use</a>
        </nav>
        <nav className="footer-column" aria-label="Social links">
          <strong>Social</strong>
          <a href="https://www.reddit.com/search/?q=Steam%20reviews" target="_blank" rel="noreferrer">Reddit</a>
          <a href="https://www.youtube.com/results?search_query=Steam+game+reviews" target="_blank" rel="noreferrer">YouTube</a>
          <a href="https://www.tiktok.com/search?q=steam%20game%20reviews" target="_blank" rel="noreferrer">TikTok</a>
          <a href="https://www.instagram.com/explore/search/keyword/?q=steam%20games" target="_blank" rel="noreferrer">Instagram</a>
        </nav>
        <div className="footer-bottom">
          <small>© 2026 Steam Guardrail. All rights reserved.</small>
          <small>
            Independent purchase-assistance tool. Game images are referenced from public store/media assets and remain copyrighted by their respective publishers. Not affiliated with Valve, Steam, Reddit, YouTube, TikTok, Facebook, or Instagram.
          </small>
        </div>
      </footer>
    </main>
  );
}

export default function Home() {
  return <SteamGuardrailApp page="home" />;
}

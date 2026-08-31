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

type CheckoutProvider = "paypal" | "worldfirst";

type CheckoutDialog = {
  plan: "single" | "monthly";
  appId?: string;
  provider: CheckoutProvider;
};

type MaskedSecret = {
  configured: boolean;
  preview: string;
};

type PublicPricing = {
  singleAmount: string;
  monthlyAmount: string;
  currency: string;
};

type AdminPaymentSettings = {
  paypal: {
    env: string;
    clientId: MaskedSecret;
    clientSecret: MaskedSecret;
    monthlyPlanId: MaskedSecret;
    singleHostedButtonId: MaskedSecret;
    monthlyHostedButtonId: MaskedSecret;
    receiverEmail: string;
  };
  airwallex: {
    env: string;
    clientId: MaskedSecret;
    apiKey: MaskedSecret;
    accountId: MaskedSecret;
    countryCode: string;
    currency: string;
  };
  worldfirst: {
    env: string;
    clientId: MaskedSecret;
    privateKey: MaskedSecret;
    keyVersion: string;
    apiBaseUrl: string;
    accountId: MaskedSecret;
    currency: string;
  };
  pricing: PublicPricing;
};

function formatNumber(value?: number | null) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Unknown";
}

function formatScore(value: number) {
  return Math.round(value);
}

function formatPrice(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `$${amount}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function gameInitial(name?: string) {
  return (name || "Game").trim().slice(0, 1).toUpperCase();
}

function scrollToReport() {
  window.setTimeout(() => {
    document.querySelector(".game-summary")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 120);
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
  const [plansDialog, setPlansDialog] = useState<Paywall | null>(null);
  const [authDialog, setAuthDialog] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("register");
  const [authBusy, setAuthBusy] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState<
    "single-stripe" | "single-paypal" | "single-worldfirst" | "monthly-stripe" | "monthly-paypal" | "monthly-worldfirst" | null
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
  const [pricing, setPricing] = useState<PublicPricing>({ singleAmount: "29.99", monthlyAmount: "25.99", currency: "USD" });
  const [admin, setAdmin] = useState<{
    users: number;
    activeEntitlements: number;
    userRows?: { id: string; email: string; username?: string | null; role: string; entitlementCount: number; createdAt: number }[];
    entitlementRows?: { id: string; email: string; username?: string | null; kind: string; appId?: string | null; status: string; provider: string; createdAt: number }[];
  } | null>(null);

  const highlighted = useMemo(() => selected || games[0] || null, [games, selected]);
  const rankedGames = useMemo(() => games.slice(0, 30), [games]);
  const topFiveGames = useMemo(() => games.slice(0, 5), [games]);
  const selectedCheckoutGame = paywall?.appId || highlighted?.appId || "";
  const singlePriceLabel = formatPrice(pricing.singleAmount, pricing.currency);
  const monthlyPriceLabel = formatPrice(pricing.monthlyAmount, pricing.currency);
  const showHome = page === "home";
  const showReviews = page === "reviews";
  const showPricing = page === "pricing";
  const showAccount = page === "account";
  const showAdmin = page === "admin";

  async function loadMe() {
    try {
      const response = await fetch("/api/me");
      const data = await response.json();
      if (!response.ok) throw new Error("Account service unavailable");
      setUser(data.user || null);
      setEntitlements(data.entitlements || []);
    } catch {
      setUser(null);
      setEntitlements([]);
    }
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

  async function loadPricing() {
    const response = await fetch("/api/pricing");
    const data = await response.json().catch(() => null);
    if (response.ok && data?.singleAmount && data?.monthlyAmount) setPricing(data);
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

  async function verifyHostedPayPal(checkoutId: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await fetch(`/api/paypal/hosted-status?checkout=${encodeURIComponent(checkoutId)}`);
      const data = await response.json().catch(() => ({ error: "PayPal status is unavailable." }));
      if (response.ok && data.paid) {
        setMessage("PayPal payment confirmed. Your full reports are unlocked.");
        await loadMe();
        return;
      }
      if (!response.ok) {
        setMessage(data.error || "PayPal status is unavailable.");
        return;
      }
      if (attempt < 19) await new Promise((resolve) => window.setTimeout(resolve, 3000));
    }
    setMessage("PayPal is processing the payment. Access will unlock automatically after payment confirmation.");
  }

  async function verifyWorldFirst(paymentRequestId: string) {
    const response = await fetch("/api/worldfirst/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentRequestId }),
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
    loadPricing();
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
    const hostedCheckoutId = params.get("checkout");
    if (params.get("paypal_hosted") === "success" && hostedCheckoutId) {
      verifyHostedPayPal(hostedCheckoutId);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("paypal") === "cancelled") {
      setMessage("PayPal checkout cancelled. No charge was made.");
      window.history.replaceState({}, "", "/");
    }
    const worldFirstPaymentRequestId = params.get("payment_request_id") || params.get("paymentRequestId");
    if (params.get("worldfirst") === "success" && worldFirstPaymentRequestId) {
      verifyWorldFirst(worldFirstPaymentRequestId);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("worldfirst") === "cancelled") {
      setMessage("Card checkout cancelled. No charge was made.");
      window.history.replaceState({}, "", "/");
    }
    const appId = params.get("app");
    if (appId) {
      setInput(appId);
      openReport(appId, true);
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
      setAuthDialog(false);
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
    const paymentWindow = window.open("about:blank", "steam_guardrail_paypal_manage");
    const response = await fetch("/api/account/cancel-subscription", { method: "POST" });
    const data = await response.json().catch(() => ({ error: "Cancellation failed." }));
    if (!response.ok) {
      paymentWindow?.close();
      setMessage(data.error || "Cancellation failed.");
      return;
    }
    if (paymentWindow && data.manageUrl) paymentWindow.location.href = data.manageUrl;
    else if (data.manageUrl) window.location.href = data.manageUrl;
    setMessage(data.message || "Continue in PayPal to manage your subscription.");
  }

  async function openReport(appId = input || selected?.appId || "", scrollAfterLoad = false) {
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
          if (scrollAfterLoad) scrollToReport();
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
      if (scrollAfterLoad) scrollToReport();
    } catch {
      setMessage("Report failed. Please try again.");
    } finally {
      setReportBusy(false);
    }
  }

  function selectGame(game: TopGame) {
    setSelected(game);
    setInput(game.appId);
    openReport(game.appId, true);
  }

  function openPaidPlatform() {
    if (!report) return;
    const nextPaywall = paywall || { appId: report.appId, plans: [] };
    setMessage(user ? "Choose a paid plan to unlock detailed platform feedback sources." : "Please log in or register, then choose a paid plan to open detailed platform feedback.");
    setPaywall(nextPaywall);
    setPlansDialog(nextPaywall);
  }

  function requestPaidDetail(detail = "detailed source links") {
    if (!report) return;
    const nextPaywall = paywall || { appId: report.appId, plans: [] };
    setMessage(user ? `Choose a paid plan to unlock ${detail}.` : `Please log in or register, then choose a paid plan to unlock ${detail}.`);
    setPaywall(nextPaywall);
    setPlansDialog(nextPaywall);
  }

  function showPlansForReport() {
    if (!report) return;
    const nextPaywall = paywall || { appId: report.appId, plans: [] };
    setPaywall(nextPaywall);
    setPlansDialog(nextPaywall);
  }

  function openCheckoutDialog(plan: "single" | "monthly", appId?: string) {
    if (!user) {
      setMessage("Please register or log in before checkout.");
      setAuthMode("login");
      setAuthDialog(true);
      return;
    }
    if (plan === "single" && !(appId || selected?.appId || paywall?.appId)) {
      setMessage("Select a Steam game before buying one-month single-game access.");
      return;
    }
    setMessage("");
    setPlansDialog(null);
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
      const endpoint = provider === "paypal" ? "/api/paypal/checkout" : "/api/worldfirst/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, appId: appId || selected?.appId || paywall?.appId }),
      });
      const data = await response.json().catch(() => ({ error: "Checkout could not start. Please try again." }));
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
        /merchant configuration|account manager|no available payment methods|not configured|worldfirst/i.test(detail)
          ? "Card checkout is connected, but WorldFirst merchant configuration still needs to be completed or approved for this card/currency setup."
          : "Checkout could not start. Please check your connection and try again.",
      );
    } finally {
      setCheckoutBusy(null);
    }
  }

  async function continueCheckout() {
    if (!checkoutDialog) return;
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
    if (data.pricing) setPricing(data.pricing);
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
            singleHostedButtonId: form.get("paypalSingleHostedButtonId"),
            monthlyHostedButtonId: form.get("paypalMonthlyHostedButtonId"),
            receiverEmail: form.get("paypalReceiverEmail"),
          },
          airwallex: {
            env: form.get("airwallexEnv"),
            clientId: form.get("airwallexClientId"),
            apiKey: form.get("airwallexApiKey"),
            accountId: form.get("airwallexAccountId"),
            countryCode: form.get("airwallexCountryCode"),
            currency: form.get("airwallexCurrency"),
          },
          worldfirst: {
            env: form.get("worldfirstEnv"),
            clientId: form.get("worldfirstClientId"),
            privateKey: form.get("worldfirstPrivateKey"),
            keyVersion: form.get("worldfirstKeyVersion"),
            apiBaseUrl: form.get("worldfirstApiBaseUrl"),
            accountId: form.get("worldfirstAccountId"),
            currency: form.get("worldfirstCurrency"),
          },
          pricing: {
            singleAmount: form.get("singleAmount"),
            monthlyAmount: form.get("monthlyAmount"),
            confirmPaypalHostedPrices: form.get("confirmPaypalHostedPrices") === "on",
            syncPaypalMonthlyPrice: form.get("syncPaypalMonthlyPrice") === "on",
          },
        }),
      });
      const data = await response.json().catch(() => ({ error: "Payment settings could not be saved." }));
      if (!response.ok) {
        setMessage(data.error || "Payment settings could not be saved.");
        return;
      }
      setPaymentSettings(data.settings);
      setPricing(data.settings.pricing);
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
        </nav>
      </header>
      <a className={`floating-admin-link ${showAdmin ? "active" : ""}`} href="/admin">
        {user?.isAdmin ? "Admin" : "Admin Login"}
      </a>

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
              <button type="button" onClick={() => openReport(input || selected?.appId || "", true)}>
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
              <h2>Top 5 visible, scroll for the rest</h2>
            </div>
            <button type="button" onClick={loadTrending}>
              Refresh
            </button>
          </div>
          {loadingGames ? <div className="review-snapshot">Fetching Steam top sellers and public review signals...</div> : null}
          {gamesError ? <div className="error-box">{gamesError}</div> : null}
          <div className="ranked-scroll-window" aria-label="Daily Steam ranking scroll window">
            <div className="game-list">
            {rankedGames.map((game, index) => (
              <article
                key={game.appId}
                className={`game-row ${selected?.appId === game.appId ? "selected" : ""}`}
              >
                <span className="rank-badge">{index + 1}</span>
                <GameImage image={game.image} name={game.name} className="game-thumb" />
                <div className="game-title">
                  <strong>{game.name}</strong>
                  <small>Risk {game.riskScore}/100</small>
                </div>
                <small>{game.reviewSummary}</small>
                <em className={game.tone}>{game.verdict}</em>
                <button type="button" className="row-analysis-button" onClick={() => selectGame(game)} disabled={reportBusy}>
                  Analysis
                </button>
              </article>
            ))}
            </div>
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
        <div className="account-visual">
          <img src="/hero/steam-guardrail-hero-2.png" alt="" />
          <div className="account-visual-copy">
            <p className="eyebrow">{user ? "Player profile" : "Account access"}</p>
            <h1>{user ? `${user.username || "Player"} dashboard` : "Register, log in, and manage your Steam reports."}</h1>
            <p>
              {user
                ? "Review your saved access, subscription status, and purchase-ready Steam analysis from one account center."
                : "Save report unlocks, review your subscription status, and keep every paid report tied to your account."}
            </p>
            {message ? <div className="error-box neutral account-visual-message">{message}</div> : null}
          </div>
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
                  Manage / cancel in PayPal
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
              {authMode === "login" ? (
                <div className="account-links">
                  <button type="button" className="text-button" onClick={() => setAuthMode("forgot")}>
                    Forgot password
                  </button>
                </div>
              ) : null}
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
                  <article className="pricing-config-card">
                    <h3>Plan prices</h3>
                    <div className="config-pair">
                      <label>
                        Single report, 30-day access (USD)
                        <input
                          name="singleAmount"
                          type="number"
                          min="0.50"
                          max="9999"
                          step="0.01"
                          required
                          defaultValue={paymentSettings?.pricing.singleAmount || "29.99"}
                        />
                      </label>
                      <label>
                        Recurring monthly subscription (USD)
                        <input
                          name="monthlyAmount"
                          type="number"
                          min="0.50"
                          max="9999"
                          step="0.01"
                          required
                          defaultValue={paymentSettings?.pricing.monthlyAmount || "25.99"}
                        />
                      </label>
                    </div>
                    <label className="paypal-price-sync">
                      <input name="confirmPaypalHostedPrices" type="checkbox" />
                      <span>I updated the matching PayPal Hosted Button prices before saving changed website prices.</span>
                    </label>
                    <label className="paypal-price-sync">
                      <input name="syncPaypalMonthlyPrice" type="checkbox" />
                      <span>Synchronize the monthly price with the configured PayPal Billing Plan.</span>
                    </label>
                    <p className="admin-note">
                      PayPal applies a synchronized change to new subscriptions and, under PayPal's notice and timing rules, existing subscribers.
                    </p>
                  </article>
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
                      Client ID (optional REST fallback)
                      <input name="paypalClientId" placeholder={paymentSettings?.paypal.clientId.preview || "Optional PayPal client ID"} />
                    </label>
                    <label>
                      Client Secret (optional REST fallback)
                      <input name="paypalClientSecret" type="password" placeholder={paymentSettings?.paypal.clientSecret.configured ? "********" : "Optional PayPal client secret"} />
                    </label>
                    <label>
                      Single-payment Hosted Button ID
                      <input
                        name="paypalSingleHostedButtonId"
                        placeholder={paymentSettings?.paypal.singleHostedButtonId.preview || "PayPal single hosted_button_id"}
                      />
                    </label>
                    <label>
                      Monthly Hosted Button ID
                      <input
                        name="paypalMonthlyHostedButtonId"
                        placeholder={paymentSettings?.paypal.monthlyHostedButtonId.preview || "PayPal hosted_button_id"}
                      />
                    </label>
                    <label>
                      PayPal receiver email
                      <input
                        name="paypalReceiverEmail"
                        type="email"
                        defaultValue={paymentSettings?.paypal.receiverEmail || ""}
                        placeholder="Primary PayPal business email"
                      />
                    </label>
                    <label>
                      REST Billing Plan ID (optional)
                      <input name="paypalMonthlyPlanId" placeholder={paymentSettings?.paypal.monthlyPlanId.preview || "P-..."} />
                    </label>
                    <p className="admin-note">
                      Buy Now and Hosted Button payments use PayPal IPN. The receiver email must match the primary PayPal business email.
                    </p>
                  </article>
                  <article>
                    <h3>Credit card / WorldFirst</h3>
                    <label>
                      Environment
                      <select name="worldfirstEnv" defaultValue={paymentSettings?.worldfirst.env || "prod"}>
                        <option value="prod">prod</option>
                        <option value="test">test</option>
                        <option value="sandbox">sandbox</option>
                      </select>
                    </label>
                    <label>
                      Client ID
                      <input name="worldfirstClientId" placeholder={paymentSettings?.worldfirst.clientId.preview || "WorldFirst client ID"} />
                    </label>
                    <label>
                      RSA Private Key
                      <input
                        name="worldfirstPrivateKey"
                        type="password"
                        placeholder={paymentSettings?.worldfirst.privateKey.configured ? "********" : "WorldFirst private key"}
                      />
                    </label>
                    <label>
                      API Base URL
                      <input name="worldfirstApiBaseUrl" defaultValue={paymentSettings?.worldfirst.apiBaseUrl || "https://open-na.worldfirst.com"} />
                    </label>
                    <div className="config-pair">
                      <label>
                        Key version
                        <input name="worldfirstKeyVersion" defaultValue={paymentSettings?.worldfirst.keyVersion || "1"} />
                      </label>
                      <label>
                        Currency
                        <input name="worldfirstCurrency" defaultValue={paymentSettings?.worldfirst.currency || "USD"} />
                      </label>
                    </div>
                    <label>
                      Settlement Account ID
                      <input name="worldfirstAccountId" placeholder={paymentSettings?.worldfirst.accountId.preview || "Optional WorldFirst account ID"} />
                    </label>
                  </article>
                </div>
                <button type="submit" className="primary-action" disabled={paymentSettingsBusy}>
                  {paymentSettingsBusy ? "Saving settings..." : "Save prices and payment settings"}
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
            <h2>{singlePriceLabel}</h2>
            <p>One-month access to the complete report for one selected Steam game, bound to your registered account.</p>
            <button type="button" onClick={() => openCheckoutDialog("single", selectedCheckoutGame)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("single-") ? "Opening checkout..." : `Pay ${singlePriceLabel}`}
            </button>
          </article>
          <article className="price-card">
            <p className="eyebrow">Recurring monthly</p>
            <h2>{monthlyPriceLabel}/mo</h2>
            <p>Continuous monthly access for Steam sales, wishlist reviews, and repeated purchase decisions.</p>
            <button type="button" onClick={() => openCheckoutDialog("monthly", selectedCheckoutGame)} disabled={checkoutBusy !== null}>
              {checkoutBusy?.startsWith("monthly-") ? "Opening checkout..." : `Subscribe ${monthlyPriceLabel}/mo`}
            </button>
          </article>
        </div>
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
                      <span className="detail-pill">Check Detail</span>
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

      {plansDialog ? (
        <div className="checkout-modal-backdrop" role="presentation" onClick={() => setPlansDialog(null)}>
          <section
            className="checkout-modal plans-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plans-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Unlock full analysis</p>
                <h2 id="plans-modal-title">Choose your access plan</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setPlansDialog(null)} aria-label="Close plans dialog">
                Close
              </button>
            </div>
            <p className="modal-copy">
              Full access unlocks complete platform feedback, Steam and Reddit source links, story notes, characters, scenes, game tips, walkthrough skills, and buyer guidance.
            </p>
            {message ? <div className="error-box neutral modal-message">{message}</div> : null}
            <div className="modal-plan-grid">
              <article className="price-card featured">
                <p className="eyebrow">Default choice</p>
                <h2>{singlePriceLabel}</h2>
                <p>One-month access to the complete buy-or-skip report for Steam App {plansDialog.appId}.</p>
                <button type="button" onClick={() => openCheckoutDialog("single", plansDialog.appId)} disabled={checkoutBusy !== null}>
                  {checkoutBusy?.startsWith("single-") ? "Opening checkout..." : `Pay ${singlePriceLabel}`}
                </button>
              </article>
              <article className="price-card">
                <p className="eyebrow">Recurring monthly</p>
                <h2>{monthlyPriceLabel}/mo</h2>
                <p>Unlimited full reports while your subscription remains active. Good for Steam sales and wishlist checks.</p>
                <button type="button" onClick={() => openCheckoutDialog("monthly", plansDialog.appId)} disabled={checkoutBusy !== null}>
                  {checkoutBusy?.startsWith("monthly-") ? "Opening checkout..." : `Subscribe ${monthlyPriceLabel}/mo`}
                </button>
              </article>
            </div>
          </section>
        </div>
      ) : null}

      {authDialog ? (
        <div className="checkout-modal-backdrop auth-modal-layer" role="presentation" onClick={() => (authBusy ? undefined : setAuthDialog(false))}>
          <section
            className="checkout-modal auth-checkout-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Account required</p>
                <h2 id="auth-modal-title">Log in or register first</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setAuthDialog(false)} disabled={authBusy} aria-label="Close login dialog">
                Close
              </button>
            </div>
            <p className="modal-copy">
              Your payment and subscription must be attached to a registered account before checkout can start.
            </p>
            {message ? <div className="error-box neutral modal-message">{message}</div> : null}
            <div className="tab-row">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
                Login
              </button>
              <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>
                Register
              </button>
            </div>
            {authMode === "register" ? (
              <input className="modal-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
            ) : null}
            <input className="modal-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" />
            <input className="modal-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
            <button type="button" className="primary-action modal-pay-button" onClick={auth} disabled={authBusy}>
              {authBusy ? "Working..." : authMode === "register" ? "Create account" : "Log in"}
            </button>
          </section>
        </div>
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
                  {checkoutDialog.plan === "single" ? `Pay ${singlePriceLabel}` : `Subscribe ${monthlyPriceLabel}/mo`}
                </h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setCheckoutDialog(null)} disabled={checkoutBusy !== null} aria-label="Close payment dialog">
                Close
              </button>
            </div>
            <p className="modal-copy">
              Payments are securely processed by PayPal. Steam Guardrail never stores your PayPal credentials or payment details.
            </p>
            {message ? <div className="error-box neutral modal-message">{message}</div> : null}
            <div className="payment-methods" aria-label="Payment method">
              <div className="payment-method active">
                <strong>PayPal</strong>
                <span>Pay with your PayPal account</span>
              </div>
            </div>
            <div className="modal-summary">
              <div>
                <span>Plan</span>
                <strong>{checkoutDialog.plan === "single" ? "One-month single report" : "Recurring monthly access"}</strong>
              </div>
              <div>
                <span>Provider</span>
                <strong>PayPal</strong>
              </div>
            </div>
            <button type="button" className="primary-action modal-pay-button" onClick={continueCheckout} disabled={checkoutBusy !== null}>
              {checkoutBusy ? "Opening secure checkout..." : "Continue with PayPal"}
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

"use client";

import { useState } from "react";

type AnalysisResult = {
  appId: string;
  game: {
    name: string;
    image?: string;
    developers: string[];
    publishers: string[];
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
  limitations: string[];
};

const examples = [
  {
    label: "Baldur's Gate 3",
    value: "https://store.steampowered.com/app/1086940/Baldurs_Gate_3/",
  },
  {
    label: "No Man's Sky",
    value: "https://store.steampowered.com/app/275850/No_Mans_Sky/",
  },
  {
    label: "Cyberpunk 2077",
    value: "https://store.steampowered.com/app/1091500/Cyberpunk_2077/",
  },
];

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "Unknown";
}

export default function Home() {
  const [input, setInput] = useState(examples[0].value);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function analyzeGame() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }
      setResult(data);
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  const activeTone = result?.verdict.tone || "watch";

  return (
    <main className="app-shell">
      <section className="hero-band product-hero">
        <div className="hero-copy">
          <p className="eyebrow">Steam Guardrail</p>
          <h1>Know if a game is worth buying before you pay.</h1>
          <p className="subcopy">
            Paste a Steam store link. We scan public Steam data, recent player reviews,
            and Reddit discussion signals, then turn the noise into a clear buy-or-wait verdict.
          </p>
          <div className="search-box">
            <label htmlFor="steam-input">Steam URL or App ID</label>
            <div className="search-row">
              <input
                id="steam-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://store.steampowered.com/app/1086940/..."
              />
              <button type="button" onClick={analyzeGame} disabled={loading}>
                {loading ? "Analyzing..." : "Analyze game"}
              </button>
            </div>
            <div className="example-row" aria-label="Example games">
              {examples.map((example) => (
                <button
                  key={example.value}
                  type="button"
                  className="text-button"
                  onClick={() => setInput(example.value)}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
          {error ? <div className="error-box">{error}</div> : null}
        </div>

        <div className={`verdict-panel ${activeTone}`}>
          <p className="eyebrow">Purchase verdict</p>
          <strong>{result?.verdict.label || "Ready to scan"}</strong>
          <span>{result?.verdict.summary || "Connect a Steam page to generate a public-signal purchase report."}</span>
          <div className="score-badge large">{result?.riskScore ?? "--"}</div>
        </div>
      </section>

      {result ? (
        <>
          <section className="game-summary">
            <div className="game-art">
              {result.game.image ? <img src={result.game.image} alt="" /> : null}
            </div>
            <div className="game-facts">
              <p className="eyebrow">Steam app {result.appId}</p>
              <h2>{result.game.name}</h2>
              <div className="fact-grid">
                <div>
                  <span>Price</span>
                  <strong>{result.game.price}</strong>
                </div>
                <div>
                  <span>Steam reviews</span>
                  <strong>{result.reviewSummary?.description || "Unavailable"}</strong>
                </div>
                <div>
                  <span>Total reviews</span>
                  <strong>{formatNumber(result.reviewSummary?.total)}</strong>
                </div>
                <div>
                  <span>Metacritic</span>
                  <strong>{result.game.metacritic ?? "Unknown"}</strong>
                </div>
              </div>
              <a className="source-link" href={result.game.steamUrl} target="_blank" rel="noreferrer">
                Open Steam page
              </a>
            </div>
          </section>

          <section className="workspace">
            <section className={`report-card ${result.verdict.tone}`} aria-label="Risk report">
              <div className="score-row">
                <div>
                  <p>Risk signals</p>
                  <h2>{result.signals.length ? `${result.signals.length} red flags found` : "No major red flags found"}</h2>
                </div>
                <div className="score-badge">{result.riskScore}</div>
              </div>
              <div className="meter">
                <span style={{ width: `${result.riskScore}%` }} />
              </div>
              <div className="signals-grid">
                {result.signals.length ? (
                  result.signals.map((signal) => (
                    <article key={signal.id} className="signal-card">
                      <strong>{signal.label}</strong>
                      <span>{signal.detail}</span>
                      <small>{signal.source} signal</small>
                    </article>
                  ))
                ) : (
                  <article className="signal-card">
                    <strong>Clean first pass</strong>
                    <span>Available public sources did not show strong purchase risk.</span>
                    <small>Steam + public discussion</small>
                  </article>
                )}
              </div>
            </section>

            <aside className="control-panel">
              <div className="panel-heading">
                <p>Complaint map</p>
                <h2>What players are complaining about</h2>
              </div>
              <div className="complaint-list">
                {result.topComplaints.length ? (
                  result.topComplaints.map((item) => (
                    <div key={item.label} className="complaint-item">
                      <span>{item.label}</span>
                      <strong>{item.count}/2 sources</strong>
                    </div>
                  ))
                ) : (
                  <div className="complaint-item">
                    <span>No dominant complaint pattern</span>
                    <strong>Low signal</strong>
                  </div>
                )}
              </div>
              <div className="review-snapshot">
                <strong>Recent Steam review snippets</strong>
                {result.steamReviews.length ? (
                  result.steamReviews.slice(0, 3).map((review, index) => (
                    <p key={`${review.slice(0, 18)}-${index}`}>{review.slice(0, 220)}</p>
                  ))
                ) : (
                  <p>Steam reviews were not available for this scan.</p>
                )}
              </div>
            </aside>
          </section>

          <section className="business-grid public-sources">
            <article className="pro-card">
              <div className="panel-heading">
                <p>Public social scan</p>
                <h2>Reddit discussion signals</h2>
              </div>
              {result.reddit.posts.length ? (
                result.reddit.posts.map((post) => (
                  <a key={post.url} className="reddit-item" href={post.url} target="_blank" rel="noreferrer">
                    <span>r/{post.subreddit}</span>
                    <strong>{post.title}</strong>
                    <small>
                      {post.score.toLocaleString("en-US")} points · {post.comments.toLocaleString("en-US")} comments
                    </small>
                  </a>
                ))
              ) : (
                <div className="review-snapshot">
                  <strong>Reddit search unavailable</strong>
                  <p>{result.reddit.error || "No public posts returned for this query."}</p>
                  <a className="source-link" href={result.reddit.searchUrl} target="_blank" rel="noreferrer">
                    Search manually on Reddit
                  </a>
                </div>
              )}
            </article>

            <article className="watchlist-card">
              <div className="panel-heading">
                <p>Recommendation logic</p>
                <h2>How to use the verdict</h2>
              </div>
              <div className="watch-item">
                <span>Likely safe</span>
                <strong>Buy if the genre fits and price is fair.</strong>
              </div>
              <div className="watch-item">
                <span>Buy with caution</span>
                <strong>Read recent negative reviews before paying.</strong>
              </div>
              <div className="watch-item">
                <span>Wait for sale / Avoid</span>
                <strong>Wait for patches, deeper discounts, or a stronger recent trend.</strong>
              </div>
            </article>

            <article className="calculator-card">
              <div className="panel-heading">
                <p>Coverage notes</p>
                <h2>Current data sources</h2>
              </div>
              <ul className="notes-list">
                <li>Steam Store public app details</li>
                <li>Steam public recent reviews</li>
                <li>Reddit public search results when available</li>
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : (
        <section className="funnel empty-state">
          <div className="panel-heading">
            <p>What users get</p>
            <h2>A purchase decision, not another review wall</h2>
          </div>
          <div className="funnel-steps">
            <div>
              <span>1</span>
              <strong>Paste Steam link</strong>
              <p>No account required for the first scan.</p>
            </div>
            <div>
              <span>2</span>
              <strong>Scan public signals</strong>
              <p>Steam reviews plus public Reddit discussion when available.</p>
            </div>
            <div>
              <span>3</span>
              <strong>Get a verdict</strong>
              <p>Buy, buy with caution, wait for sale, or avoid for now.</p>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

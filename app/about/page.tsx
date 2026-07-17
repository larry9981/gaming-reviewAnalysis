export default function AboutPage() {
  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand-mark" href="/">Steam Guardrail</a>
        <nav className="site-nav" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/reviews">Review Analysis</a>
          <a href="/pricing">Pricing</a>
          <a href="/account">Register / Login</a>
        </nav>
      </header>
      <section className="page-article">
        <p className="eyebrow">About</p>
        <h1>Independent Steam purchase research for PC players.</h1>
        <p>
          Steam Guardrail helps players review public signals before buying games. We summarize Steam reviews, social
          discussion, risk indicators, pricing context, and buyer advice so players can make more confident decisions.
        </p>
        <p>
          We are not affiliated with Valve, Steam, Reddit, YouTube, TikTok, Facebook, Instagram, or any game publisher.
          Our reports are informational and should be used alongside official store pages, hardware requirements, and
          platform refund policies.
        </p>
      </section>
    </main>
  );
}

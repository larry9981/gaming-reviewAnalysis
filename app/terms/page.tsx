export default function TermsPage() {
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
        <p className="eyebrow">Terms</p>
        <h1>Terms of use for Steam Guardrail reports.</h1>
        <p>
          Reports are informational purchase-assistance summaries. They do not guarantee game quality, performance,
          refunds, compatibility, or future updates. Users remain responsible for checking official store pages and
          refund policies before buying.
        </p>
        <p>
          Single report purchases unlock one game report. Monthly subscriptions unlock eligible reports while the
          subscription remains active. Users may cancel monthly access from their account page.
        </p>
      </section>
    </main>
  );
}

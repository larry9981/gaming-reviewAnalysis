export default function ContactPage() {
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
        <p className="eyebrow">Contact</p>
        <h1>Support for accounts, subscriptions, and report questions.</h1>
        <p>
          For billing, access, correction, or product questions, contact the site operator at jqqbest@gmail.com. Include
          your account email and the Steam game report involved so support can review the request.
        </p>
        <p>
          For urgent payment issues, also keep your PayPal or card checkout receipt available. Steam Guardrail cannot
          process Steam refunds or publisher support requests.
        </p>
      </section>
    </main>
  );
}

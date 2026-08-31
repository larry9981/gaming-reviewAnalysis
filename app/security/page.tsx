export default function SecurityPage() {
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
        <p className="eyebrow">Security</p>
        <h1>Official domain and anti-phishing protection.</h1>
        <p>
          The official Steam Guardrail website is https://steam-guardrail-app.jqqbest.chatgpt.site. Do not enter your
          account information or payment details on lookalike domains, shortened links, or pages that claim to be Steam
          Guardrail but use a different host.
        </p>
        <p>
          Steam Guardrail uses HTTPS, browser security headers, anti-framing protection, a restrictive content security
          policy, and trusted-domain redirects to reduce phishing, clickjacking, content injection, and downgrade risks.
        </p>
        <p>
          Payments are handled through PayPal. Steam Guardrail does not ask users to enter PayPal credentials or
          payment details into a custom form on our own pages.
        </p>
        <p>
          To report a suspicious domain, phishing page, or security issue, contact jqqbest@gmail.com and include the
          URL, screenshots if available, and a short description of what happened.
        </p>
      </section>
    </main>
  );
}

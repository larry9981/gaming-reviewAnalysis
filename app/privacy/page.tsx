export default function PrivacyPage() {
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
        <p className="eyebrow">Privacy Policy</p>
        <h1>Privacy, account data, and payment handling.</h1>
        <p>
          Steam Guardrail collects account information such as username, email address, login session data, and payment
          entitlement status so users can access purchased reports and subscriptions.
        </p>
        <p>
          Payment details are processed by PayPal. We do not ask users to enter PayPal credentials or payment details
          directly on Steam Guardrail pages.
        </p>
        <p>
          Public social and store data may be summarized for reports. Users can contact support to ask about account
          access, corrections, or deletion requests.
        </p>
      </section>
    </main>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import PageBanner from "../../components/PageBanner";
import { fixtureById, LEAGUE_DISPLAY_NAME } from "../../data/bookingMock";

export default function BookCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const eventId = params.get("eventId") ?? "";
  const section = params.get("section") ?? "north";
  const qty = Number(params.get("qty") ?? "2");
  const total = Number(params.get("total") ?? "0");

  const m = eventId ? fixtureById(eventId) : undefined;
  const [name, setName] = useState("Harry Potter");
  const [email, setEmail] = useState("harry@example.com");

  const summary = useMemo(() => {
    if (!m) return null;
    return { m, qty, section, total };
  }, [m, qty, section, total]);

  if (!summary?.m) {
    return (
      <>
        <PageBanner variant="tickets" />
        <p className="error">Missing or invalid booking. Start from fixtures.</p>
        <Link to="/book/fixtures">Fixtures</Link>
      </>
    );
  }

  function pay() {
    const q = new URLSearchParams({
      eventId: summary.m.id,
      qty: String(summary.qty),
      total: String(summary.total),
      ref: `HPL-${Date.now().toString(36).toUpperCase()}`,
    });
    navigate(`/book/confirmation?${q.toString()}`);
  }

  return (
    <>
      <PageBanner variant="auth" />
      <div className="book-mock-hero">
        <h1>Checkout</h1>
        <p className="muted">{LEAGUE_DISPLAY_NAME} · mock payment</p>
      </div>

      <div className="card card-textured">
        <h2>Order</h2>
        <p>
          <strong>{summary.m.home}</strong> v <strong>{summary.m.away}</strong>
        </p>
        <p className="muted small">
          {summary.m.dateLabel} · Section: {summary.section} · Qty: {summary.qty}
        </p>
        <p className="book-checkout-total">Amount due: ₹{summary.total.toLocaleString("en-IN")}</p>
      </div>

      <div className="card">
        <h2>Guest details</h2>
        <label htmlFor="cx-name">Name</label>
        <input
          id="cx-name"
          className="motion-cricket-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <label htmlFor="cx-email" style={{ display: "block", marginTop: "0.75rem" }}>
          Email
        </label>
        <input
          id="cx-email"
          type="email"
          className="motion-cricket-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <p style={{ marginTop: "1rem" }}>
          <button type="button" className="btn primary" onClick={pay}>
            Pay ₹{summary.total.toLocaleString("en-IN")} (mock)
          </button>
        </p>
        <p className="muted small" style={{ marginTop: "0.75rem" }}>
          No real charge — this is a UI mock.
        </p>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to={`/book/${summary.m.id}/seats`}>← Seats</Link>
      </p>
    </>
  );
}

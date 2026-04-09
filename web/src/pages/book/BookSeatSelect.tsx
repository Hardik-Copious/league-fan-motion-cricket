import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageBanner from "../../components/PageBanner";
import {
  fixtureById,
  LEAGUE_DISPLAY_NAME,
  SEAT_SECTIONS,
  venueById,
} from "../../data/bookingMock";

export default function BookSeatSelect() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const m = eventId ? fixtureById(eventId) : undefined;
  const v = m ? venueById(m.venueId) : undefined;

  const [section, setSection] = useState<(typeof SEAT_SECTIONS)[number]["id"]>("north");
  const [qty, setQty] = useState(2);

  const { priceEach, total } = useMemo(() => {
    if (!m) return { priceEach: 0, total: 0 };
    const mult = SEAT_SECTIONS.find((s) => s.id === section)?.multiplier ?? 1;
    const priceEach = Math.round(m.basePriceInr * mult);
    return { priceEach, total: priceEach * qty };
  }, [m, section, qty]);

  if (!m) {
    return (
      <>
        <PageBanner variant="tickets" />
        <p className="error">No such fixture.</p>
        <Link to="/book/fixtures">← Fixtures</Link>
      </>
    );
  }

  function continueCheckout() {
    const q = new URLSearchParams({
      eventId: m.id,
      section,
      qty: String(qty),
      total: String(total),
    });
    navigate(`/book/checkout?${q.toString()}`);
  }

  return (
    <>
      <PageBanner variant="stats" />
      <div className="book-mock-hero">
        <p className="muted small">{LEAGUE_DISPLAY_NAME}</p>
        <h1>Select seats</h1>
        <p className="muted">
          {m.home} v {m.away} · {v?.name}
        </p>
      </div>

      <div className="card book-seat-map">
        <div className="book-seat-pitch" aria-hidden>
          <span className="book-seat-pitch-label">Pitch</span>
        </div>
        <p className="muted small book-seat-hint">
          Illustrative layout — tap a stand to change pricing tier.
        </p>
        <div className="book-seat-stands">
          {SEAT_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`book-stand-btn ${section === s.id ? "active" : ""}`}
              onClick={() => setSection(s.id)}
            >
              {s.label}
              <span className="muted small" style={{ display: "block" }}>
                ×{s.multiplier.toFixed(2)} base
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <label htmlFor="book-qty">Tickets</label>
        <select
          id="book-qty"
          className="season-select-input"
          style={{ marginTop: "0.35rem", maxWidth: "200px" }}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <p style={{ marginTop: "0.75rem" }}>
          <strong>₹{priceEach.toLocaleString("en-IN")}</strong> per ticket ·{" "}
          <strong>₹{total.toLocaleString("en-IN")}</strong> subtotal
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn primary" onClick={continueCheckout}>
            Continue to checkout
          </button>
        </p>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to={`/book/${m.id}`}>← Event</Link>
      </p>
    </>
  );
}

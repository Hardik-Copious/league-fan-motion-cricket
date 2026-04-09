import { Link } from "react-router-dom";
import PageBanner from "../../components/PageBanner";
import { LEAGUE_DISPLAY_NAME, MOCK_FIXTURES, venueById } from "../../data/bookingMock";

export default function BookFixtures() {
  return (
    <>
      <PageBanner variant="tickets" />
      <div className="book-mock-hero">
        <h1>Fixtures · {LEAGUE_DISPLAY_NAME}</h1>
        <p className="muted">Sample schedule — pick a match to continue the mock booking flow.</p>
      </div>

      <div className="book-fixture-grid">
        {MOCK_FIXTURES.map((m) => {
          const v = venueById(m.venueId);
          return (
            <article key={m.id} className="card book-fixture-card">
              <div className="book-fixture-meta">
                <span className="book-pill">{m.round}</span>
                <span className="muted small">{m.dateLabel}</span>
              </div>
              <h2 className="book-fixture-teams">
                {m.home} <span className="book-vs">v</span> {m.away}
              </h2>
              <p className="muted small">
                {v?.name ?? "Venue"} · {m.timeLabel}
              </p>
              <p className="book-ticket-from">
                From <strong>₹{m.basePriceInr.toLocaleString("en-IN")}</strong>
              </p>
              <Link to={`/book/${m.id}`} className="btn primary">
                View &amp; select seats
              </Link>
            </article>
          );
        })}
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/book">← Booking hub</Link>
      </p>
    </>
  );
}

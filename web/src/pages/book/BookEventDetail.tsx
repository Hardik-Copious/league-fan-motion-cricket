import { Link, useParams } from "react-router-dom";
import PageBanner from "../../components/PageBanner";
import { fixtureById, LEAGUE_DISPLAY_NAME, venueById } from "../../data/bookingMock";

export default function BookEventDetail() {
  const { eventId } = useParams();
  const m = eventId ? fixtureById(eventId) : undefined;
  const v = m ? venueById(m.venueId) : undefined;

  if (!m) {
    return (
      <>
        <PageBanner variant="tickets" />
        <p className="error">No such fixture.</p>
        <Link to="/book/fixtures">← Fixtures</Link>
      </>
    );
  }

  return (
    <>
      <PageBanner variant="matches" />
      <div className="book-mock-hero">
        <p className="muted small">{LEAGUE_DISPLAY_NAME}</p>
        <h1>
          {m.home} · {m.away}
        </h1>
        <p className="muted">
          {m.dateLabel} · {m.timeLabel} · {m.round}
        </p>
        <p className="muted">
          <strong>{v?.name}</strong>, {v?.city} · Est. capacity {v?.capacity?.toLocaleString("en-IN")}
        </p>
      </div>

      <div className="card card-textured book-event-detail-card">
        <h2>What’s included (mock)</h2>
        <ul className="book-mock-list">
          <li>Stadium entry for one match day</li>
          <li>Seat in selected block (subject to availability)</li>
          <li>Digital ticket delivered to email (simulated)</li>
        </ul>
        <p className="muted small">Concessions, parking, and portkey transfers are not included.</p>
        <p style={{ marginTop: "1rem" }}>
          <Link className="btn primary" to={`/book/${m.id}/seats`}>
            Choose seats
          </Link>
        </p>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/book/fixtures">← All fixtures</Link>
      </p>
    </>
  );
}

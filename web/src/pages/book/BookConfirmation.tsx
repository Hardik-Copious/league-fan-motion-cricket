import { Link, useSearchParams } from "react-router-dom";
import PageBanner from "../../components/PageBanner";
import { fixtureById, LEAGUE_DISPLAY_NAME } from "../../data/bookingMock";

export default function BookConfirmation() {
  const [params] = useSearchParams();
  const eventId = params.get("eventId") ?? "";
  const qty = params.get("qty") ?? "—";
  const total = params.get("total") ?? "0";
  const ref = params.get("ref") ?? "—";

  const m = eventId ? fixtureById(eventId) : undefined;

  return (
    <>
      <PageBanner variant="games" />
      <div className="book-mock-hero book-confirm-hero">
        <div className="book-confirm-badge">✓</div>
        <h1>Booking confirmed</h1>
        <p className="muted">{LEAGUE_DISPLAY_NAME}</p>
      </div>

      <div className="card card-textured book-confirm-card">
        {m ? (
          <>
            <p className="muted small">Match</p>
            <p className="book-confirm-match">
              {m.home} <span className="book-vs">v</span> {m.away}
            </p>
            <p className="muted">{m.dateLabel}</p>
          </>
        ) : (
          <p className="muted">Reservation on file.</p>
        )}
        <hr className="book-confirm-rule" />
        <p>
          <strong>Reference</strong> · {ref}
        </p>
        <p>
          <strong>Tickets</strong> · {qty}
        </p>
        <p>
          <strong>Paid (mock)</strong> · ₹{Number(total).toLocaleString("en-IN")}
        </p>
        <p className="muted small" style={{ marginTop: "1rem" }}>
          A pretend confirmation email would be sent to the address you entered.
        </p>
      </div>

      <p style={{ marginTop: "1rem" }}>
        <Link to="/book/fixtures" className="btn primary">
          Book another match
        </Link>{" "}
        <Link to="/" className="btn">
          Home
        </Link>
      </p>
    </>
  );
}

import { Link } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import { LEAGUE_DISPLAY_NAME } from "../data/bookingMock";

export default function BookTickets() {
  return (
    <>
      <PageBanner variant="tickets" />
      <div className="book-tickets-hero book-mock-hero">
        <h1>{LEAGUE_DISPLAY_NAME}</h1>
        <p className="muted">
          Mock ticket centre — sample fixtures, seat tiers, and a fake checkout. No real payments.
        </p>
      </div>

      <div className="book-hub-grid">
        <Link to="/book/fixtures" className="card book-hub-tile book-hub-tile--fixtures">
          <span className="book-hub-icon" aria-hidden>
            🏟
          </span>
          <h2 className="book-hub-title">Browse fixtures</h2>
          <p className="muted">Dummy schedule with venues &amp; prices</p>
        </Link>
        <Link to="/matches" className="card book-hub-tile book-hub-tile--live">
          <span className="book-hub-icon" aria-hidden>
            📋
          </span>
          <h2 className="book-hub-title">League matches</h2>
          <p className="muted">Real data from the app database</p>
        </Link>
        <div className="card book-hub-tile book-hub-tile--note">
          <h2 className="book-hub-title">Integrations</h2>
          <p className="muted small">
            Swap this flow for BookMyShow, Razorpay, or your own API — the mock pages are structured placeholders.
          </p>
        </div>
      </div>

      <div className="card card-textured" style={{ marginTop: "1rem" }}>
        <h2>Quick flow</h2>
        <ol className="book-mock-list">
          <li>
            <Link to="/book/fixtures">Fixtures</Link> → event detail → seat tier &amp; quantity
          </li>
          <li>Checkout (after seats) → confirmation with a mock reference number</li>
        </ol>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/">Home</Link>
        {" · "}
        <Link to="/games">Games</Link>
      </p>
    </>
  );
}

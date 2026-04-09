import { Link } from "react-router-dom";

export default function BookTickets() {
  return (
    <>
      <div className="book-tickets-hero">
        <h1>Book tickets</h1>
        <p className="muted">
          Reserve seats for upcoming league fixtures. This page is a demo hub — wire your real ticketing provider URL
          when ready.
        </p>
      </div>

      <div className="card card-textured">
        <h2>Next steps</h2>
        <p className="muted">
          Replace this section with your vendor widget (BookMyShow, Ticketmaster, in-house checkout) or an external link.
        </p>
        <p style={{ marginTop: "0.75rem" }}>
          <a className="btn primary" href="https://example.com/tickets" target="_blank" rel="noreferrer">
            Open demo ticketing site
          </a>
        </p>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/matches">View match list</Link>
        {" · "}
        <Link to="/">Home</Link>
      </p>
    </>
  );
}

import { Link } from "react-router-dom";
import type { MatchRow, Team } from "../types";

type Props = {
  match: MatchRow;
  home: Team | undefined;
  away: Team | undefined;
};

export default function MatchCard({ match, home, away }: Props) {
  const when = new Date(match.scheduled_at);
  const dateStr = when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const timeStr = when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <Link to={`/matches/${match.id}`} className="match-card">
      <div className="match-card-top">
        <span className={`badge match-card-status ${match.status === "live" ? "live" : match.status === "completed" ? "done" : ""}`}>
          {match.status === "live" ? "● Live" : match.status}
        </span>
        <span className="match-card-meta">
          {dateStr} · {timeStr}
        </span>
      </div>
      <div className="match-card-teams">
        <div className="match-side">
          <span className="match-dot" style={{ background: home?.primary_color ?? "#334155" }} />
          <span className="match-code">{home?.short_code ?? match.home_team_id}</span>
          <span className="match-full muted">{home?.name}</span>
        </div>
        <span className="match-vs">vs</span>
        <div className="match-side match-side-away">
          <span className="match-dot" style={{ background: away?.primary_color ?? "#334155" }} />
          <span className="match-code">{away?.short_code ?? match.away_team_id}</span>
          <span className="match-full muted">{away?.name}</span>
        </div>
      </div>
      <div className="match-card-venue muted">{match.venue}</div>
      {match.result_summary && <div className="match-card-result">{match.result_summary}</div>}
    </Link>
  );
}

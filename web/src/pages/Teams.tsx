import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import { getTeamMerch } from "../data/teamMerch";
import { supabase } from "../supabaseClient";
import type { Team } from "../types";

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: e } = await supabase.from("teams").select("*").order("name");
      if (e) setError(e.message);
      else setTeams((data as Team[]) ?? []);
    })();
  }, []);

  if (error) return <p className="error">{error}</p>;

  return (
    <>
      <PageBanner variant="teams" />
      <header className="page-header">
        <h1>Franchises</h1>
        <p className="muted">Ten league teams — tap for fixtures and venue.</p>
      </header>
      <div className="team-grid">
        {teams.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className="card team-tile">
            <div className="team-tile-top" style={{ background: `linear-gradient(135deg, ${t.primary_color}44, transparent)` }}>
              <span className="team-tile-dot" style={{ background: t.primary_color }} />
              <span className="team-tile-code">{t.short_code}</span>
            </div>
            <strong className="team-tile-name">{t.name}</strong>
            <span className="muted team-tile-city">{t.city ?? t.home_venue}</span>
            {t.blurb && <p className="team-tile-blurb">{t.blurb.split(".")[0]}.</p>}
            <div className="team-merch-ad" style={{ borderColor: `${t.primary_color}55` }}>
              {(() => {
                const merch = getTeamMerch(t.id, t.short_code);
                return (
                  <>
                    <p className="team-merch-title">Merch ad · Player shirt</p>
                    <p className="team-merch-name">{merch.shirtName}</p>
                    <p className="team-merch-meta">
                      {merch.featuredPlayer} · from ₹{merch.shirtPriceInr.toLocaleString("en-IN")}
                    </p>
                  </>
                );
              })()}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

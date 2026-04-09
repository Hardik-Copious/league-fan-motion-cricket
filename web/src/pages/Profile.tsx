import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";
import type { Team } from "../types";

export default function Profile({ session }: { session: Session | null }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [favorite, setFavorite] = useState<string>("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("teams").select("*").order("name");
      setTeams((data as Team[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    void (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (data) {
        setDisplayName(data.display_name ?? "");
        setFavorite(data.favorite_team_id ?? "");
      }
    })();
  }, [session]);

  if (!session) return <Navigate to="/auth" replace />;

  async function save() {
    setError(null);
    setSaved(false);
    const { error: e } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        favorite_team_id: favorite || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);
    if (e) setError(e.message);
    else setSaved(true);
  }

  return (
    <>
      <PageBanner variant="profile" />
      <h1>Profile</h1>
      <p className="muted">{session.user.email}</p>
      <div className="card">
        <div className="field">
          <label htmlFor="dn">Display name</label>
          <input
            id="dn"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
          />
        </div>
        <div className="field">
          <label htmlFor="ft">Favorite team</label>
          <select id="ft" value={favorite} onChange={(e) => setFavorite(e.target.value)}>
            <option value="">— None —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn primary" onClick={() => void save()}>
          Save
        </button>
        {saved && <p style={{ marginTop: "0.75rem" }}>Saved.</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}

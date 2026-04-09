import { NavLink, Route, Routes } from "react-router-dom";
import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "./supabaseClient";
import Home from "./pages/Home";
import Teams from "./pages/Teams";
import TeamDetail from "./pages/TeamDetail";
import Matches from "./pages/Matches";
import MatchDetail from "./pages/MatchDetail";
import Standings from "./pages/Standings";
import Profile from "./pages/Profile";
import Games from "./pages/Games";
import Auth from "./pages/Auth";
import Stats from "./pages/Stats";
import Players from "./pages/Players";
import PlayerDetail from "./pages/PlayerDetail";
import MotionMatchLobby from "./pages/MotionMatchLobby";
const MotionCricketHost = lazy(() => import("./games/MotionCricketHost"));
const MotionCricketBat = lazy(() => import("./games/MotionCricketBat"));

function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let sub: { unsubscribe: () => void } | null = null;
    void supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch((e) => console.error("getSession", e));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    sub = data.subscription;
    return () => sub?.unsubscribe();
  }, []);

  return (
    <div className="container">
      {!isSupabaseConfigured && (
        <div
          className="card"
          style={{
            marginBottom: "1rem",
            borderColor: "var(--danger)",
            background: "#2a1515",
          }}
        >
          <strong>Supabase not configured.</strong>{" "}
          <span className="muted">
            Add <code style={{ color: "var(--text)" }}>web/.env.local</code> with{" "}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see{" "}
            <code>.env.example</code>), then restart <code>npm run dev</code>.
          </span>
        </div>
      )}
      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
          Home
        </NavLink>
        <NavLink to="/matches" className={({ isActive }) => (isActive ? "active" : "")}>
          Matches
        </NavLink>
        <NavLink to="/standings" className={({ isActive }) => (isActive ? "active" : "")}>
          Table
        </NavLink>
        <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
          Stats
        </NavLink>
        <NavLink to="/players" className={({ isActive }) => (isActive ? "active" : "")}>
          Players
        </NavLink>
        <NavLink to="/teams" className={({ isActive }) => (isActive ? "active" : "")}>
          Teams
        </NavLink>
        <NavLink to="/games" className={({ isActive }) => (isActive ? "active" : "")}>
          Games
        </NavLink>
        <span className="nav-spacer" />
        {session ? (
          <>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "active" : "")}>
              Profile
            </NavLink>
            <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <NavLink to="/auth" className={({ isActive }) => (isActive ? "active" : "")}>
            Sign in
          </NavLink>
        )}
      </nav>

      <Suspense fallback={<p className="muted">Loading…</p>}>
      <Routes>
        <Route path="/" element={<Home session={session} />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:id" element={<TeamDetail />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail session={session} />} />
        <Route path="/standings" element={<Standings />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/players/:teamId/:playerSlug" element={<PlayerDetail />} />
        <Route path="/players" element={<Players />} />
        <Route path="/profile" element={<Profile session={session} />} />
        <Route path="/games" element={<Games session={session} />} />
        <Route path="/games/match" element={<MotionMatchLobby />} />
        <Route path="/games/motion" element={<MotionCricketHost session={session} />} />
        <Route path="/games/bat" element={<MotionCricketBat />} />
        <Route path="/auth" element={<Auth />} />
      </Routes>
      </Suspense>
    </div>
  );
}

export default App;

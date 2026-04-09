import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import PageBanner from "../components/PageBanner";
import { supabase } from "../supabaseClient";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [authed, setAuthed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (mode === "signup") {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) setError(err.message);
      else setInfo("Check your email to confirm, or sign in if confirmations are disabled.");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
      else setAuthed(true);
    }
  }

  if (authed) return <Navigate to="/" replace />;

  return (
    <>
      <div className="auth-layout">
        <PageBanner variant="auth" />
        <div>
          <h1>{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="muted">
            Enable Email provider in Supabase → Authentication → Providers. Add redirect URL{" "}
            <code>http://localhost:5173</code> for local dev.
          </p>
          <div className="card" style={{ maxWidth: 420 }}>
            <form onSubmit={(e) => void submit(e)}>
              <div className="field">
                <label htmlFor="em">Email</label>
                <input
                  id="em"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="pw">Password</label>
                <input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                />
              </div>
              <button type="submit" className="btn primary">
                {mode === "signin" ? "Sign in" : "Sign up"}
              </button>
            </form>
            <p style={{ marginTop: "1rem" }}>
              <button type="button" className="btn" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
              </button>
            </p>
            {info && <p style={{ marginTop: "0.75rem" }}>{info}</p>}
            {error && <p className="error">{error}</p>}
            <p className="muted" style={{ marginTop: "1rem" }}>
              <Link to="/">Back home</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

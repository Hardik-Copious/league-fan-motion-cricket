import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

const isPlaceholder =
  !url ||
  !anonKey ||
  url.includes("YOUR_PROJECT_REF") ||
  anonKey === "your_anon_or_publishable_key";

/** True when real env vars are set. If false, we use a dummy client so the app still mounts. */
export const isSupabaseConfigured = !isPlaceholder;

// createClient("", "") throws ("supabaseUrl is required") and leaves a blank page — avoid that.
const clientUrl = isSupabaseConfigured ? url : "https://placeholder.local.supabase.co";
const clientKey = isSupabaseConfigured ? anonKey : "placeholder-anon-key";

export const supabase: SupabaseClient = createClient(clientUrl, clientKey, {
  auth: {
    persistSession: isSupabaseConfigured,
    autoRefreshToken: isSupabaseConfigured,
    detectSessionInUrl: isSupabaseConfigured,
  },
});

if (!isSupabaseConfigured) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy web/.env.example to web/.env.local — UI works, data/auth will not."
  );
}

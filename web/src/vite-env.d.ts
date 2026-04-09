/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Optional. e.g. http://192.168.1.5:5173 — phone "bat" URL when you open stadium on localhost. */
  readonly VITE_PHONE_URL_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

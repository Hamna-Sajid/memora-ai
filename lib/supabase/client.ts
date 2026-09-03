import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  configuredUrl && configuredAnonKey,
);

export function requireSupabaseConfiguration() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart the app.",
    );
  }
}

// Placeholders let Next.js prerender the UI without live credentials. Every query
// calls requireSupabaseConfiguration() before network or storage access.
export const supabase = createClient(
  configuredUrl || "http://127.0.0.1:54321",
  configuredAnonKey || "missing-anon-key",
);

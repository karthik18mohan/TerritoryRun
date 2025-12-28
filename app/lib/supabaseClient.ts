import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let browserClient: SupabaseClient | null = null;

export const supabaseBrowser = () => {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return browserClient;
};

export const supabaseServer = (serviceRoleKey?: string) => {
  const key = serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false
    }
  });
};

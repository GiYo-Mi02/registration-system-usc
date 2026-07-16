import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in environment variables.");
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");

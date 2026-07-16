import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./config";

const safeUrl = SUPABASE_URL || "https://placeholder.supabase.co";
const safeKey = SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

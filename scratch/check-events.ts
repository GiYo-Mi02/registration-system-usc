import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
  const { data: events, error } = await supabase
    .from("events")
    .select("*");
  
  if (error) {
    console.error("Error fetching events:", error);
    return;
  }
  
  console.log("Current events in DB:", events);
}

main();

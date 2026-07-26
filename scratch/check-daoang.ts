import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
  const { data: students, error } = await supabase
    .from("students")
    .select("id, full_name, email, college, event_id")
    .ilike("email", "%carynnedaoang%");
  
  if (error) {
    console.error("Error fetching students:", error);
    return;
  }
  
  console.log("Matching carynnedaoang emails:", students);
}

main();

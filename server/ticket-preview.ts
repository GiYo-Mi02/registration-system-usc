import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEmailTemplate } from "./ticket-template.js";

/** Render the current design with the saved QR; this never sends or updates a ticket. */
export async function renderTicketPreview(
  database: SupabaseClient,
  studentId: string,
  saved: { email_html: string; qr_data_url: string }
): Promise<string> {
  if (!saved.qr_data_url) return saved.email_html;
  const { data: student, error } = await database.from("students")
    .select("full_name, college, program, year, section, events(name, event_date, venue, description)")
    .eq("id", studentId).maybeSingle();
  if (error) throw error;
  const event = Array.isArray(student?.events) ? student.events[0] : student?.events;
  if (!student || !event) return saved.email_html;
  return generateEmailTemplate(
    student.full_name, student.college, event.name, event.event_date, event.venue,
    saved.qr_data_url, event.description || "", student.program || "", student.year || "", student.section || ""
  );
}

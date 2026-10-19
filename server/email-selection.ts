import type { SupabaseClient } from "@supabase/supabase-js";

/** Bulk operations must never silently opt a display-only participant into email. */
export async function excludeUnrequestedEmails(db: SupabaseClient, studentIds: string[]): Promise<string[]> {
  const excluded = new Set<string>();
  for (let offset = 0; offset < studentIds.length; offset += 100) {
    const { data, error } = await db.from("email_log").select("student_id")
      .eq("delivery_status", "not_requested").in("student_id", studentIds.slice(offset, offset + 100));
    if (error) throw new Error("Could not check email delivery preferences.");
    for (const row of data || []) excluded.add(row.student_id);
  }
  return studentIds.filter(id => !excluded.has(id));
}

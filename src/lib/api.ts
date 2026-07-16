import { supabase } from "./supabase";
import { Student, Event } from "../types";

// ─── EVENTS ────────────────────────────────────────────────────────────────
export async function fetchEvents(token: string): Promise<Event[]> {
  try {
    const res = await fetch("/api/events", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      return data.events;
    }
    return [];
  } catch (e) {
    console.error("[API] fetchEvents error:", e);
    return [];
  }
}

export async function createEvent(
  token: string,
  body: Omit<Event, "id">
): Promise<{ success: boolean; event?: Event; message?: string }> {
  try {
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { success: data.success, event: data.event, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error creating event." };
  }
}

export async function updateEvent(
  token: string,
  eventId: string,
  updates: Partial<Pick<Event, "name" | "event_date" | "description" | "venue" | "banner_url">>
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/events?id=${eventId}`, {
      method: "PUT",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error updating event." };
  }
}

export async function deleteEvent(token: string, eventId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/events?id=${eventId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error deleting event." };
  }
}

export async function fetchStudents(token: string, eventId: string): Promise<Student[]> {
  try {
    const res = await fetch(`/api/students?eventId=${eventId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      return data.students;
    }
    return [];
  } catch (e) {
    console.error("[API] fetchStudents error:", e);
    return [];
  }
}

export async function deleteStudent(token: string, studentId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/students?studentId=${studentId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error deleting student." };
  }
}

export async function getEmailPreview(token: string, studentId: string): Promise<{ success: boolean; html?: string; message?: string }> {
  try {
    const res = await fetch(`/api/email-preview?studentId=${studentId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return { success: data.success, html: data.email_html, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error loading email preview." };
  }
}

// ─── MANUAL ADD ────────────────────────────────────────────────────────────
export async function addStudentManual(
  token: string,
  payload: { full_name: string; email: string; college: string; eventId: string }
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch("/api/manual-add", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    try { const d = await res.json(); return { success: false, message: d.message }; } catch { return { success: false, message: "Registration failed" }; }
  }
  const data = await res.json();
  return { success: data.success, message: data.message };
}

export async function importCsvStudents(
  token: string,
  eventId: string,
  students: { full_name: string; email: string; college: string }[]
): Promise<{ success: boolean; message?: string; insertedCount?: number }> {
  const res = await fetch("/api/import-csv", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ eventId, students }),
  });
  if (!res.ok) {
    try { const d = await res.json(); return { success: false, message: d.message }; } catch { return { success: false, message: "Import failed" }; }
  }
  const data = await res.json();
  return { success: data.success, message: data.message, insertedCount: data.insertedCount };
}

export async function resendTicket(
  token: string,
  studentId: string
): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/resend?studentId=${studentId}`, {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${token}`
    },
  });
  if (!res.ok) {
    try { const d = await res.json(); return { success: false, message: d.message }; } catch { return { success: false, message: "Resend failed" }; }
  }
  const data = await res.json();
  return { success: data.success, message: data.message };
}

// ─── RESET DB ─────────────────────────────────────────────────────────────
export async function resetDatabase(token: string): Promise<{ success: boolean; message?: string }> {
  const res = await fetch("/api/reset-db", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    try { const d = await res.json(); return { success: false, message: d.message }; } catch { return { success: false, message: "Reset failed" }; }
  }
  const data = await res.json();
  return { success: data.success, message: data.message };
}

// ─── VERIFY SCAN ──────────────────────────────────────────────────────────
// Calls Supabase RPC verify_attendance_scan directly — no Express needed!
export async function verifyScan(
  token: string,
  scannedBy: string,
  eventId: string
): Promise<{
  status: "VALID" | "ALREADY_USED" | "FAKE";
  student?: { full_name: string; email: string; college: string };
  scanned_at?: string;
  original_time?: string;
  scanned_by_name?: string;
  message?: string;
  time_string?: string;
}> {
  // Parse token: studentId:eventId:nonce:signature
  const parts = token.split(":");
  if (parts.length !== 4) return { status: "FAKE", message: "Malformed token format." };

  const [studentId, tokenEventId] = parts;

  // Cross-check event
  if (eventId && tokenEventId !== eventId) {
    return { status: "FAKE", message: "This ticket is not valid for this event." };
  }

  // Verify via existing Supabase RPC (handles HMAC verification server-side in DB)
  const { data, error } = await supabase.rpc("verify_attendance_scan", {
    p_student_id: studentId,
    p_token: token,
    p_scanned_by: scannedBy,
  });

  if (error || !data || data.length === 0) {
    return { status: "FAKE", message: "Scan verification failed. Token may be invalid." };
  }

  const result = data[0];

  if (result.status === "VALID") {
    return {
      status: "VALID",
      student: { full_name: result.student_name, email: result.student_email, college: result.student_college },
      scanned_at: result.scanned_at,
      scanned_by_name: result.scanned_by_name,
      time_string: result.scanned_at ? new Date(result.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined,
    };
  } else if (result.status === "ALREADY_USED") {
    return {
      status: "ALREADY_USED",
      student: { full_name: result.student_name, email: result.student_email, college: result.student_college },
      scanned_at: result.scanned_at,
      original_time: result.original_time,
      scanned_by_name: result.scanned_by_name,
    };
  }

  return { status: "FAKE", message: "Scan entry mismatch." };
}

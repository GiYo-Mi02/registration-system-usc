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

export async function deleteAllStudents(token: string, eventId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/students?eventId=${eventId}&all=true`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error clearing registry." };
  }
}

export async function resetEmailStatuses(token: string, eventId: string, emails?: string[]): Promise<{ success: boolean; message?: string; count?: number }> {
  try {
    const res = await fetch("/api/reset-emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ eventId, emails })
    });
    const data = await res.json();
    return { success: data.success, message: data.message, count: data.count };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error resetting email statuses." };
  }
}

export async function resendBulk(
  token: string,
  eventId: string,
  studentIds: string[]
): Promise<{
  success: boolean;
  message?: string;
  count?: number;
  requestedCount?: number;
  acceptedCount?: number;
  failedCount?: number;
  simulatedCount?: number;
  quotaExceeded?: boolean;
}> {
  try {
    const res = await fetch("/api/resend-bulk", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ eventId, studentIds })
    });
    const data = await res.json();
    return {
      success: data.success,
      message: data.message,
      count: data.count,
      requestedCount: data.requestedCount,
      acceptedCount: data.acceptedCount,
      failedCount: data.failedCount,
      simulatedCount: data.simulatedCount,
      quotaExceeded: data.quotaExceeded
    };
  } catch (e: any) {
    return { success: false, message: e.message || "Network error triggering bulk resend." };
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
  payload: { full_name: string; email: string; college: string; program: string; year: string; section: string; eventId: string; skipEmails?: boolean }
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
  students: { full_name: string; email: string; college: string; program: string; year: string; section: string }[],
  skipEmails?: boolean
): Promise<{ success: boolean; message?: string; insertedCount?: number; updatedCount?: number }> {
  const res = await fetch("/api/import-csv", {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ eventId, students, skipEmails }),
  });
  if (!res.ok) {
    try { const d = await res.json(); return { success: false, message: d.message }; } catch { return { success: false, message: "Import failed" }; }
  }
  const data = await res.json();
  return { success: data.success, message: data.message, insertedCount: data.insertedCount, updatedCount: data.updatedCount };
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
// Calls the authenticated server endpoint, which validates the custom
// committee session and QR HMAC before invoking the service-role-only RPC.
export async function verifyScan(
  token: string,
  eventId: string,
  sessionToken: string
): Promise<{
  status: "VALID" | "ALREADY_USED" | "FAKE";
  student?: { full_name: string; email: string; college: string; program?: string | null; year?: string | null; section?: string | null };
  scanned_at?: string;
  original_time?: string;
  scanned_by_name?: string;
  message?: string;
  time_string?: string;
}> {
  const response = await fetch("/api/verify-scan", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sessionToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token, eventId })
  });
  const data = await response.json().catch(() => ({ message: "Scanner returned an unreadable response." }));
  if (!response.ok) {
    throw new Error(data.message || "Scan verification failed.");
  }
  return data;
}

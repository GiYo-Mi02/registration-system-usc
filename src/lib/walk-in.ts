import type { Student } from "../types";

export const walkInFields = [
  { key: "full_name", label: "Name", maxLength: 200 },
  { key: "email", label: "Email", maxLength: 254 },
  { key: "college", label: "College", maxLength: 200 },
  { key: "program", label: "Program", maxLength: 200 },
  { key: "year", label: "Year", maxLength: 30 },
  { key: "section", label: "Section", maxLength: 50 }
] as const;

export type WalkInDetails = Record<(typeof walkInFields)[number]["key"], string>;
export type PublicEvent = {
  id: string; name: string; event_date: string; venue: string; description: string; banner_url: string;
};
export type WalkInTicket = { full_name: string; event: PublicEvent; qr_data_url: string; scanned_at: string | null };

export const isEventId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validateWalkInDetails(value: unknown): { details?: WalkInDetails; message?: string } {
  if (!value || typeof value !== "object") return { message: "Please enter your registration details." };
  const record = value as Record<string, unknown>;
  const details = {} as WalkInDetails;
  for (const field of walkInFields) {
    const entry = record[field.key];
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > field.maxLength || /[\u0000-\u001f\u007f]/.test(entry)) {
      return { message: `${field.label} is required and must be at most ${field.maxLength} characters.` };
    }
    details[field.key] = entry.trim();
  }
  details.email = details.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) return { message: "Please enter a valid email address." };
  return { details };
}

export function isEmailNotRequested(student: Pick<Student, "delivery_status">): boolean {
  return student.delivery_status === "not_requested";
}

export function isEmailFailure(student: Pick<Student, "delivery_status" | "email_status" | "email_error">): boolean {
  return !isEmailNotRequested(student) && student.email_status === "failed"
    && student.delivery_status !== "queued" && !["queued", "sending"].includes(student.email_error || "");
}

import type { Student } from "../types";

export const ATTENDANCE_SELECT = "scanned_at, scanned_by, am_scanned_at, am_scanned_by, pm_scanned_at, pm_scanned_by";
export const SESSION_CSV_HEADERS = ["AM Attended (Yes/No)", "AM Check-in (Asia/Manila)", "AM Station", "PM Attended (Yes/No)", "PM Check-in (Asia/Manila)", "PM Station", "Both Sessions (Yes/No)"];

export function attendanceFields(att: Record<string, any> | null | undefined, scanners: Map<string, string>) {
  const station = (id: string | null | undefined) => id ? scanners.get(id) || (id === "admin-id" ? "Admin Desk" : "Unknown Station") : null;
  return {
    am_scanned_at: att?.am_scanned_at ?? null,
    am_scanned_by: att?.am_scanned_by ?? null,
    am_scanned_by_name: station(att?.am_scanned_by),
    pm_scanned_at: att?.pm_scanned_at ?? null,
    pm_scanned_by: att?.pm_scanned_by ?? null,
    pm_scanned_by_name: station(att?.pm_scanned_by),
  };
}

export function formatAttendanceTime(value: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).format(new Date(value));
}

function reportTime(value: string | null | undefined): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")} +08:00`;
}

export function sessionCsvCells(student: Pick<Student, "am_scanned_at" | "pm_scanned_at" | "am_scanned_by_name" | "pm_scanned_by_name">): string[] {
  return [student.am_scanned_at ? "Yes" : "No", reportTime(student.am_scanned_at), student.am_scanned_by_name || "", student.pm_scanned_at ? "Yes" : "No", reportTime(student.pm_scanned_at), student.pm_scanned_by_name || "", student.am_scanned_at && student.pm_scanned_at ? "Yes" : "No"];
}

export function matchesAttendance(student: Pick<Student, "scanned_at" | "am_scanned_at" | "pm_scanned_at">, filter: string): boolean {
  switch (filter) {
    case "attended": return !!student.scanned_at;
    case "not_attended": return !student.scanned_at;
    case "am": return !!student.am_scanned_at;
    case "pm": return !!student.pm_scanned_at;
    case "both": return !!student.am_scanned_at && !!student.pm_scanned_at;
    case "am_only": return !!student.am_scanned_at && !student.pm_scanned_at;
    case "pm_only": return !student.am_scanned_at && !!student.pm_scanned_at;
    default: return true;
  }
}

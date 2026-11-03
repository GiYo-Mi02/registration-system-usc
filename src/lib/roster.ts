import type { PublicEvent } from "./walk-in";

export interface RosterDetails {
  full_name: string;
  school: string;
  program: string;
  year: string;
  school_id: string;
  cor: string;
  coach_name: string;
}
export interface RosterEntry extends RosterDetails {
  id: string;
  check_in_code: string | null;
}
export interface CheckInReceipt {
  reference: string;
  checked_in_at: string;
  participant: RosterDetails;
  event: PublicEvent;
}
export interface RosterMatch {
  participant: RosterDetails;
  confirmation: string;
}

export function usableSchoolId(value: string): string | null {
  const cleaned = value.trim().replace(/\s*\/\s*no id\s*$/i, "").trim();
  return !cleaned || /^(no\s*id|n\/?a|none|-)$/i.test(cleaned) ? null : cleaned.toUpperCase().replace(/\s/g, "");
}

/** Accepts spreadsheet TSV (including quoted newlines) or named-column CSV. */
export function parseRoster(text: string): RosterDetails[] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || field.trim() === "")) {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
      row.push(field.trim()); field = "";
      if (c !== delimiter) { rows.push(row); row = []; if (c === "\r" && text[i + 1] === "\n") i++; }
    } else field += c;
  }
  if (quoted) throw new Error("An opening quote in the roster has no closing quote.");
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const output: RosterDetails[] = [];
  let school = "", coach = "";
  const header = rows[0]?.map(s => s.toLowerCase().replace(/^\uFEFF/, "")) || [];
  const named = header.includes("full_name") && header.includes("school");
  for (const cells of rows.slice(1)) {
    if (named) {
      const get = (key: keyof RosterDetails) => clean(cells[header.indexOf(key)] || "");
      if (!cells.some(Boolean)) continue;
      output.push({ full_name: get("full_name"), school: get("school"), program: get("program"), year: get("year"), school_id: get("school_id"), cor: get("cor"), coach_name: get("coach_name") });
    } else {
      if (!cells[3]?.trim()) continue;
      if (cells[1]?.trim()) { school = clean(cells[1]); coach = clean(cells[8] || ""); }
      output.push({ full_name: clean(cells[3]), school, program: clean(cells[4] || ""), year: clean(cells[5] || ""), school_id: clean(cells[6] || ""), cor: clean(cells[7] || ""), coach_name: coach });
    }
  }
  return validateRoster(output);
}

export function validateRoster(input: unknown): RosterDetails[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 1000) throw new Error("Provide between 1 and 1,000 participants.");
  const seen = new Set<string>();
  return input.map((value, i) => {
    if (!value || typeof value !== "object") throw new Error(`Invalid participant on row ${i + 1}.`);
    const result = {} as RosterDetails;
    for (const key of ["full_name", "school", "program", "year", "school_id", "cor", "coach_name"] as const) {
      const field = value[key];
      if (typeof field !== "string" || field.length > 250 || /[\x00-\x1f\x7f]/.test(field)) throw new Error(`Invalid ${key} on row ${i + 1}.`);
      result[key] = field.trim();
    }
    if (!result.full_name || !result.school) throw new Error(`Name and school are required on row ${i + 1}.`);
    const key = `${result.school.toLowerCase()}:${result.full_name.toLowerCase()}`;
    if (seen.has(key)) throw new Error(`Duplicate participant on row ${i + 1}: ${result.full_name}.`);
    seen.add(key);
    return result;
  });
}

export function checkInTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "medium" }).format(new Date(value));
}

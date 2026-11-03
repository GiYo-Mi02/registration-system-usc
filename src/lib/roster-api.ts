import type { CheckInReceipt, RosterDetails, RosterEntry, RosterMatch } from "./roster";
import type { PublicEvent } from "./walk-in";

export class RosterRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function rosterRequest<T>(action: string, eventId?: string, body?: unknown, token?: string): Promise<T> {
  const response = await fetch(`/api/roster-check-in?action=${action}${eventId ? `&eventId=${encodeURIComponent(eventId)}` : ""}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({ message: "Unreadable server response. Please retry." }));
  if (!response.ok || !data.success) throw new RosterRequestError(data.message || "Check-in is unavailable. Please retry.", response.status);
  return data;
}
export const rosterEvents = () => rosterRequest<{ events: PublicEvent[] }>("events");
export const lookupParticipant = (eventId: string, schoolId: string, school: string) => rosterRequest<RosterMatch>("lookup", eventId, { schoolId, school });
export const confirmParticipant = (eventId: string, confirmation: string) => rosterRequest<{ receipt: CheckInReceipt }>("confirm", eventId, { confirmation });
export type RosterAdminData = { entries: RosterEntry[]; receipts: CheckInReceipt[]; open: boolean };
export type RosterSource = { participants: RosterDetails[]; eventName: string };

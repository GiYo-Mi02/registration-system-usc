import type { PublicEvent, WalkInDetails, WalkInTicket } from "./walk-in";

export class RegistrationError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    const data = await response.json().catch(() => ({ message: "The server returned an unreadable response. Please retry." }));
    if (!response.ok || !data.success) throw new RegistrationError(data.message || "Registration is unavailable. Please retry.", response.status, data.code);
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new RegistrationError("The connection is taking too long. Your details are saved in this tab. Retry to recover or create the same ticket.", 408);
    throw error;
  } finally { window.clearTimeout(timeout); }
}

export async function getPublicEvents(eventId?: string): Promise<PublicEvent[]> {
  const data = await request<{ events: PublicEvent[] }>(`/api/public-events${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`);
  return data.events;
}

export async function restoreWalkIn(eventId: string, key: string): Promise<WalkInTicket | null> {
  try {
    const data = await request<{ ticket: WalkInTicket }>(`/api/walk-in-registration?eventId=${encodeURIComponent(eventId)}`, {
      headers: { "X-Registration-Key": key }
    });
    return data.ticket;
  } catch (error) {
    if (error instanceof RegistrationError && error.status === 404) return null;
    throw error;
  }
}

export async function registerWalkIn(eventId: string, key: string, details: WalkInDetails): Promise<WalkInTicket> {
  const data = await request<{ ticket: WalkInTicket }>("/api/walk-in-registration", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Registration-Key": key },
    body: JSON.stringify({ ...details, eventId })
  });
  return data.ticket;
}

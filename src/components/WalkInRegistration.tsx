import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, Calendar, Download, Loader2, MapPin, UserPlus } from "lucide-react";
import { getPublicEvents, registerWalkIn, restoreWalkIn } from "../lib/walk-in-api";
import { isEventId, validateWalkInDetails, walkInFields, type PublicEvent, type WalkInDetails, type WalkInTicket } from "../lib/walk-in";

const inputClass = "w-full rounded-xl border border-brand-accent/20 bg-brand-primary-dark px-4 py-3 text-base text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent px-5 py-3 font-semibold text-brand-primary-dark disabled:opacity-50 disabled:cursor-not-allowed";
const emptyDetails = (): WalkInDetails => ({ full_name: "", email: "", college: "", program: "", year: "", section: "" });
const storageKey = (eventId: string) => `walk-in-v1:${eventId}`;
type Session = { key: string; details: WalkInDetails; stage: "form" | "review"; attempted: boolean };

function loadSession(eventId: string): Session {
  const saved = sessionStorage.getItem(storageKey(eventId));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (/^[a-f0-9]{64}$/.test(parsed.key) && walkInFields.every(field => typeof parsed.details?.[field.key] === "string")) {
        return { key: parsed.key, details: parsed.details, stage: parsed.stage === "review" ? "review" : "form", attempted: parsed.attempted === true };
      }
    } catch { /* Replace an invalid cached draft without accessing another ticket. */ }
  }
  const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
  const session: Session = { key, details: emptyDetails(), stage: "form", attempted: false };
  sessionStorage.setItem(storageKey(eventId), JSON.stringify(session));
  return session;
}

function messageFor(error: unknown) {
  if (error instanceof Error && error.name === "TimeoutError") return "The connection is taking too long. Your details are saved in this tab. Retry to recover or create the same ticket.";
  return error instanceof Error ? error.message : "Could not connect. Your details are saved in this tab. Please retry.";
}

function EventDetails({ event }: { event: PublicEvent }) {
  return <div className="space-y-2">
    <h2 className="font-serif text-2xl font-bold">{event.name}</h2>
    <p className="flex items-center gap-2 text-sm text-brand-text/75"><Calendar className="h-4 w-4 shrink-0" />{event.event_date}</p>
    <p className="flex items-center gap-2 text-sm text-brand-text/75"><MapPin className="h-4 w-4 shrink-0" />{event.venue}</p>
  </div>;
}

function OpenEvents() {
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    getPublicEvents().then(data => { if (active) setEvents(data); })
      .catch(error => { if (active) setError(messageFor(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <>
    <h1 className="font-serif text-3xl font-bold">Walk-In Registration</h1>
    <p className="mt-3 text-brand-text/75">Choose your event to register. No student account is needed.</p>
    {loading ? <p role="status" className="mt-8 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading events…</p>
      : error ? <div className="mt-8 space-y-4"><p role="alert">{error}</p><button className={buttonClass} onClick={() => setAttempt(value => value + 1)}>Retry</button></div>
      : events.length === 0 ? <p className="mt-8 rounded-xl border border-brand-accent/20 p-6">No events are accepting walk-ins right now. Please check with the registration committee.</p>
      : <div className="mt-8 grid gap-5 sm:grid-cols-2">{events.map(event => <article key={event.id} className="flex flex-col gap-5 rounded-2xl border border-brand-accent/20 bg-brand-primary-light p-6">
        <EventDetails event={event} />
        <p className="flex-1 whitespace-pre-wrap text-sm text-brand-text/75">{event.description}</p>
        <a className={buttonClass} href={`/register/${event.id}`}>Register for this event</a>
      </article>)}</div>}
  </>;
}

function EventRegistration({ eventId }: { eventId: string }) {
  const [initial] = useState(() => {
    try { return { session: loadSession(eventId), error: "" }; }
    catch { return { session: null, error: "Registration needs browser session storage. Enable it, then reload this page, or visit the assistance desk." }; }
  });
  const [session, setSession] = useState(initial.session);
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [ticket, setTicket] = useState<WalkInTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(initial.error);
  const [retry, setRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const submittingRef = useRef(false);
  const activeRef = useRef(true);
  const secret = session?.key;

  useEffect(() => {
    activeRef.current = true;
    const onPageShow = (e: PageTransitionEvent) => {
      try { if (e.persisted && !sessionStorage.getItem(storageKey(eventId))) window.location.reload(); }
      catch { window.location.reload(); }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => { activeRef.current = false; window.removeEventListener("pageshow", onPageShow); };
  }, [eventId]);

  useEffect(() => {
    if (!secret) { setLoading(false); return; }
    let active = true;
    setLoading(true); setError(""); setReady(false);
    const load = async () => {
      // Never continue to a new submission while the result of an earlier one is unknown.
      const saved = initial.session?.attempted ? await restoreWalkIn(eventId, secret) : null;
      if (!active) return;
      if (saved) { setTicket(saved); setEvent(saved.event); setReady(true); return; }
      const events = await getPublicEvents(eventId);
      if (active) { setEvent(events[0] || null); setReady(true); }
    };
    load().catch(error => { if (active) setError(messageFor(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [eventId, secret, retry, initial.session?.attempted]);

  const save = (next: Session): boolean => {
    setSession(next);
    try { sessionStorage.setItem(storageKey(eventId), JSON.stringify(next)); return true; }
    catch { setError("Your browser could not save this registration session. Please enable session storage before submitting."); return false; }
  };
  const review = (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const result = validateWalkInDetails(session.details);
    if (!result.details) { setError(result.message || "Please check your details."); return; }
    setError(""); save({ ...session, details: result.details, stage: "review" });
  };
  const submit = async () => {
    if (!session || submittingRef.current || !ready) return;
    if (!save({ ...session, attempted: true })) return;
    submittingRef.current = true; setSubmitting(true); setError("");
    try {
      const issued = await registerWalkIn(eventId, session.key, session.details);
      if (activeRef.current) setTicket(issued);
    } catch (error) { if (activeRef.current) setError(messageFor(error)); }
    finally { submittingRef.current = false; if (activeRef.current) setSubmitting(false); }
  };
  const finish = () => {
    try { sessionStorage.removeItem(storageKey(eventId)); }
    catch { setError("Could not clear this ticket. Close this browser tab before handing the device to someone else."); return; }
    window.location.assign("/register");
  };

  if (loading) return <p role="status" className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Preparing registration…</p>;
  if (!ready || !session) return <div className="space-y-5"><h1 className="font-serif text-2xl">Registration could not load</h1><p role="alert">{error}</p><button className={buttonClass} onClick={() => session ? setRetry(value => value + 1) : window.location.reload()}>Retry</button></div>;
  if (ticket) return <section className="mx-auto max-w-xl space-y-6 rounded-2xl border border-brand-accent/25 bg-brand-primary-light p-6 sm:p-8">
    <p className="text-sm font-semibold uppercase tracking-wider text-brand-accent">Your admission QR</p>
    <EventDetails event={ticket.event} />
    <h1 className="break-words text-xl font-bold">{ticket.full_name}</h1>
    <p role="status">Registration saved. Present this QR to the registration committee to check in.</p>
    {ticket.scanned_at && <p className="font-semibold text-brand-accent">This ticket has already been checked in. Another scan will show Duplicate Entry.</p>}
    <div className="rounded-2xl bg-white p-4"><img src={ticket.qr_data_url} alt={`Admission QR for ${ticket.full_name}`} className="mx-auto aspect-square w-full max-w-[360px]" /></div>
    <a href={ticket.qr_data_url} download={`admission-${ticket.event.id}.png`} className={`${buttonClass} w-full`}><Download className="h-5 w-5" />Download QR</a>
    <p className="text-sm text-brand-text/75">Keep a downloaded copy. This QR allows one successful check-in for this event. Bring your student ID for committee checking.</p>
    {error && <p role="alert" className="text-red-200">{error}</p>}
    <button className="w-full rounded-xl border border-brand-accent/25 px-5 py-3" onClick={finish}>Finish / Clear ticket</button>
    <p className="text-xs text-brand-text/65">On a shared device, download your QR before clearing this ticket. If you lose it, ask the assistance desk.</p>
  </section>;
  if (!event) return <div className="space-y-4"><h1 className="font-serif text-2xl">Walk-in registration is closed</h1><p>This event is not accepting new walk-ins. Please visit the registration committee.</p><button className={buttonClass} onClick={() => setRetry(value => value + 1)}>Check again</button></div>;
  return <section className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-brand-accent/20 bg-brand-primary-light p-6 sm:p-8">
    <p className="text-sm font-semibold uppercase tracking-wider text-brand-accent">{session.stage === "form" ? "Step 1 of 2 · Your details" : "Step 2 of 2 · Review and submit"}</p>
    <EventDetails event={event} />
    <p className="text-sm text-brand-text/75">Use the same details as your student records. Your information will be used for event registration and committee check-in.</p>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-red-200">{error}</p>}
    {session.stage === "form" ? <form onSubmit={review} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">{walkInFields.map(field => <div key={field.key} className={field.key === "full_name" || field.key === "email" ? "sm:col-span-2" : ""}>
        <label htmlFor={`walk-in-${field.key}`} className="mb-2 block text-sm font-semibold">{field.label}</label>
        <input id={`walk-in-${field.key}`} name={field.key} type={field.key === "email" ? "email" : "text"} autoComplete={field.key === "full_name" ? "name" : field.key === "email" ? "email" : "off"}
          required maxLength={field.maxLength} value={session.details[field.key]} className={inputClass}
          onChange={e => save({ ...session, details: { ...session.details, [field.key]: e.target.value } })} />
      </div>)}</div>
      <button className={`${buttonClass} w-full`} type="submit">Review registration</button>
    </form> : <div className="space-y-6">
      <dl className="divide-y divide-brand-accent/15">{walkInFields.map(field => <div key={field.key} className="grid gap-1 py-3 sm:grid-cols-3"><dt className="text-sm text-brand-text/65">{field.label}</dt><dd className="break-words font-medium sm:col-span-2">{session.details[field.key]}</dd></div>)}</dl>
      <p className="text-sm text-brand-text/75">Submitting creates your QR. Attendance is recorded only when the committee scans it. No email will be sent.</p>
      <div className="flex flex-col gap-3 sm:flex-row"><button className="rounded-xl border border-brand-accent/25 px-5 py-3 disabled:opacity-50" disabled={submitting} onClick={() => save({ ...session, stage: "form" })}>Edit details</button>
        <button className={`${buttonClass} flex-1`} disabled={submitting} onClick={submit}>{submitting ? <><Loader2 className="h-5 w-5 animate-spin" />Creating your QR…</> : "Submit and generate QR"}</button></div>
    </div>}
  </section>;
}

export default function WalkInRegistration({ eventId }: { eventId?: string }) {
  return <main className="min-h-screen bg-brand-primary-dark px-4 py-8 text-brand-text sm:py-12">
    <div className="mx-auto max-w-5xl">
      <nav aria-label="Registration navigation" className="mb-8 flex flex-wrap items-center justify-between gap-4 text-sm">
        <a href={eventId ? "/register" : "/"} className="inline-flex items-center gap-2 text-brand-accent"><ArrowLeft className="h-4 w-4" />{eventId ? "All walk-in events" : "Home"}</a>
        <a href="/" className="text-brand-text/75">Event staff login</a>
      </nav>
      <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-brand-accent"><UserPlus className="h-4 w-4" />University of Makati · Participants</p>
      {!eventId ? <OpenEvents /> : isEventId(eventId) ? <EventRegistration key={eventId} eventId={eventId} /> : <p role="alert">This registration link is invalid. Choose an event from the walk-in events page.</p>}
    </div>
  </main>;
}

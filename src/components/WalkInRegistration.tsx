import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Calendar, Check, CheckCircle2, Download, Info, Loader2, MapPin, QrCode, Ticket, UserRound } from "lucide-react";
import { getPublicEvents, registerWalkIn, restoreWalkIn } from "../lib/walk-in-api";
import { isEventId, validateWalkInDetails, walkInFields, type PublicEvent, type WalkInDetails, type WalkInTicket } from "../lib/walk-in";
import { hasRegistrationPrivacyConsent, REGISTRATION_PRIVACY_VERSION, type RegistrationPrivacyConsent } from "../lib/registration-privacy";
import RegistrationPrivacyNotice from "./RegistrationPrivacyNotice";
import "./WalkInRegistration.css";

const buttonClass = "registration-button";
const emptyDetails = (): WalkInDetails => ({ full_name: "", email: "", college: "", program: "", year: "", section: "" });
const storageKey = (eventId: string) => `walk-in-v1:${eventId}`;
type Session = { key: string; details: WalkInDetails; stage: "form" | "review"; attempted: boolean; privacyConsent?: RegistrationPrivacyConsent };

function loadSession(eventId: string): Session {
  const saved = sessionStorage.getItem(storageKey(eventId));
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (/^[a-f0-9]{64}$/.test(parsed.key) && walkInFields.every(field => typeof parsed.details?.[field.key] === "string")) {
        return { key: parsed.key, details: parsed.details, stage: parsed.stage === "review" ? "review" : "form", attempted: parsed.attempted === true,
          privacyConsent: hasRegistrationPrivacyConsent(parsed.privacyConsent) ? parsed.privacyConsent : undefined };
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

function EventArtwork({ event }: { event: PublicEvent }) {
  const [failed, setFailed] = useState(false);
  return <div className="registration-artwork">
    {event.banner_url && !failed ? <img src={event.banner_url} alt="" loading="lazy" onError={() => setFailed(true)} />
      : <div className="registration-artwork-placeholder" aria-hidden="true"><Ticket strokeWidth={1} /><span>University of Makati</span></div>}
  </div>;
}

function EventDetails({ event }: { event: PublicEvent }) {
  return <div className="registration-event-details">
    <h2>{event.name}</h2>
    <p><Calendar aria-hidden="true" /><span>{event.event_date || "Date to be announced"}</span></p>
    <p><MapPin aria-hidden="true" /><span>{event.venue || "Venue to be announced"}</span></p>
  </div>;
}

function RegistrationProgress({ step }: { step: 1 | 2 | 3 }) {
  return <ol className="registration-progress" aria-label="Registration progress">
    {["Your details", "Review", "Admission QR"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined} className={step > index + 1 ? "is-complete" : ""}>
      <span className="registration-step-number">{step > index + 1 ? <Check aria-hidden="true" /> : index + 1}</span><span>{label}</span>
    </li>)}
  </ol>;
}

function RegistrationLayout({ event, children }: { event: PublicEvent; children: React.ReactNode }) {
  return <div className="registration-layout">
    <aside className="registration-summary" aria-label="Selected event">
      <EventArtwork key={event.banner_url} event={event} />
      <div className="registration-summary-body"><p className="registration-eyebrow">Your selected event</p><EventDetails event={event} />
        <div className="registration-summary-note"><QrCode aria-hidden="true" /><p>Keep your QR ready.<br /><span>Present it at the venue to check in.</span></p></div>
      </div>
    </aside>
    <section className="registration-panel">{children}</section>
  </div>;
}

function RegistrationNotice({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="registration-notice"><div className="registration-notice-icon"><Ticket aria-hidden="true" /></div><h1>{title}</h1><div>{children}</div>{action}</section>;
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
    <header className="registration-intro"><p className="registration-eyebrow">Walk-in registration</p><h1>Your next experience<br />starts here.</h1><p>Choose an event, enter your details, and get your admission QR.<br className="registration-desktop-break" /> No account needed.</p>
      <div className="registration-intro-steps"><span><UserRound aria-hidden="true" />Enter your details</span><ArrowRight aria-hidden="true" /><span><QrCode aria-hidden="true" />Save your QR</span></div>
    </header>
    <section aria-labelledby="registration-events-title">
      <div className="registration-section-heading"><h2 id="registration-events-title">Available events</h2>{!loading && !error && <span>{events.length} {events.length === 1 ? "event" : "events"} open</span>}</div>
      {loading ? <div role="status" className="registration-loading"><Loader2 className="animate-spin" aria-hidden="true" />Loading events…</div>
        : error ? <RegistrationNotice title="We couldn't load the events" action={<button className={buttonClass} onClick={() => setAttempt(value => value + 1)}>Try again <ArrowRight aria-hidden="true" /></button>}><p role="alert">{error}</p></RegistrationNotice>
        : events.length === 0 ? <RegistrationNotice title="Check back soon"><p>No events are accepting walk-ins right now.</p><p>Please check with the registration committee for availability.</p></RegistrationNotice>
        : <div className={`registration-event-grid${events.length === 1 ? " registration-event-grid-single" : ""}`}>{events.map(event => <article key={event.id} className="registration-event-card">
          <EventArtwork event={event} />
          <div className="registration-event-card-body"><span className="registration-open-badge"><span />Open for walk-ins</span><EventDetails event={event} />
            {event.description && <p className="registration-event-description">{event.description}</p>}
            <a className={buttonClass} href={`/register/${event.id}`} aria-label={`Register for this event: ${event.name}`}>Register for this event <ArrowRight aria-hidden="true" /></a>
          </div>
        </article>)}</div>}
    </section>
    <p className="registration-help"><Info aria-hidden="true" />Need help registering? Visit the registration committee at the venue.</p>
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
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const submittingRef = useRef(false);
  const activeRef = useRef(true);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const secret = session?.key;
  const privacyAccepted = hasRegistrationPrivacyConsent(session?.privacyConsent);

  useEffect(() => {
    if ((privacyAccepted && !privacyVisible) || ticket) headingRef.current?.focus();
  }, [session?.stage, privacyAccepted, privacyVisible, ticket]);

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
    if (!session || !privacyAccepted) return;
    const result = validateWalkInDetails(session.details);
    if (!result.details) { setError(result.message || "Please check your details."); return; }
    setError(""); save({ ...session, details: result.details, stage: "review" });
  };
  const submit = async () => {
    if (!session || !privacyAccepted || submittingRef.current || !ready) return;
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

  const agreeToPrivacyNotice = () => {
    if (!session) return;
    setError("");
    // Do not reveal the form unless consent can be preserved with this draft.
    const next: Session = { ...session, privacyConsent: { version: REGISTRATION_PRIVACY_VERSION, accepted: true } };
    try {
      sessionStorage.setItem(storageKey(eventId), JSON.stringify(next));
      setSession(next); setPrivacyVisible(false);
    } catch { setError("Your browser could not save your agreement. Enable session storage and try again, or visit the assistance desk."); }
  };

  if (loading) return <div role="status" className="registration-loading"><Loader2 className="animate-spin" aria-hidden="true" />Preparing registration…</div>;
  if (!ready || !session) return <RegistrationNotice title="Registration could not load" action={<button className={buttonClass} onClick={() => session ? setRetry(value => value + 1) : window.location.reload()}>Try again</button>}><p role="alert">{error}</p></RegistrationNotice>;
  if (ticket) return <RegistrationLayout event={ticket.event}>
    <RegistrationProgress step={3} />
    <div className="registration-ticket">
      <CheckCircle2 className="registration-success-icon" aria-hidden="true" />
      <p className="registration-eyebrow">Registration complete</p><h1 ref={headingRef} tabIndex={-1}>You're on the list.</h1>
      <p role="status">Registration saved. Present this QR at the venue to check in.</p>
      <div className="registration-qr"><img src={ticket.qr_data_url} alt={`Admission QR for ${ticket.full_name}`} /><h2>{ticket.full_name}</h2><p>ADMISSION QR · ONE CHECK-IN</p></div>
      {ticket.scanned_at && <p className="registration-info"><CheckCircle2 aria-hidden="true" />This ticket has already been checked in. Another scan will show Duplicate Entry.</p>}
      <a href={ticket.qr_data_url} download={`admission-${ticket.event.id}.png`} className={`${buttonClass} registration-button-full`}><Download aria-hidden="true" />Download QR</a>
      <p className="registration-caption">Save your QR before leaving this page. Bring your student ID for committee checking. No email will be sent.</p>
      {error && <p role="alert" className="registration-error">{error}</p>}
      <button className="registration-button registration-button-secondary registration-button-full" onClick={finish}>Finish / Clear ticket</button>
      <p className="registration-caption">Using a shared device? Download your QR, then clear this ticket. If you lose your copy, visit the assistance desk.</p>
    </div>
  </RegistrationLayout>;
  if (!event) return <RegistrationNotice title="Walk-in registration is closed" action={<button className={buttonClass} onClick={() => setRetry(value => value + 1)}>Check again</button>}><p>This event is not accepting new walk-ins.</p><p>Please visit the registration committee for assistance.</p></RegistrationNotice>;
  if (!privacyAccepted || privacyVisible) return <RegistrationLayout event={event}>
    <RegistrationPrivacyNotice key={eventId} eventName={event.name} onAgree={agreeToPrivacyNotice} onDecline={finish} error={error} />
  </RegistrationLayout>;
  const placeholders: Record<keyof WalkInDetails, string> = { full_name: "Your full name", email: "you@example.com", college: "e.g. CCIS", program: "e.g. BS Computer Science", year: "e.g. 3rd Year", section: "e.g. 3A" };
  return <RegistrationLayout event={event}>
    <RegistrationProgress step={session.stage === "form" ? 1 : 2} />
    <header className="registration-form-heading"><p className="registration-eyebrow">{session.stage === "form" ? "Let's get you registered" : "One last check"}</p><h1 ref={headingRef} tabIndex={-1}>{session.stage === "form" ? "Your details" : "Review your registration"}</h1><p>{session.stage === "form" ? "Enter your details as they appear in your student records. All fields are required." : "Make sure everything is correct before creating your admission QR."}</p></header>
    {error && <p role="alert" className="registration-error">{error}</p>}
    {session.stage === "form" ? <form onSubmit={review} className="registration-form">
      {[{ title: "Personal details", fields: walkInFields.slice(0, 2) }, { title: "Academic details", fields: walkInFields.slice(2) }].map(group => <fieldset key={group.title}><legend>{group.title}</legend><div className="registration-field-grid">{group.fields.map(field => <div key={field.key} className={`registration-field${field.key === "full_name" || field.key === "email" ? " registration-field-wide" : field.key === "college" || field.key === "program" ? " registration-field-wide-mobile" : ""}`}>
        <label htmlFor={`walk-in-${field.key}`}>{field.label}</label>
        <input id={`walk-in-${field.key}`} name={field.key} type={field.key === "email" ? "email" : "text"} autoComplete={field.key === "full_name" ? "name" : field.key === "email" ? "email" : "off"}
          required maxLength={field.maxLength} value={session.details[field.key]} placeholder={placeholders[field.key]} autoCapitalize={field.key === "email" ? "none" : "words"} spellCheck={false}
          onChange={e => save({ ...session, details: { ...session.details, [field.key]: e.target.value } })} />
      </div>)}</div></fieldset>)}
      <p className="registration-info"><Info aria-hidden="true" /><span>Your information is used for event registration and committee check-in. <button type="button" className="registration-privacy-link" onClick={() => setPrivacyVisible(true)}>View privacy notice</button></span></p>
      <button className={`${buttonClass} registration-button-full`} type="submit">Review registration <ArrowRight aria-hidden="true" /></button>
    </form> : <div className="registration-review">
      <dl>{walkInFields.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{session.details[field.key]}</dd></div>)}</dl>
      <p className="registration-info"><QrCode aria-hidden="true" />Submitting creates your QR. Attendance is recorded only when the committee scans it. No email will be sent.</p>
      <div className="registration-actions"><button className="registration-button registration-button-secondary" disabled={submitting} onClick={() => save({ ...session, stage: "form" })}>Edit details</button>
        <button className={buttonClass} disabled={submitting} onClick={submit}>{submitting ? <><Loader2 className="animate-spin" aria-hidden="true" />Creating your QR…</> : <>Submit and generate QR <ArrowRight aria-hidden="true" /></>}</button></div>
    </div>}
  </RegistrationLayout>;
}

export default function WalkInRegistration({ eventId }: { eventId?: string }) {
  return <div className="participant-registration">
    <header className="registration-masthead"><div className="registration-container"><div className="registration-brand"><span className="registration-brand-icon"><Ticket aria-hidden="true" /></span><div><p>University of Makati</p><span>Event registration</span></div></div><span className="registration-participant-label">Participant portal</span></div></header>
    <main className="registration-container registration-main">
      {eventId && <a href="/register" className="registration-back"><ArrowLeft aria-hidden="true" />All walk-in events</a>}
      {!eventId ? <OpenEvents /> : isEventId(eventId) ? <EventRegistration key={eventId} eventId={eventId} /> : <RegistrationNotice title="This link isn't valid"><p role="alert">This registration link is invalid. Choose an event from the walk-in events page.</p><a href="/register" className={buttonClass}>View available events <ArrowRight aria-hidden="true" /></a></RegistrationNotice>}
    </main>
    <footer className="registration-footer"><div className="registration-container"><p>University of Makati</p><span>Walk-in event registration</span></div></footer>
  </div>;
}

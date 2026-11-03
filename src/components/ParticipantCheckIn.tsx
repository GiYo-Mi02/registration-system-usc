import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Download, Loader2, ShieldCheck } from "lucide-react";
import type { PublicEvent } from "../lib/walk-in";
import { checkInTime, type CheckInReceipt, type RosterDetails, type RosterMatch } from "../lib/roster";
import { confirmParticipant, lookupParticipant, rosterRequest, RosterRequestError } from "../lib/roster-api";
import { saveCheckInReceipt } from "../lib/check-in-receipt";
import { REGISTRATION_PRIVACY_CONTACT_EMAIL } from "../lib/registration-privacy";

const message = (error: unknown) => error instanceof Error ? (error.name === "TimeoutError" ? "The connection timed out. Retry to recover the same check-in and receipt." : error.message) : "Could not connect. Please retry.";

export function ParticipantDetails({ participant }: { participant: RosterDetails }) {
  return <dl className="check-in-details">{([
    ["Full name", participant.full_name], ["School / university", participant.school],
    ["School ID", participant.school_id || "Not supplied — committee code used"], ["Program", participant.program],
    ["Year level", participant.year], ["COR", participant.cor || "Not supplied"], ["Coach", participant.coach_name]
  ]).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Not supplied"}</dd></div>)}</dl>;
}

export default function ParticipantCheckIn({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [schools, setSchools] = useState<string[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [school, setSchool] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [match, setMatch] = useState<RosterMatch | null>(null);
  const [receipt, setReceipt] = useState<CheckInReceipt | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const active = useRef(true), lock = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const storage = `participant-check-in-v1:${eventId}`;

  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { heading.current?.focus(); }, [match, receipt]);
  useEffect(() => {
    let current = true;
    setLoading(true); setError("");
    const load = async () => {
      // Preserve the proof before confirming so a lost response cannot create a new time-in.
      let cached;
      try { cached = JSON.parse(sessionStorage.getItem(storage) || "null"); } catch { /* Form can still load; storage is checked before confirmation. */ }
      if (cached?.receipt?.event?.id === eventId && typeof cached.receipt.reference === "string") {
        if (current) { setReceipt(cached.receipt); setEvent(cached.receipt.event); }
        return;
      }
      if (typeof cached?.pending === "string") {
        if (current) setPending(cached.pending);
        try {
          const result = await confirmParticipant(eventId, cached.pending);
          if (current) { setReceipt(result.receipt); setEvent(result.receipt.event); setPending(null); }
          try { sessionStorage.setItem(storage, JSON.stringify({ receipt: result.receipt })); } catch { /* Receipt remains visible for download. */ }
          return;
        } catch (error) {
          if (!(error instanceof RosterRequestError) || ![400, 404, 409].includes(error.status)) throw error;
          try { sessionStorage.removeItem(storage); } catch { /* A fresh lookup is still possible. */ }
          if (current) setPending(null);
        }
      }
      const data = await rosterRequest<{ event: PublicEvent; schools: string[] }>("schools", eventId);
      if (current) { setEvent(data.event); setSchools(data.schools); }
    };
    load().catch(error => { if (current) setError(message(error)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [eventId, storage, attempt]);

  const lookup = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current || !consent) return;
    lock.current = true; setBusy(true); setError("");
    try { const found = await lookupParticipant(eventId, schoolId, school); if (active.current) { setMatch(found); setConfirmed(false); } }
    catch (error) { if (active.current) setError(message(error)); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  const confirm = async () => {
    if (!match || !confirmed || lock.current) return;
    try { sessionStorage.setItem(storage, JSON.stringify({ pending: match.confirmation })); }
    catch { setError("Enable browser session storage before confirming, or visit the committee."); return; }
    lock.current = true; setBusy(true); setError(""); setPending(match.confirmation);
    try {
      const result = await confirmParticipant(eventId, match.confirmation);
      if (active.current) { setReceipt(result.receipt); setPending(null); }
      try { sessionStorage.setItem(storage, JSON.stringify({ receipt: result.receipt })); } catch { /* The receipt is already committed and remains downloadable. */ }
    } catch (error) {
      if (active.current) {
        setError(message(error));
        if (error instanceof RosterRequestError && [400, 404, 409].includes(error.status)) {
          try { sessionStorage.removeItem(storage); } catch { /* Keep the correction path available. */ }
          setPending(null); setMatch(null); setConfirmed(false);
        }
      }
    }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  const clear = () => {
    try { sessionStorage.removeItem(storage); } catch { setError("Close this tab before handing the device to another participant."); return; }
    window.location.assign("/register");
  };
  const download = async () => { setError(""); try { if (receipt) await saveCheckInReceipt(receipt); } catch (error) { setError(message(error)); } };

  return <section className="registration-panel check-in-panel">
    {loading ? <p role="status" className="registration-loading"><Loader2 className="animate-spin" />Preparing participant check-in…</p> : <>
      <header className="registration-form-heading"><p className="registration-eyebrow">{event?.name || "Participant check-in"}</p>
        <h1 ref={heading} tabIndex={-1}>{receipt ? "You're checked in." : match ? "Is this you?" : "Find your registration"}</h1>
        <p>{receipt ? "Save this receipt and show it to the working committees." : match ? "Review your information before recording your attendance." : "Already on the participant list? Enter your school ID or committee-issued code."}</p>
      </header>
      {error && <p role="alert" className="registration-error">{error}</p>}
      {receipt ? <div className="check-in-receipt">
        <CheckCircle2 className="registration-success-icon" aria-hidden="true" />
        <div className="check-in-time"><span>Confirmed time-in</span><strong>{checkInTime(receipt.checked_in_at)}</strong><span>Philippine time · Asia/Manila</span></div>
        <ParticipantDetails participant={receipt.participant} />
        <p className="check-in-reference">Receipt reference<br /><strong>{receipt.reference}</strong></p>
        <p className="registration-info">Your time-in is saved in the event records. Checking in again returns the original time.</p>
        <button className="registration-button registration-button-full" onClick={download}><Download aria-hidden="true" />Download attendance receipt</button>
        <p className="registration-caption">Keep the downloaded image. You can also take a screenshot of this receipt.</p>
        <button className="registration-button registration-button-secondary registration-button-full" onClick={clear}>Finish / Clear receipt</button>
      </div> : match ? <div>
        <ParticipantDetails participant={match.participant} />
        <label className="registration-consent-label check-in-agreement"><input type="checkbox" checked={confirmed} disabled={busy || !!pending} onChange={e => setConfirmed(e.target.checked)} /><span>These are my details and I am at the event venue, ready to check in.</span></label>
        <div className="registration-actions"><button className="registration-button registration-button-secondary" disabled={busy || !!pending} onClick={() => { setMatch(null); setError(""); }}>Use another ID</button>
          <button className="registration-button" disabled={busy || !confirmed} onClick={confirm}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}{pending ? "Retry / Recover receipt" : "Confirm my check-in"}</button></div>
        {pending && !busy && <p className="registration-caption">Your request may already be recorded. Retry to recover the same receipt. If your confirmation expires, reload and look up the same ID again.</p>}
      </div> : pending ? <div><button className="registration-button" onClick={() => setAttempt(v => v + 1)}>Retry / Recover receipt</button><button className="registration-button registration-button-secondary" onClick={() => { sessionStorage.removeItem(storage); setPending(null); setAttempt(v => v + 1); }}>Look up my ID again</button></div> : event ? <form className="registration-form" onSubmit={lookup}>
        <div className="registration-field"><label htmlFor="check-in-school-id">School ID or committee code</label><input id="check-in-school-id" autoComplete="off" spellCheck={false} maxLength={100} required value={schoolId} onChange={e => setSchoolId(e.target.value)} placeholder="Enter your school ID" /></div>
        <div className="registration-field"><label htmlFor="check-in-school">School / university <span>(optional)</span></label><select id="check-in-school" value={school} onChange={e => setSchool(e.target.value)}><option value="">Select if your ID needs a school match</option>{schools.map(name => <option key={name}>{name}</option>)}</select></div>
        <p className="registration-info"><ShieldCheck aria-hidden="true" /><span>Your school ID is used to find your supplied roster details. Only confirm your own attendance. Your details and check-in time are available to authorized event administrators for attendance and committee verification. For corrections or privacy questions, contact <a href={`mailto:${REGISTRATION_PRIVACY_CONTACT_EMAIL}`}>{REGISTRATION_PRIVACY_CONTACT_EMAIL}</a> or the committee.</span></p>
        <label className="registration-consent-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>I agree to use my roster information for this event's check-in and attendance receipt.</span></label>
        <button className="registration-button registration-button-full" disabled={busy || !consent}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}Find my details</button>
        <p className="registration-caption">No school ID listed? Ask the committee for your unique check-in code.</p>
      </form> : <button className="registration-button" onClick={() => setAttempt(v => v + 1)}>Try again</button>}
    </>}
  </section>;
}

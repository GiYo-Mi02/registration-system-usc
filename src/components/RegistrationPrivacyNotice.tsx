import { useState } from "react";
import { ArrowLeft, ArrowRight, CalendarClock, Check, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import { DATA_PRIVACY_ACT_URL, REGISTRATION_PRIVACY_CONTACT_EMAIL } from "../lib/registration-privacy";

interface RegistrationPrivacyNoticeProps {
  eventName: string;
  onAgree: () => void;
  onDecline: () => void;
  error: string;
}

export default function RegistrationPrivacyNotice({ eventName, onAgree, onDecline, error }: RegistrationPrivacyNoticeProps) {
  const [agreed, setAgreed] = useState(false);

  return <div className="registration-privacy">
    <div className="registration-privacy-icon"><ShieldCheck aria-hidden="true" /></div>
    <header className="registration-form-heading">
      <p className="registration-eyebrow">Before you register</p>
      <h1>Privacy notice &amp; consent</h1>
      <p>Please read how your information will be used for <strong>{eventName}</strong> before entering your details.</p>
    </header>
    <p className="registration-privacy-law"><FileText aria-hidden="true" /><span>Republic Act No. 10173<br /><a href={DATA_PRIVACY_ACT_URL} target="_blank" rel="noopener noreferrer">Data Privacy Act of 2012 <span className="registration-sr-only">(opens in a new tab)</span><ArrowRight aria-hidden="true" /></a></span></p>
    <div className="registration-privacy-sections">
      <section><h2><FileText aria-hidden="true" />Only for this event</h2><p>We collect your name, email, college, program, year, and section to register you for this event, issue your admission QR, and verify attendance when the committee scans it. These details will not be used for marketing or unrelated purposes. Registration does not automatically send an email.</p></section>
      <section><h2><LockKeyhole aria-hidden="true" />Confidentiality &amp; access</h2><p>Your registration information is treated as confidential. Access is restricted to authorized event staff and the service providers supporting this registration platform. Your details will not be sold, publicly posted, or shared for unrelated purposes. Access controls are used to protect against unauthorized access and disclosure.</p></section>
      <section className="registration-privacy-retention"><h2><CalendarClock aria-hidden="true" />Seven-day walk-in retention policy</h2><p>The event organizers' policy is to delete your walk-in registration details, saved admission QR, and attendance record from the registration system seven (7) days after the event. This policy covers walk-in registrations only. Copies of your QR that you download remain under your control.</p></section>
      <section><h2>Your choices &amp; privacy rights</h2><p>You may request access to or correction of your information, raise a privacy concern, or request withdrawal of consent or deletion, subject to applicable law. Privacy contact: <a className="registration-privacy-link" href={`mailto:${REGISTRATION_PRIVACY_CONTACT_EMAIL}`}>{REGISTRATION_PRIVACY_CONTACT_EMAIL}</a>. You may also visit the event registration committee at the venue's assistance desk or raise a complaint with the National Privacy Commission.</p><p>You may decline and return to the event list. If you prefer not to provide your information online, ask the registration committee about available assistance.</p></section>
    </div>
    {error && <p role="alert" className="registration-error">{error}</p>}
    <form className="registration-privacy-agreement" onSubmit={event => { event.preventDefault(); if (agreed) onAgree(); }}>
      <label className="registration-consent-label" htmlFor="registration-privacy-agreement">
        <input id="registration-privacy-agreement" type="checkbox" required checked={agreed} onChange={event => setAgreed(event.target.checked)} />
        <span>I have read this Privacy Notice and voluntarily consent to the collection and use of my information for this event's registration, admission QR, and attendance verification under the stated retention policy.</span>
      </label>
      <button type="submit" className="registration-button registration-button-full" disabled={!agreed}><Check aria-hidden="true" />I agree and continue <ArrowRight aria-hidden="true" /></button>
      <button type="button" className="registration-button registration-button-secondary registration-button-full" onClick={onDecline}><ArrowLeft aria-hidden="true" />Decline and return to events</button>
    </form>
  </div>;
}

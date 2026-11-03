import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import type { Event } from "../types";
import { checkInTime, parseRoster, usableSchoolId, type RosterDetails } from "../lib/roster";
import { rosterRequest, type RosterAdminData, type RosterSource } from "../lib/roster-api";
import { escapeCsvValue } from "../lib/csv";
import "./RosterAdmin.css";

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Request failed. Please retry.";
export default function RosterAdmin({ token, event }: { token: string; event: Event }) {
  const [data, setData] = useState<RosterAdminData | null>(null);
  const [preview, setPreview] = useState<RosterDetails[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [updated, setUpdated] = useState("");
  const [text, setText] = useState("");
  const active = useRef(true), request = useRef(0), lock = useRef(false);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    try {
      const result = await rosterRequest<RosterAdminData>("admin", event.id, undefined, token);
      if (active.current && id === request.current) { setData(result); setUpdated(new Date().toISOString()); setError(""); }
    } catch (error) { if (active.current && id === request.current) setError(errorMessage(error)); }
  }, [event.id, token]);
  useEffect(() => {
    active.current = true;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !lock.current) void refresh(); }, 15000);
    return () => { active.current = false; request.current++; window.clearInterval(timer); };
  }, [refresh]);
  const perform = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch (error) { if (active.current) setError(errorMessage(error)); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  };
  const loadSource = () => perform(async () => {
    const source = await rosterRequest<RosterSource>("source", undefined, undefined, token);
    if (event.name.trim().toUpperCase() !== source.eventName) throw new Error(`Select the ${source.eventName} event before loading this supplied list.`);
    setPreview(source.participants);
  });
  const importPreview = () => perform(async () => {
    const result = await rosterRequest<{ inserted: number }>("import", event.id, { participants: preview }, token);
    setPreview([]); setNotice(`${result.inserted} participants added. Existing records and time-ins were preserved.`); await refresh();
  });
  const availability = () => perform(async () => {
    await rosterRequest("availability", event.id, { open: !data?.open }, token); await refresh();
  });
  const exportRows = (codes: boolean) => {
    if (!data) return;
    const rows = codes ? [
      ["Name", "School", "Committee check-in code"], ...data.entries.filter(row => row.check_in_code).map(row => [row.full_name, row.school, row.check_in_code!])
    ] : [
      ["Name", "School", "School ID", "Program", "Year", "Time in (Asia/Manila)", "Time in (UTC)", "Receipt reference"],
      ...data.receipts.map(row => [row.participant.full_name, row.participant.school, row.participant.school_id, row.participant.program, row.participant.year, checkInTime(row.checked_in_at), row.checked_in_at, row.reference])
    ];
    const blob = new Blob(["\uFEFF", rows.map(row => row.map(cell => `"${escapeCsvValue(cell)}"`).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = `${codes ? "committee-codes" : "participant-time-ins"}-${event.id}.csv`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  const query = search.trim().toLowerCase();
  const checks = data?.receipts.filter(row => [row.participant.full_name, row.participant.school, row.participant.school_id, row.reference].some(value => value.toLowerCase().includes(query))) || [];
  const codeEntries = data?.entries.filter(row => row.check_in_code) || [];

  return <section className="roster-admin">
    <header className="roster-heading"><div><p>Participant attendance</p><h1>Participant time-ins</h1><span>{event.name}</span></div><button onClick={() => void refresh()} disabled={busy}><RefreshCw size={16} />Refresh</button></header>
    {error && <p role="alert" className="roster-error">{error}</p>}
    {notice && <p role="status" className="roster-notice">{notice}</p>}
    <div className="roster-summary"><div><strong>{data?.receipts.length ?? "—"}</strong><span>Confirmed time-ins</span></div><div><strong>{data?.open ? "Open" : "Closed"}</strong><span>Participant check-in</span></div><div><strong>{data?.entries.length ?? "—"}</strong><span>Participants on roster</span></div></div>
    <p className="roster-caption">Time-ins appear automatically after participant confirmation. Times use Asia/Manila. {updated && `Last synced ${checkInTime(updated)}. Updates every 15 seconds.`}</p>
    <div className="roster-tools"><label>Search time-ins<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, school, ID or receipt reference" /></label><button disabled={!data?.receipts.length} onClick={() => exportRows(false)}><Download size={16} />Export time-ins</button></div>
    <div className="roster-table-wrap"><table><caption>Confirmed participant check-ins only</caption><thead><tr><th>Participant</th><th>School / university</th><th>School ID</th><th>Time in · Philippine time</th><th>Receipt reference</th></tr></thead><tbody>
      {checks.map(row => <tr key={row.reference}><td><strong>{row.participant.full_name}</strong><small>{row.participant.program} · {row.participant.year}</small></td><td>{row.participant.school}</td><td>{row.participant.school_id || "Committee code"}</td><td>{checkInTime(row.checked_in_at)}</td><td className="roster-ref">{row.reference}</td></tr>)}
      {!checks.length && <tr><td colSpan={5}>{!data ? "Loading time-ins…" : query ? "No time-ins match this search." : "No participants have checked in yet."}</td></tr>}
    </tbody></table></div>
    <details className="roster-setup"><summary>Roster setup &amp; committee codes</summary>
      <p>Import participants for this event, then open check-in when participants may record their attendance.</p>
      <div className="roster-tools"><a href={`/register/${event.id}?checkin=1`} target="_blank" rel="noopener noreferrer">Open participant check-in page ↗</a><button disabled={!data || busy || (!data.open && !data.entries.length)} onClick={availability}>{data?.open ? "Close participant check-in" : "Open participant check-in"}</button></div>
      <button disabled={busy} onClick={loadSource}>Review supplied IT SKILLS OLYMPICS list (100 participants)</button>
      <label className="roster-upload">Or upload a spreadsheet export (CSV / TSV)<input type="file" accept=".csv,.tsv,.txt" disabled={busy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void perform(async () => { if (file.size > 900000) throw new Error("The roster file must be under 900 KB."); setPreview(parseRoster(await file.text())); }); }} /></label>
      <label>Or paste the roster<textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Paste the original spreadsheet rows, including headers, or a CSV with full_name,school,program,year,school_id,cor,coach_name." /></label>
      <button disabled={busy || !text.trim()} onClick={() => { try { setPreview(parseRoster(text)); setError(""); } catch (error) { setError(errorMessage(error)); } }}>Review pasted roster</button>
      {preview.length > 0 && <div className="roster-preview"><h2>Review {preview.length} participants · {new Set(preview.map(row => row.school)).size} schools</h2><p>{preview.filter(row => !usableSchoolId(row.school_id)).length} participants need unique committee codes. Codes are created on import. Re-importing preserves existing codes and check-ins.</p>
        <div className="roster-table-wrap"><table><thead><tr><th>Name</th><th>School</th><th>Program / year</th><th>School ID</th><th>COR</th><th>Coach</th></tr></thead><tbody>{preview.map((row, index) => <tr key={index}><td>{row.full_name}</td><td>{row.school}</td><td>{row.program} · {row.year}</td><td>{row.school_id || "Missing"}</td><td>{row.cor || "Not supplied"}</td><td>{row.coach_name}</td></tr>)}</tbody></table></div>
        <div className="roster-tools"><button disabled={busy} onClick={importPreview}>{busy ? "Importing…" : `Import into ${event.name}`}</button><button disabled={busy} onClick={() => setPreview([])}>Cancel preview</button></div>
      </div>}
      {codeEntries.length > 0 && <div><h2>Committee-issued codes</h2><p>Give each code privately to its participant after checking their identity.</p><button onClick={() => exportRows(true)}><Download size={16} />Download committee code list</button><div className="roster-table-wrap"><table><thead><tr><th>Name</th><th>School</th><th>Unique check-in code</th></tr></thead><tbody>{codeEntries.map(row => <tr key={row.id}><td>{row.full_name}</td><td>{row.school}</td><td><strong>{row.check_in_code}</strong></td></tr>)}</tbody></table></div></div>}
    </details>
  </section>;
}

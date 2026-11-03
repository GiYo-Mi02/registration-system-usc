import { checkInTime, type CheckInReceipt } from "./roster";

/** A self-contained PNG that participants can keep in their phone's downloads. */
export async function saveCheckInReceipt(receipt: CheckInReceipt) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image download is unavailable. Save a screenshot of your receipt.");
  const width = 1000, margin = 72, content = width - margin * 2;
  const lines: Array<{ text: string; size: number; color: string }> = [];
  const add = (text: string, size = 25, color = "#183c2d") => {
    ctx.font = `${size}px sans-serif`;
    let current = "";
    for (const word of text.split(/\s+/)) {
      // Break an unusually long identifier as well as ordinary word boundaries.
      for (const part of word.match(/.{1,40}/g) || [""]) {
        const next = current ? `${current} ${part}` : part;
        if (current && ctx.measureText(next).width > content) { lines.push({ text: current, size, color }); current = part; }
        else current = next;
      }
    }
    lines.push({ text: current, size, color });
  };
  add("UNIVERSITY OF MAKATI", 22, "#57675d");
  add("ATTENDANCE RECEIPT", 40);
  add(receipt.event.name, 30);
  add(" ");
  add("CONFIRMED CHECK-IN", 22, "#247b55");
  add(checkInTime(receipt.checked_in_at), 32);
  add("Philippine time (Asia/Manila)", 22, "#57675d");
  add(" ");
  add(receipt.participant.full_name, 34);
  add(receipt.participant.school);
  add(`School ID: ${receipt.participant.school_id || "Committee-issued code"}`);
  add(`${receipt.participant.program} · ${receipt.participant.year}`);
  add(`Venue: ${receipt.event.venue || "See event details"}`);
  add(" ");
  add("Receipt reference", 22, "#57675d");
  add(receipt.reference, 24);
  add(" ");
  add("Keep this receipt and show it to the working committees.", 23);
  add("The official check-in time is recorded in the event administrator's ledger.", 21, "#57675d");
  canvas.width = width; canvas.height = margin * 2 + lines.reduce((sum, line) => sum + line.size * 1.6, 0);
  ctx.fillStyle = "#fffef9"; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = "#ffcc00"; ctx.fillRect(0, 0, width, 14);
  let y = margin;
  for (const line of lines) { ctx.font = `${line.size}px sans-serif`; ctx.fillStyle = line.color; y += line.size * 1.3; ctx.fillText(line.text, margin, y); y += line.size * .3; }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not save receipt. Please take a screenshot.")), "image/png"));
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `check-in-${receipt.reference}.png`; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

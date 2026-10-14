import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { generateEmailTemplate } from "../server/ticket-template";

// Inert preview text, not the reference QR or a URL.
const qr = await QRCode.toDataURL("DESIGN PREVIEW ONLY - NOT VALID FOR ADMISSION", {
  width: 448, margin: 4, errorCorrectionLevel: "M",
  color: { dark: "#000000", light: "#FFFFFF" }
});
const html = generateEmailTemplate(
  "Alex Morgan", "College of Computing and Information Sciences", "Cybersecurity Summit",
  "Sample date · 1:00 PM – 5:00 PM", "Sample venue · University of Makati", qr,
  "Design preview only — this is not a valid admission ticket.\nFor your actual event, the date, venue and arrival instructions come from the event settings.",
  "BS Computer Science", "3rd Year", "CS-301"
);
const outputDirectory = path.resolve("previews");
fs.mkdirSync(outputDirectory, { recursive: true });
const output = path.join(outputDirectory, "cyber-ticket.html");
fs.writeFileSync(output, html.replace(/[ \t]+$/gm, ""), "utf8");
console.log(`Ticket preview saved: ${output}`);

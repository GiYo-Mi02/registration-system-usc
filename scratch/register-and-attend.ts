import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import QRCode from "qrcode";
import dotenv from "dotenv";
dotenv.config();

import { generateEmailTemplate } from "../server/helpers";

const QR_SECRET = process.env.QR_SECRET || "default_dev_secret_key_change_me_in_production";
const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const EVENT_ID = "d9c4baec-c749-4e67-8685-780b4ff48690"; // FRESHMEN ORIENTATION 2026 DAY 2

const rawData = [
  { last_name: "BALDOMERO", college: "TRM", email: "danielleeirol.baldomero13@gmail.com" },
  { last_name: "SANTOS", college: "TRM", email: "santoskashmira@gmail.com" },
  { last_name: "MANUEL", college: "SPT", email: "ivannnakeshalyn07@gmail.com" },
  { last_name: "MATIBAG", college: "SPT", email: "miamatibag29@gmail.com" },
  { last_name: "TADEO", college: "MUSIC", email: "chasemaverick.tadeo16@gmail.com" },
  { last_name: "ANDRADE", college: "MUSIC", email: "aandrade.8517@umak.edu.ph" },
  { last_name: "MELENDRES", college: "SPT", email: "Iiannejarrethmelendres@gmail.com" },
  { last_name: "ONOBRE", college: "HRS", email: "onobrejenwenn@gmail.com" },
  { last_name: "DE TORES", college: "ICT", email: "shanellelorrainep@gmail.com" },
  { last_name: "BEDAN", college: "ICT", email: "sheerahbedan@gmail.com" },
  { last_name: "DEVINA", college: "ICT", email: "chrisjhonrexmdivi@gmail.com" },
  { last_name: "RAMOS", college: "ICT", email: "sophiaannedramos@gmail.com" },
  { last_name: "DELOS RESYES", college: "ASSH", email: "kielfrancisd@gmail.com" },
  { last_name: "DELO SARIO", college: "ASSH", email: "delrosariogan1@gmail.com" },
  { last_name: "GUBOT", college: "ASSH", email: "lorraine.napolesggg@gmail.com" },
  { last_name: "RIVERA", college: "ASSH", email: "alenrivera2@gmail.com" },
  { last_name: "CRISTOBAL", college: "ASSH", email: "zabdielcritobal13@gmail.com" },
  { last_name: "OROBERO", college: "ASSH", email: "siriusly.star9000@gmail.com" },
  { last_name: "ENCONADO", college: "BEEM", email: "enconadojohaira@gmail.com" },
  { last_name: "TING", college: "HRS", email: "kodigabrielting00@gmail.com" },
  { last_name: "BALDEO", college: "STM-DA", email: "angelicabaldeo10@gmail.com" },
  { last_name: "PANALIGAN", college: "STM-DA", email: "markjacobpanaligan@gmail.com" },
  { last_name: "SALVANIA", college: "STM-DA", email: "ceejaysalvania@gmail.com" },
  { last_name: "VICENTE", college: "STM-HCP", email: "vicentejovelle25@gmail.com" },
  { last_name: "DULLETE", college: "STM-DA", email: "jellianedullete12@gmail.com" },
  { last_name: "PERALTA", college: "STM-DA", email: "gabjperalta@gmail.com" },
  { last_name: "ARQUILLO", college: "STM", email: "jaysonarquillo362@gmail.com" },
  { last_name: "ISIDRO", college: "STM-DA", email: "ashley.isidro.wahh@gmail.com" },
  { last_name: "REDITO", college: "STM", email: "ronredito@gmail.com" },
  { last_name: "DAOANG", college: "STM-HCP", email: "carynnedaoang.alt@gmail.com" }, // Corrected invalid email
  { last_name: "MANGONON", college: "STM", email: "jonsantinomangonon@gmail.com" },
  { last_name: "INTAL", college: "SPT", email: "jennalynintal9@gmail.com" },
  { last_name: "MORALES", college: "TRM", email: "marielanne2410@gmail.com" },
  { last_name: "DOMINGO", college: "ASSH", email: "domingoangeladwayne@gmail.com" },
  { last_name: "SALONGA", college: "SPT", email: "janrebmarvy@gmail.com" }
];

async function main() {
  console.log("Fetching event information from Supabase...");
  const { data: eventInfo, error: eventErr } = await supabase
    .from("events")
    .select("*")
    .eq("id", EVENT_ID)
    .single();
  
  if (eventErr || !eventInfo) {
    console.error("Failed to retrieve event metadata:", eventErr);
    return;
  }

  console.log(`Successfully loaded event: ${eventInfo.name}`);

  let newlyCreated = 0;
  let updatedExisting = 0;
  let alreadyAttended = 0;

  for (const item of rawData) {
    const email = item.email.trim();
    const college = item.college.trim();
    const lastName = item.last_name.trim();

    // Check if student exists in the database
    const { data: existingStudent, error: findErr } = await supabase
      .from("students")
      .select("id, full_name, email, college, event_id")
      .eq("event_id", EVENT_ID)
      .eq("email", email)
      .maybeSingle();

    if (findErr) {
      console.error(`Error querying database for ${email}:`, findErr);
      continue;
    }

    if (existingStudent) {
      // 1. Student already exists. Let's update their college to matching code
      const { error: updErr } = await supabase
        .from("students")
        .update({ college })
        .eq("id", existingStudent.id);

      if (updErr) {
        console.error(`Error updating college for student ID ${existingStudent.id}:`, updErr);
      }

      // Check their attendance record
      const { data: attendance, error: attErr } = await supabase
        .from("attendance")
        .select("scanned_at, scanned_by")
        .eq("student_id", existingStudent.id)
        .maybeSingle();
      
      if (attErr) {
        console.error(`Error retrieving attendance for student ID ${existingStudent.id}:`, attErr);
        continue;
      }

      if (attendance && attendance.scanned_at) {
        // Already checked in, retain original check-in timestamp
        console.log(`Student ${lastName} (${email}) already attended on ${attendance.scanned_at} (Scanned by: ${attendance.scanned_by}).`);
        alreadyAttended++;
      } else {
        // Attendance record exists but not scanned, or doesn't exist
        const now = new Date().toISOString();
        if (attendance) {
          const { error: attUpdErr } = await supabase
            .from("attendance")
            .update({ scanned_at: now, scanned_by: "admin-id" })
            .eq("student_id", existingStudent.id);
          
          if (attUpdErr) {
            console.error(`Error checking in student ID ${existingStudent.id}:`, attUpdErr);
          } else {
            console.log(`Checked in existing student: ${lastName} (${email})`);
            updatedExisting++;
          }
        } else {
          const { error: attInsErr } = await supabase
            .from("attendance")
            .insert({
              student_id: existingStudent.id,
              event_id: EVENT_ID,
              scanned_at: now,
              scanned_by: "admin-id"
            });
          
          if (attInsErr) {
            console.error(`Error creating checked-in attendance for student ID ${existingStudent.id}:`, attInsErr);
          } else {
            console.log(`Created attendance and checked in existing student: ${lastName} (${email})`);
            updatedExisting++;
          }
        }
      }
    } else {
      // 2. Student does not exist. We need to create the complete flow
      const formResponseId = `manual_bulk_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
      
      const { data: newStudent, error: insErr } = await supabase
        .from("students")
        .insert({
          event_id: EVENT_ID,
          full_name: lastName, // Use provided last name as name since full name is not in prompt
          email,
          college,
          form_response_id: formResponseId,
          email_status: "failed",
          email_error: "queued"
        })
        .select("id")
        .single();
      
      if (insErr || !newStudent) {
        console.error(`Failed to insert student record for ${lastName} (${email}):`, insErr);
        continue;
      }

      // Generate QR Token
      const nonce = crypto.randomBytes(8).toString("hex");
      const payload = `${newStudent.id}:${EVENT_ID}:${nonce}`;
      const hmac = crypto.createHmac("sha256", QR_SECRET).update(payload).digest("hex");
      const signedToken = `${payload}:${hmac}`;

      const { error: tokenErr } = await supabase
        .from("qr_tokens")
        .insert({
          student_id: newStudent.id,
          event_id: EVENT_ID,
          token: signedToken
        });

      if (tokenErr) {
        console.error(`Failed to insert QR token for student ID ${newStudent.id}:`, tokenErr);
      }

      // Create attendance entry immediately checked in
      const now = new Date().toISOString();
      const { error: attErr } = await supabase
        .from("attendance")
        .insert({
          student_id: newStudent.id,
          event_id: EVENT_ID,
          scanned_at: now,
          scanned_by: "admin-id"
        });

      if (attErr) {
        console.error(`Failed to insert attendance check-in for student ID ${newStudent.id}:`, attErr);
      }

      // Generate email log for ticket generation consistency
      try {
        const qrDataUrl = await QRCode.toDataURL(signedToken, { margin: 1, scale: 6 });
        const emailHtml = generateEmailTemplate(lastName, college, eventInfo.name, eventInfo.event_date, eventInfo.venue, qrDataUrl, eventInfo.description || "");

        const { error: logErr } = await supabase
          .from("email_log")
          .insert({
            student_id: newStudent.id,
            status: "failed",
            error_message: "queued",
            email_html: emailHtml,
            qr_data_url: qrDataUrl
          });

        if (logErr) {
          console.error(`Failed to write email log for student ID ${newStudent.id}:`, logErr);
        }
      } catch (qrErr) {
        console.error(`Failed to generate QR or email template for ${email}:`, qrErr);
      }

      console.log(`Registered and checked in new student: ${lastName} (${email})`);
      newlyCreated++;
    }
  }

  console.log("\nExecution completed successfully:");
  console.log(`- Newly registered and checked in: ${newlyCreated}`);
  console.log(`- Already registered & now marked as attended: ${updatedExisting}`);
  console.log(`- Already checked in previously (retained): ${alreadyAttended}`);
}

main().catch(err => {
  console.error("Unhandle exception in registration runner:", err);
});

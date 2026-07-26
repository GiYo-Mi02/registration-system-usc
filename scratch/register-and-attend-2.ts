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
  { last_name: "ARENAS", college: "TRM", email: "iainenikkisha009@gmail.com" },
  { last_name: "POLIDARIO", college: "ASSH", email: "FRAN.POLIDARIO033@gmail.com" },
  { last_name: "SAGUN", college: "SPT", email: "argel022010@gmail.com" },
  { last_name: "CAPADNGAN", college: "SPT", email: "doncapadngan@gmail.com" },
  { last_name: "MARTINEZ", college: "SPT", email: "rogeliomartinez1308@gmail.com" },
  { last_name: "NABAL", college: "SPT", email: "naval.joseph25@gmail.com" },
  { last_name: "REDITO", college: "MSC", email: "reditoemikai@gmail.com" },
  { last_name: "ABOONALES", college: "SPT", email: "charlesdavidabonales@gmail.com" },
  { last_name: "MAPUANG", college: "HRS", email: "ellavalderama71610@gmail.com" },
  { last_name: "ALPARO", college: "ICT", email: "alexanderalparo@gmail.com" },
  { last_name: "TAC-AN", college: "ICT", email: "mathewtacan@gmail.com" },
  { last_name: "MENDOZA", college: "ICT", email: "zmm222010@gmail.com" },
  { last_name: "SAMBRANO", college: "ASSH TPP", email: "amirsambrano@gmail.com" },
  { last_name: "GALLARDO", college: "ASSH", email: "gallardojosharrylaine@gmail.com" },
  { last_name: "RAMIL", college: "ASSH", email: "ramiljahzeizhdanielle@gmail.com" },
  { last_name: "BALANA", college: "ASSH", email: "balanayunah15@gmail.com" },
  { last_name: "DEL CASTILLO", college: "BEAM", email: "delcastilloveall6@gmail.com" },
  { last_name: "LIMA", college: "ASSH", email: "itsmerhyshel@gmail.com" },
  { last_name: "ARCEO", college: "BEAM", email: "arceoezekiel11@gmail.com" },
  { last_name: "PANGILINAN", college: "BEAM", email: "pangilinanjohnlambert9@gmail.com" },
  { last_name: "ACENAS", college: "STEM", email: "wayneronjiel@gmail.com" },
  { last_name: "CAUAN", college: "STEM - HCP", email: "jaylalauricecauan@gmail.com" },
  { last_name: "MEDRANO", college: "STEM", email: "marcianmedrano20@gmail.com" },
  { last_name: "MAYORDO", college: "STEM - DA", email: "mayordoraizen0@gmail.com" },
  { last_name: "BESANA", college: "STEM - HCP", email: "beshebesana@gmail.com" },
  { last_name: "BAGOTAO", college: "STEM - HCP", email: "stellamarieannebagotao@gmail.com" },
  { last_name: "ELICANO", college: "STEM", email: "raizhaelicano262@gmail.com" },
  { last_name: "MENDOZA", college: "STEM", email: "calebhsu20262027@gmail.com" },
  { last_name: "FERNANDEZ", college: "STEM - HCP", email: "jacqueline.fernandez2702@gmail.com" },
  { last_name: "POCSON", college: "STEM - HCP", email: "edlaurencepocson@gmail.com" },
  { last_name: "ATTONAGA", college: "SPT", email: "adajarleanilda40@gmail.com" },
  { last_name: "ARIOLA", college: "SPT", email: "ariolazahreenamae@gmail.com" }
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
      const formResponseId = `manual_bulk_2_${crypto.randomBytes(4).toString("hex")}_${Date.now()}`;
      
      const { data: newStudent, error: insErr } = await supabase
        .from("students")
        .insert({
          event_id: EVENT_ID,
          full_name: lastName, // Use provided last name as name since full name is not in image
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

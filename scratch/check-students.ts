import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const pastedEmails = [
  "kristelrcuizon@gmail.com",
  "yanna.pamintuan@gmail.com",
  "janellavillanueva0108@gmail.com",
  "deguzmanprince17@gmail.com",
  "faithmuralla@gmail.com",
  "sabareschelsea31@gmail.com",
  "jessdelacruz09678@gmail.com",
  "dariellejohannsordiales2008@gmail.com",
  "vhreodica.2615@gmail.com",
  "julianmatthewsevilla@gmail.com",
  "rhiandela3@gmail.com",
  "kurttee07@gmail.com",
  "rykerdylandejesus@gmail.com",
  "johnlaurenmiranda29@gmail.com",
  "vincentdelacruza26@gmail.com",
  "edelacruz.4831@umak.edu.ph",
  "danielgabuya28@gmail.com",
  "tenoriokurt260@gmail.com",
  "ederlyndoria55@gmail.com",
  "theavargas12@gmail.com",
  "prncegnaltuna@gmail.com",
  "danallysonkhayesablad07@gmail.com",
  "georgejirocalina@gmail.com",
  "jmalinao.4428@umak.edu.ph",
  "josephjc213@gmail.com",
  "atienzawesly94@gmail.com",
  "ysabellacapilitan03@gmail.com",
  "clzipac12@gmail.com",
  "glibunao.6139@umak.edu.ph",
  "peraltakharyl@gmail.com",
  "sandercubilla86@gmail.com",
  "arielleabinion08@gmail.com",
  "tstevhenpaul@gmail.com",
  "natasiasalazar002@gmail.com",
  "alcylendres.ab@gmail.com",
  "sarmientoizy201@gmail.com",
  "jazziemaevinculado0305@gmail.com",
  "eunicenicolecaindoy87@gmail.com",
  "joshmarcoguerrero@gmail.com",
  "saccdylan@gmail.com",
  "paraojayevincent@gmail.com",
  "amandocheztersalvacion@gmail.com",
  "hazelbelisario1408@gmail.com",
  "rhiztinejoysantiago9@gmail.com",
  "elim.2773@umak.edu.ph",
  "maryrosehabana010@gmail.com",
  "salientesjaque122006@gmail.com",
  "zpenoliar.5310@umak.edu.ph"
];

async function check() {
  const { data: students } = await supabase
    .from("students")
    .select("id, email, event_id")
    .in("email", pastedEmails);

  if (students && students.length > 0) {
    const studentIds = students.map(s => s.id);
    
    // Update students table
    const { error: updErr } = await supabase
      .from("students")
      .update({ email_status: "failed", email_error: null })
      .in("id", studentIds);

    // Update email logs
    const { error: logErr } = await supabase
      .from("email_log")
      .update({ status: "failed", error_message: "queued" })
      .in("student_id", studentIds);

    console.log(`Successfully reset email status for ${studentIds.length} students in DB.`);
  } else {
    console.log("No matching students found to reset.");
  }
}

check();

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const rawData = [
  { full_name: "BALDOMERO", college: "TRM", email: "danielleeirol.baldomero13@gmail.com" },
  { full_name: "SANTOS", college: "TRM", email: "santoskashmira@gmail.com" },
  { full_name: "MANUEL", college: "SPT", email: "ivannnakeshalyn07@gmail.com" },
  { full_name: "MATIBAG", college: "SPT", email: "miamatibag29@gmail.com" },
  { full_name: "TADEO", college: "MUSIC", email: "chasemaverick.tadeo16@gmail.com" },
  { full_name: "ANDRADE", college: "MUSIC", email: "aandrade.8517@umak.edu.ph" },
  { full_name: "MELENDRES", college: "SPT", email: "Iiannejarrethmelendres@gmail.com" },
  { full_name: "ONOBRE", college: "HRS", email: "onobrejenwenn@gmail.com" },
  { full_name: "DE TORES", college: "ICT", email: "shanellelorrainep@gmail.com" },
  { full_name: "BEDAN", college: "ICT", email: "sheerahbedan@gmail.com" },
  { full_name: "DEVINA", college: "ICT", email: "chrisjhonrexmdivi@gmail.com" },
  { full_name: "RAMOS", college: "ICT", email: "sophiaannedramos@gmail.com" },
  { full_name: "DELOS RESYES", college: "ASSH", email: "kielfrancisd@gmail.com" },
  { full_name: "DELO SARIO", college: "ASSH", email: "delrosariogan1@gmail.com" },
  { full_name: "GUBOT", college: "ASSH", email: "lorraine.napolesggg@gmail.com" },
  { full_name: "RIVERA", college: "ASSH", email: "alenrivera2@gmail.com" },
  { full_name: "CRISTOBAL", college: "ASSH", email: "zabdielcritobal13@gmail.com" },
  { full_name: "OROBERO", college: "ASSH", email: "siriusly.star9000@gmail.com" },
  { full_name: "ENCONADO", college: "BEEM", email: "enconadojohaira@gmail.com" },
  { full_name: "TING", college: "HRS", email: "kodigabrielting00@gmail.com" },
  { full_name: "BALDEO", college: "STM-DA", email: "angelicabaldeo10@gmail.com" },
  { full_name: "PANALIGAN", college: "STM-DA", email: "markjacobpanaligan@gmail.com" },
  { full_name: "SALVANIA", college: "STM-DA", email: "ceejaysalvania@gmail.com" },
  { full_name: "VICENTE", college: "STM-HCP", email: "vicentejovelle25@gmail.com" },
  { full_name: "DULLETE", college: "STM-DA", email: "jellianedullete12@gmail.com" },
  { full_name: "PERALTA", college: "STM-DA", email: "gabjperalta@gmail.com" },
  { full_name: "ARQUILLO", college: "STM", email: "jaysonarquillo362@gmail.com" },
  { full_name: "ISIDRO", college: "STM-DA", email: "ashley.isidro.wahh@gmail.com" },
  { full_name: "REDITO", college: "STM", email: "ronredito@gmail.com" },
  { full_name: "DAOANG", college: "STM-HCP", email: "carynnedaoang.alt@" },
  { full_name: "MANGONON", college: "STM", email: "jonsantinomangonon@gmail.com" },
  { full_name: "INTAL", college: "SPT", email: "jennalynintal9@gmail.com" },
  { full_name: "MORALES", college: "TRM", email: "marielanne2410@gmail.com" },
  { full_name: "DOMINGO", college: "ASSH", email: "domingoangeladwayne@gmail.com" },
  { full_name: "SALONGA", college: "SPT", email: "janrebmarvy@gmail.com" }
];

async function main() {
  const emails = rawData.map(d => d.email.trim());
  const { data: students, error } = await supabase
    .from("students")
    .select(`
      id,
      full_name,
      email,
      college,
      event_id,
      events (
        name
      ),
      attendance (
        scanned_at,
        scanned_by
      )
    `)
    .in("email", emails);
  
  if (error) {
    console.error("Error query:", error);
    return;
  }
  
  console.log(`Found ${students?.length} matching student(s) in DB:`);
  console.log(JSON.stringify(students, null, 2));
}

main();

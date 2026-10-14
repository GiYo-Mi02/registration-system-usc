/** Email-safe ticket markup shared by ticket generation and administrator previews. */
function escape(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character] || character));
}

export function generateEmailTemplate(
  fullName: string,
  college: string,
  eventName: string,
  eventDate: string,
  eventVenue: string,
  qrDataUrl: string,
  description: string,
  program = "",
  year = "",
  section = ""
): string {
  const name = escape(fullName);
  const event = escape(eventName);
  const date = escape(eventDate);
  const venue = escape(eventVenue);
  const notice = escape(description).replace(/\r?\n/g, "<br />")
    || "Keep your ticket ready and follow the registration team's instructions on arrival.";
  const detail = (label: string, value: string) => `
    <tr>
      <td class="detail-label" width="108" valign="top" style="width:108px; padding:10px 12px 10px 0; border-top:1px solid #1D344C; color:#91BED0; font-family:'Courier New',monospace; font-size:10px; line-height:18px; letter-spacing:1px; text-transform:uppercase;">${label}</td>
      <td valign="top" style="padding:10px 0; border-top:1px solid #1D344C; color:#E8F3FA; font-size:13px; line-height:18px; font-weight:600; overflow-wrap:anywhere; word-break:break-word;">${escape(value || "Not provided")}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your admission pass · ${event}</title>
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { width:100% !important; }
      .outer-pad { padding:16px 8px !important; }
      .ticket-pad { padding-left:22px !important; padding-right:22px !important; }
      .event-title { font-size:28px !important; line-height:33px !important; letter-spacing:0 !important; }
      .attendee-name { font-size:23px !important; line-height:29px !important; }
      .detail-label { width:86px !important; font-size:9px !important; }
      .qr-frame { width:240px !important; }
      .qr-image { width:196px !important; height:196px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#030817; font-family:Arial,Helvetica,sans-serif; -webkit-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; mso-hide:all;">${name}, your admission pass for ${event}. Present your QR at the registration gate.</div>
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#030817" style="width:100%; background-color:#030817;">
    <tr>
      <td class="outer-pad" align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" border="0" cellspacing="0" cellpadding="0" class="email-shell" bgcolor="#071226" style="width:100%; max-width:600px; background-color:#071226; border:1px solid #294C68; border-radius:18px;">
          <tr>
            <td class="ticket-pad" style="padding:24px 32px 18px; border-bottom:1px solid #294C68;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td valign="middle" style="color:#B4E5ED; font-family:'Courier New',monospace; font-size:10px; line-height:16px; letter-spacing:1.8px; font-weight:700;">UMAK / EVENT ADMISSION</td>
                  <td align="right" valign="middle" style="color:#81B8C9; font-family:'Courier New',monospace; font-size:10px; line-height:16px; letter-spacing:1px;">[ ADMIT ONE ]</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="ticket-pad" style="padding:29px 32px 26px; background-color:#091831; background-image:linear-gradient(135deg,#071226 0%,#0D2741 100%);">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr><td style="padding-bottom:16px; color:#75D6E6; font-family:'Courier New',monospace; font-size:10px; line-height:16px; letter-spacing:2.6px; text-transform:uppercase;">// Your digital entry pass</td></tr>
                <tr><td class="event-title" style="color:#B6E7F0; font-family:Arial,Helvetica,sans-serif; font-size:36px; line-height:41px; font-weight:900; letter-spacing:-0.8px; text-transform:uppercase; overflow-wrap:anywhere; word-break:break-word; text-shadow:0 2px 0 #47778F;">${event}</td></tr>
                <tr><td style="padding-top:17px;"><table role="presentation" width="84" border="0" cellspacing="0" cellpadding="0"><tr><td height="3" bgcolor="#77DDEB" style="height:3px; background-color:#77DDEB; font-size:0; line-height:0;">&nbsp;</td></tr></table></td></tr>
                <tr><td style="padding-top:18px; color:#EAF5FA; font-size:14px; line-height:21px; font-weight:600; overflow-wrap:anywhere; word-break:break-word;">${date}</td></tr>
                <tr><td style="padding-top:5px; color:#A0BECE; font-size:12px; line-height:19px; overflow-wrap:anywhere; word-break:break-word;">${venue}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="ticket-pad" style="padding:25px 32px 26px;">
              <div style="color:#78D2E2; font-family:'Courier New',monospace; font-size:10px; line-height:16px; letter-spacing:2px; text-transform:uppercase;">01 / Registered attendee</div>
              <div class="attendee-name" style="margin-top:8px; margin-bottom:18px; color:#F2F8FB; font-size:27px; line-height:33px; font-weight:800; overflow-wrap:anywhere; word-break:break-word;">${name}</div>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; table-layout:fixed;">
                ${detail("College", college)}
                ${detail("Program", program)}
                ${detail("Year level", year)}
                ${detail("Section", section)}
              </table>
            </td>
          </tr>
          <tr>
            <td class="ticket-pad" align="center" bgcolor="#050E1F" style="padding:25px 32px 26px; background-color:#050E1F; border-top:1px dashed #3A6177; border-bottom:1px dashed #3A6177;">
              <div style="margin-bottom:17px; color:#7FD9E7; font-family:'Courier New',monospace; font-size:10px; line-height:16px; letter-spacing:2px; text-transform:uppercase;">02 / Gate check-in</div>
              <table role="presentation" width="270" border="0" cellspacing="0" cellpadding="0" class="qr-frame" align="center" bgcolor="#A1DAE5" style="width:270px; background-color:#A1DAE5; background-image:linear-gradient(145deg,#CDF6F7 0%,#71AEBF 100%); border:1px solid #C9EDF2; border-radius:15px;">
                <tr>
                  <td align="center" style="padding:10px;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#FFFFFF" style="width:100%; background-color:#FFFFFF; border-radius:9px;">
                      <tr><td align="center" style="padding:12px;"><img class="qr-image" src="${escape(qrDataUrl)}" width="224" height="224" alt="Your unique admission QR code" style="display:block; width:224px; height:224px; border:0; margin:0 auto; background-color:#FFFFFF;" /></td></tr>
                    </table>
                  </td>
                </tr>
              </table>
              <div style="margin-top:17px; color:#E0F1F6; font-size:12px; line-height:19px; font-weight:700;">Present this QR to the registration committee.</div>
              <div style="margin-top:5px; max-width:360px; color:#91ABBE; font-size:11px; line-height:18px;">Keep the code fully visible and your screen brightness high. This ticket is personal; please do not share it.</div>
            </td>
          </tr>
          <tr>
            <td class="ticket-pad" style="padding:24px 32px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#0D2035" style="width:100%; background-color:#0D2035; border-left:3px solid #77DDEB;">
                <tr><td style="padding:15px 17px;">
                  <div style="margin-bottom:6px; color:#B0DFE9; font-family:'Courier New',monospace; font-size:10px; line-height:15px; letter-spacing:1.5px; text-transform:uppercase;">Before you arrive</div>
                  <div style="color:#BDD0DD; font-size:12px; line-height:20px; overflow-wrap:anywhere; word-break:break-word;">${notice}</div>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="ticket-pad" style="padding:19px 32px 22px; border-top:1px solid #294C68;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="color:#8EC4D3; font-family:'Courier New',monospace; font-size:9px; line-height:16px; letter-spacing:1.4px; text-transform:uppercase;">Personal admission credential</td>
                  <td align="right" style="color:#6C91A6; font-family:'Courier New',monospace; font-size:9px; line-height:16px;">[ END OF PASS ]</td>
                </tr>
              </table>
              <div style="margin-top:12px; color:#7899AE; font-size:9px; line-height:15px;">&copy; 2026 University of Makati &bull; Developer Head Gio Joshua Gonzales</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

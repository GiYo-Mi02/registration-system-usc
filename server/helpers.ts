import nodemailer from "nodemailer";
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } from "./config";

// Setup Nodemailer SMTP transport
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // true for port 465, false for 587
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false // Prevents certificate verification errors locally
  }
});

// HTML escaping helper to prevent XSS injection
export function escapeHTML(str: string): string {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Elegant Dark-Theme Email Template Generator
export function generateEmailTemplate(
  fullName: string,
  college: string,
  eventName: string,
  eventDate: string,
  eventVenue: string,
  qrDataUrl: string,
  description: string
): string {
  const escapedName = escapeHTML(fullName);
  const escapedCollege = escapeHTML(college);
  const escapedEvent = escapeHTML(eventName);
  const escapedDate = escapeHTML(eventDate);
  const escapedVenue = escapeHTML(eventVenue);
  const escapedDescription = escapeHTML(description).replace(/\r?\n/g, "<br />");
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your Secured Entry Ticket</title>
</head>
<body style="margin:0; padding:0; background-color:#4ec0ca; font-family:'Courier New', Courier, Monaco, monospace;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#4ec0ca; padding:40px 10px;">
    <tr>
      <td align="center">
        <table width="480" border="0" cellspacing="0" cellpadding="0" style="background-color:#5c9e2b; border: 4px solid #000000; border-radius: 12px; overflow:hidden; box-shadow: 0 12px 32px rgba(0,0,0,0.3);">
          
          <!-- Partner / Sponsor Logos Header -->
          <tr>
            <td style="background-color:#ffffff; padding:12px 10px; text-align:center; border-bottom:4px solid #000000;">
              <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto; background-color: #ffffff;">
                <tr>
                  <td style="padding: 0 8px;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784298519/UMak_Logo_-_White_R_egxa4f.png" height="32" style="display:block; max-height:32px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));" alt="UMak" /></td>
                  <td style="padding: 0 8px; border-left: 2px solid #e0e0e0;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784298535/USC-Logo_nksfl8.png" height="32" style="display:block; max-height:32px;" alt="USC" /></td>
                  <td style="padding: 0 8px; border-left: 2px solid #e0e0e0;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784209617/FO_BIRD-removebg-preview_kpl3hh.png" height="32" style="display:block; max-height:32px;" alt="Herons" /></td>
                  <td style="padding: 0 8px; border-left: 2px solid #e0e0e0;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784298531/Tuseran_Forte_CAP_2026_z67nhz.png" height="32" style="display:block; max-height:32px;" alt="Tuseran Forte" /></td>
                  <td style="padding: 0 8px; border-left: 2px solid #e0e0e0;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784298534/SPONSOR_LOGO_kxton7.jpg" height="32" style="display:block; max-height:32px; border-radius: 2px;" alt="Sponsor 1" /></td>
                  <td style="padding: 0 8px; border-left: 2px solid #e0e0e0;"><img src="https://res.cloudinary.com/dcgejrmm0/image/upload/v1784298533/SPONSOR_LOGO_1_iy8h5g.jpg" height="32" style="display:block; max-height:32px; border-radius: 2px;" alt="Sponsor 2" /></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sky Blue Header -->
          <tr>
            <td style="background-color:#73C2FB; padding:28px 24px; text-align:center; border-bottom:4px solid #000000; position:relative; overflow:hidden;">
              
              <!-- Floating Soft White Pixelated Clouds -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px; margin-top: -10px;">
                <tr>
                  <td align="left" style="width: 33%; padding-left: 10px;">
                    <!-- Pixelated Cloud left -->
                    <table border="0" cellspacing="0" cellpadding="0" align="left" style="line-height: 0; font-size: 0; opacity: 0.85;">
                      <tr>
                        <td>
                          <div style="width: 30px; height: 6px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 60px; height: 10px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 46px; height: 6px; background-color: #ffffff; margin: 0 auto;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="center" style="width: 34%;">
                    <!-- Pixelated Cloud center -->
                    <table border="0" cellspacing="0" cellpadding="0" align="center" style="line-height: 0; font-size: 0; opacity: 0.85; margin: 0 auto;">
                      <tr>
                        <td>
                          <div style="width: 50px; height: 8px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 100px; height: 12px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 80px; height: 8px; background-color: #ffffff; margin: 0 auto;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="width: 33%; padding-right: 10px;">
                    <!-- Pixelated Cloud right -->
                    <table border="0" cellspacing="0" cellpadding="0" align="right" style="line-height: 0; font-size: 0; opacity: 0.85;">
                      <tr>
                        <td>
                          <div style="width: 20px; height: 5px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 44px; height: 8px; background-color: #ffffff; margin: 0 auto;"></div>
                          <div style="width: 32px; height: 5px; background-color: #ffffff; margin: 0 auto;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <h1 style="margin:0; color:#FFFFFF; font-size:24px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; text-shadow: 3px 3px 0px #000000, -1px -1px 0px #000000, 1px -1px 0px #000000, -1px 1px 0px #000000, 1px 1px 0px #000000;">
                UNIVERSITY OF MAKATI
              </h1>
              <h2 style="margin:8px 0 0 0; color:#FFFFFF; font-size:14px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; text-shadow: 2px 2px 0px #000000, -1px -1px 0px #000000, 1px -1px 0px #000000, -1px 1px 0px #000000, 1px 1px 0px #000000;">
                ${escapedEvent}
              </h2>
              <p style="margin:6px 0 0 0; color:#FFCC00; font-size:11px; font-weight:bold; letter-spacing:2px; text-transform:uppercase; text-shadow: 1.5px 1.5px 0px #000000;">
                UNIVERSITY STUDENT COUNCIL
              </p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding:32px 24px; background-color:#4ec0ca;">
              
              <!-- Retro Scoreboard Box for Event Details -->
              <div style="background-color:#e2dca5; border:4px solid #543847; padding:24px; border-radius:8px; box-shadow: inset -4px -4px 0px #c5b87a, 5px 5px 0px rgba(0,0,0,0.15);">
                
                <h2 style="margin:0 0 16px 0; font-size:14px; font-weight:bold; color:#543847; border-bottom: 2px dashed rgba(84, 56, 71, 0.3); pb: 8px; text-transform:uppercase;">
                  PLAYER: <span style="color:#d35400;">${escapedName}</span>
                </h2>

                <!-- Retro Green Pipe Decorator with 3D shadow wraps -->
                <div style="height:16px; background-color:#73c732; border:3px solid #000000; border-radius:4px; margin:16px 0; position:relative; box-shadow: inset -6px 0px 0px #529c1f, inset 6px 0px 0px #a3f25c;">
                  <div style="position:absolute; top:2px; left:12px; width:4px; height:6px; background-color:#ffffff; opacity:0.6;"></div>
                </div>

                <!-- Match Statistics / Event Details -->
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-family:'Courier New', Courier, monospace; font-size:12px; color:#543847; font-weight:bold;">
                  <tr>
                    <td style="padding:6px 0; width:100px; text-transform:uppercase; color:#543847; opacity:0.8;">COLLEGE:</td>
                    <td style="padding:6px 0; color:#d35400; font-size:13px; text-transform:uppercase;">${escapedCollege}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; width:100px; text-transform:uppercase; color:#543847; opacity:0.8;">STAGE:</td>
                    <td style="padding:6px 0; color:#2e7d32; font-size:13px; text-transform:uppercase;">${escapedEvent}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; text-transform:uppercase; color:#543847; opacity:0.8;">DATE:</td>
                    <td style="padding:6px 0; color:#c0392b;">${escapedDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0; text-transform:uppercase; color:#543847; opacity:0.8;">📍 VENUE:</td>
                    <td style="padding:6px 0; color:#2980b9; text-transform:uppercase;">${escapedVenue}</td>
                  </tr>
                </table>
              </div>

              <!-- "Get Ready" Short Reminder Box -->
              <div style="background-color:#f5bb2c; border:4px solid #000000; padding:16px; border-radius:8px; margin-top:24px; box-shadow: 5px 5px 0px rgba(0,0,0,0.15);">
                <span style="display:block; font-size:12px; font-weight:bold; color:#000000; text-transform:uppercase; margin-bottom:6px;">
                  ⚠️ GET READY NOTICE:
                </span>
                <p style="margin:0; font-size:11px; color:#000000; line-height:1.5; font-weight:bold;">
                  ${escapedDescription}
                </p>
              </div>

              <!-- QR Code Game Cartridge Container -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <div style="display:inline-block; background-color:#FFFFFF; border:4px solid #543847; padding:16px; border-radius:8px; box-shadow: 5px 5px 0px rgba(0,0,0,0.15); text-align:center;">
                      <img src="${qrDataUrl}" width="180" height="180" alt="Entry QR Code" style="display:block; border: 2px solid #543847; margin:0 auto;" />
                      <div style="margin-top:12px; font-size:11px; font-weight:bold; color:#543847; text-transform:uppercase; letter-spacing:1px;">
                        [ SCAN TICKET NOW ]
                      </div>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Flappy Ground Footer Decorator -->
          <tr>
            <td style="background-color:#ded895; border-top:8px solid #73c732; padding:28px 24px; text-align:center; font-family:'Courier New', Courier, monospace; color:#543847; font-size:11px; font-weight:bold;">
              
              <!-- Upward Pipe emerging from ground -->
              <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: -38px auto 16px auto;">
                <tr>
                  <td align="center">
                    <div style="width: 48px; height: 14px; background-color: #73c732; border: 3px solid #000000; border-radius: 3px; box-shadow: inset -4px 0px 0px #529c1f, inset 4px 0px 0px #a3f25c; position: relative;">
                      <div style="position: absolute; left: 6px; top: 1px; width: 3px; height: 6px; background-color: #ffffff; opacity: 0.6;"></div>
                    </div>
                    <div style="width: 38px; height: 16px; background-color: #73c732; border-left: 3px solid #000000; border-right: 3px solid #000000; box-shadow: inset -4px 0px 0px #529c1f, inset 4px 0px 0px #a3f25c; position: relative; margin-top: -1px;">
                      <div style="position: absolute; left: 6px; top: 0; width: 3px; height: 16px; background-color: #ffffff; opacity: 0.6;"></div>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px 0; text-transform:uppercase; font-size:12px; color:#c0392b;">
                ⚡ ONE LIFE PASS ⚡
              </p>
              <p style="margin:0; line-height:1.5; opacity:0.85;">
                This QR Code grants a single execution check-in. Any duplicate attempt will cause a registration crash. Do not share.
              </p>
              <div style="margin-top:20px; font-size:9px; opacity:0.6; text-transform:uppercase;">
                &copy; 2026 UNIVERSITY OF MAKATI &bull; Developer Head Gio Joshua Gonzales
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// Mail Dispatcher
export async function sendEmail(to: string, subject: string, htmlContent: string, qrDataUrl?: string) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[SMTP SIMULATOR] Mock email sent to: ${to} (SMTP credentials missing in environment variables)`);
    return { success: true, simulated: true };
  }

  try {
    const attachments = [];
    let formattedHtml = htmlContent;

    if (qrDataUrl) {
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(base64Data, "base64");
      
      // Replace base64 src in the HTML content with cid:qrcode
      formattedHtml = htmlContent.replace(qrDataUrl, "cid:qrcode");

      attachments.push({
        filename: "qrcode.png",
        content: qrBuffer,
        cid: "qrcode"
      });
    }

    const info = await transporter.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject,
      html: formattedHtml,
      attachments
    });
    console.log(`[SMTP] Email successfully sent to ${to} (MessageId: ${info.messageId})`);
    return { success: true, simulated: false };
  } catch (err: any) {
    console.error(`[SMTP ERROR] Failed to send email to ${to}:`, err);
    throw err;
  }
}

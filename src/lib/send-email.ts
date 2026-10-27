import nodemailer from "nodemailer";
import { getSmtpSettings } from "@/lib/auth";
import { getSetting } from "@/lib/settings";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A plain one-off email from the shop (Admin → Orders → "Message customer"),
 * through the same email account as sign-in links (Admin → Settings → Email).
 * Replies go to the owner's email.
 */
export async function sendShopEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<string | null> {
  const smtp = await getSmtpSettings();
  if (!smtp.EMAIL_SERVER_HOST || !smtp.EMAIL_SERVER_USER) return "Email isn't set up (Admin → Settings → Email)";
  const port = Number(smtp.EMAIL_SERVER_PORT) || 465;
  const transport = nodemailer.createTransport({
    host: smtp.EMAIL_SERVER_HOST,
    port,
    secure: port === 465,
    auth: { user: smtp.EMAIL_SERVER_USER, pass: smtp.EMAIL_SERVER_PASS },
  });
  try {
    await transport.sendMail({
      from: smtp.EMAIL_FROM || smtp.EMAIL_SERVER_USER,
      to,
      replyTo: (await getSetting("ADMIN_EMAIL")) || undefined,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1c1917;line-height:1.6">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`,
    });
    return null;
  } catch (err) {
    console.error("[email] Couldn't send:", err);
    return `Couldn't send the email: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

/**
 * Outbound email abstraction.
 *
 * V1: stub — logs the message to stdout. Once SMTP is wired (Aliyun
 * DirectMail), swap the implementation to nodemailer + transporter; no
 * caller has to change.
 *
 * Why a single mailer here: we'll have at least three places that send
 * email (daily report, password reset, invite confirmation) and they all
 * need the same SMTP config + retry semantics.
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback for clients that won't render HTML. */
  text?: string;
};

const SMTP_REQUIRED = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];

function isConfigured(): boolean {
  return SMTP_REQUIRED.every((k) => !!process.env[k]);
}

export async function sendMail(msg: MailMessage): Promise<{ delivered: boolean; reason?: string }> {
  if (!isConfigured()) {
    console.log(
      `[mailer] SMTP not configured, dropping mail to=${msg.to} subject=${msg.subject}`,
    );
    return { delivered: false, reason: 'smtp_not_configured' };
  }

  // When SMTP is wired in P0-1, replace this branch with:
  //   import { createTransport } from 'nodemailer';
  //   const t = createTransport({ host, port, secure, auth: { user, pass } });
  //   await t.sendMail({ from, to, subject, html, text });
  console.log(`[mailer] would send to=${msg.to} subject=${msg.subject}`);
  return { delivered: true };
}

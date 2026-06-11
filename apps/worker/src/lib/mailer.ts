/**
 * Outbound email abstraction.
 *
 * V1.12.1 (A2): 真实 SMTP 发送(nodemailer)。此前是纯 stub — 即使配了
 * SMTP 也只打日志"would send"然后谎报 delivered=true,周报/通知从未真实
 * 送达过任何人。现在:
 *   - SMTP_* 配齐 → nodemailer 真发,失败如实返回 delivered=false + reason
 *   - 未配置 → delivered=false + reason='smtp_not_configured' + reportEvent
 *     (静默丢弃必须可观测,禁止假成功)
 *
 * Why a single mailer here: daily report / password reset / invite
 * confirmation 共用同一套 SMTP config + 失败语义。
 *
 * 阿里云邮件推送(DirectMail) SMTP 接入参数:
 *   SMTP_HOST=smtpdm.aliyun.com  SMTP_PORT=465 (SSL)
 *   SMTP_USER=<发信地址>  SMTP_PASS=<SMTP 密码>  SMTP_FROM=<发信地址>
 */
import { createTransport, type Transporter } from 'nodemailer';
import { reportEvent } from '@geo/shared';

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

let cachedTransport: Transporter | null = null;

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport;
  const port = Number(process.env.SMTP_PORT ?? 465);
  cachedTransport = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465, // 465=SSL; 587/25 走 STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cachedTransport;
}

export async function sendMail(msg: MailMessage): Promise<{ delivered: boolean; reason?: string }> {
  if (!isConfigured()) {
    console.log(
      `[mailer] SMTP not configured, dropping mail to=${msg.to} subject=${msg.subject}`,
    );
    reportEvent('mailer.dropped_not_configured', {
      scope: 'mailer',
      extra: { to: msg.to, subject: msg.subject },
    });
    return { delivered: false, reason: 'smtp_not_configured' };
  }

  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    console.log(`[mailer] sent to=${msg.to} subject=${msg.subject}`);
    return { delivered: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[mailer] send failed to=${msg.to}: ${reason}`);
    reportEvent('mailer.send_failed', {
      scope: 'mailer',
      extra: { to: msg.to, subject: msg.subject, reason: reason.slice(0, 200) },
    });
    return { delivered: false, reason };
  }
}

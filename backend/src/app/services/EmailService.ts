import nodemailer, { Transporter } from 'nodemailer';
import { config, isEmailConfigured } from '@/config';
import { logger } from '@/utils';

type EmailInput = {
  to: string;
  subject: string;
  /** Plain-text body. Also used as the fallback for clients without HTML. */
  text: string;
  html?: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      // 465 is implicit TLS; 587 upgrades with STARTTLS.
      secure: config.SMTP_PORT === 465,
      auth: { user: config.SMTP_EMAIL, pass: config.SMTP_PASSWORD },
    });
  }
  return transporter;
}

/**
 * Minimal outbound email.
 *
 * Email is a nice-to-have on top of in-app notifications, never a prerequisite:
 * `send` reports failure rather than throwing, so a missing or broken SMTP
 * setup can never fail the request that triggered it. With SMTP unconfigured
 * the app behaves exactly as before, logging once per message instead.
 */
export class EmailService {
  static isConfigured(): boolean {
    return isEmailConfigured();
  }

  static async send(input: EmailInput): Promise<boolean> {
    if (!isEmailConfigured()) {
      logger.info(`Email skipped (SMTP not configured): "${input.subject}" to ${input.to}`);
      return false;
    }

    try {
      await getTransporter().sendMail({
        from: `"${config.SMTP_FROM_NAME}" <${config.SMTP_EMAIL}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html || undefined,
      });
      logger.info(`Email sent: "${input.subject}" to ${input.to}`);
      return true;
    } catch (error: any) {
      logger.error(`Email failed: "${input.subject}" to ${input.to} -- ${error.message}`);
      return false;
    }
  }

  /** Wrap body content in the same light-weight shell for every message. */
  private static layout(
    heading: string,
    bodyHtml: string,
    actionUrl?: string,
    actionLabel?: string
  ) {
    const button = actionUrl
      ? `<p style="margin:24px 0"><a href="${actionUrl}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${actionLabel || 'Open SynergySphere'}</a></p>`
      : '';
    return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
  <h2 style="margin:0 0 16px;font-size:18px">${heading}</h2>
  ${bodyHtml}
  ${button}
  <p style="margin-top:28px;font-size:12px;color:#64748b">Sent by SynergySphere. You are receiving this because you are a member of this project.</p>
</div>`;
  }

  /** Tell someone they have been invited to a project. */
  static async sendProjectInvitation(options: {
    to: string;
    inviterName: string;
    projectName: string;
  }): Promise<boolean> {
    const url = `${config.FRONTEND_URL.replace(/\/+$/, '')}/invitations`;
    return EmailService.send({
      to: options.to,
      subject: `${options.inviterName} invited you to "${options.projectName}"`,
      text:
        `${options.inviterName} invited you to collaborate on "${options.projectName}" in SynergySphere.\n\n` +
        `Accept or decline the invitation here: ${url}`,
      html: EmailService.layout(
        `You have been invited to "${options.projectName}"`,
        `<p style="margin:0;line-height:1.6"><strong>${options.inviterName}</strong> invited you to collaborate on <strong>${options.projectName}</strong>.</p>`,
        url,
        'View invitation'
      ),
    });
  }

  /** Ask a reviewer to look at submitted proof of work. */
  static async sendReviewRequest(options: {
    to: string;
    submitterName: string;
    taskTitle: string;
    taskKey?: string;
    projectName: string;
    taskId: string;
  }): Promise<boolean> {
    const url = `${config.FRONTEND_URL.replace(/\/+$/, '')}/tasks/${options.taskId}`;
    const label = options.taskKey ? `${options.taskKey} — ${options.taskTitle}` : options.taskTitle;
    return EmailService.send({
      to: options.to,
      subject: `Review requested: ${label}`,
      text:
        `${options.submitterName} submitted "${label}" in ${options.projectName} for review.\n\n` +
        `Review it here: ${url}`,
      html: EmailService.layout(
        'A task is ready for your review',
        `<p style="margin:0;line-height:1.6"><strong>${options.submitterName}</strong> submitted <strong>${label}</strong> in ${options.projectName} and it is waiting for review.</p>`,
        url,
        'Review task'
      ),
    });
  }
}

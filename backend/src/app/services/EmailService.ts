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

type EmailSendResult = { sent: true } | { sent: false; error: string };

/**
 * Escape user-supplied text before it goes into an HTML email body.
 *
 * Task titles, notes and reviewer comments are written by people, so they can
 * contain characters that would otherwise break out of the markup.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Small uppercase heading used between sections of an email body. */
function sectionLabel(text: string): string {
  return `<p style="margin:16px 0 6px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#64748b">${text}</p>`;
}

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
 * `send` reports delivery failure instead of throwing. Optional notification
 * callers may ignore that result; account verification callers must return an
 * explicit error and must not authenticate an undelivered registration.
 */
export class EmailService {
  static isConfigured(): boolean {
    return isEmailConfigured();
  }

  private static async sendWithResult(input: EmailInput): Promise<EmailSendResult> {
    if (!isEmailConfigured()) {
      logger.info(`Email skipped (SMTP not configured): "${input.subject}" to ${input.to}`);
      return { sent: false, error: 'SMTP is not configured.' };
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
      return { sent: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Email failed: "${input.subject}" to ${input.to} -- ${message}`);
      return { sent: false, error: message };
    }
  }

  static async send(input: EmailInput): Promise<boolean> {
    return (await EmailService.sendWithResult(input)).sent;
  }

  /** Send a short-lived sign-in verification code. */
  static async sendVerificationCode(options: {
    to: string;
    code: string;
  }): Promise<EmailSendResult> {
    return EmailService.sendWithResult({
      to: options.to,
      subject: 'Verify your SynergySphere email',
      text:
        `Your SynergySphere verification code is ${options.code}.\n\n` +
        'It expires in 5 minutes. If you did not request this, you can ignore this email.',
      html: EmailService.layout(
        'Verify your email address',
        `<p style="margin:0;line-height:1.6">Enter this verification code in SynergySphere:</p><p style="margin:20px 0;font-size:28px;font-weight:700;letter-spacing:8px">${options.code}</p><p style="margin:0;line-height:1.6">This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>`
      ),
    });
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
  <p style="margin-top:28px;font-size:12px;color:#64748b">Sent by SynergySphere.</p>
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
    /** What the developer wrote when submitting. */
    description?: string;
    /** Commit / pull request links backing the submission. */
    evidence?: Array<{ label: string; url?: string }>;
  }): Promise<boolean> {
    const url = `${config.FRONTEND_URL.replace(/\/+$/, '')}/tasks/${options.taskId}`;
    const label = options.taskKey ? `${options.taskKey} — ${options.taskTitle}` : options.taskTitle;
    const evidence = (options.evidence || []).filter(item => item.label || item.url);

    const evidenceText = evidence.length
      ? '\n\nEvidence:\n' +
        evidence.map(item => `  - ${item.label}${item.url ? `: ${item.url}` : ''}`).join('\n')
      : '';
    const descriptionText = options.description ? `\n\nNotes:\n${options.description}` : '';

    const evidenceHtml = evidence.length
      ? `${sectionLabel('Evidence')}<ul style="margin:0;padding-left:18px;line-height:1.7">${evidence
          .map(
            item =>
              `<li>${escapeHtml(item.label)}${
                item.url
                  ? ` — <a href="${encodeURI(item.url)}" style="color:#4f46e5">${escapeHtml(item.url)}</a>`
                  : ''
              }</li>`
          )
          .join('')}</ul>`
      : '';
    const descriptionHtml = options.description
      ? `${sectionLabel('Notes')}<p style="margin:0;line-height:1.6;white-space:pre-wrap">${escapeHtml(options.description)}</p>`
      : '';

    return EmailService.send({
      to: options.to,
      subject: `Review requested: ${label}`,
      text:
        `${options.submitterName} submitted "${label}" in ${options.projectName} for review.` +
        descriptionText +
        evidenceText +
        `\n\nReview it here: ${url}`,
      html: EmailService.layout(
        'A task is ready for your review',
        `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(options.submitterName)}</strong> submitted <strong>${escapeHtml(label)}</strong> in ${escapeHtml(options.projectName)} and it is waiting for review.</p>${descriptionHtml}${evidenceHtml}`,
        url,
        'Review task'
      ),
    });
  }

  /** Tell the assignee how their submitted proof was reviewed. */
  static async sendProofReviewed(options: {
    to: string;
    reviewerName: string;
    decision: 'approved' | 'changes_requested';
    taskTitle: string;
    taskKey?: string;
    projectName: string;
    taskId: string;
    comment?: string;
  }): Promise<boolean> {
    const url = `${config.FRONTEND_URL.replace(/\/+$/, '')}/tasks/${options.taskId}`;
    const label = options.taskKey ? `${options.taskKey} — ${options.taskTitle}` : options.taskTitle;
    const approved = options.decision === 'approved';
    const verb = approved ? 'approved' : 'requested changes on';

    const commentText = options.comment ? `\n\nReviewer comment:\n${options.comment}` : '';
    const commentHtml = options.comment
      ? `${sectionLabel('Reviewer comment')}<p style="margin:0;line-height:1.6;white-space:pre-wrap">${escapeHtml(options.comment)}</p>`
      : '';

    return EmailService.send({
      to: options.to,
      subject: approved ? `Approved: ${label}` : `Changes requested: ${label}`,
      text:
        `${options.reviewerName} ${verb} "${label}" in ${options.projectName}.` +
        commentText +
        `\n\nOpen the task: ${url}`,
      html: EmailService.layout(
        approved ? 'Your work was approved' : 'Changes were requested',
        `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(options.reviewerName)}</strong> ${verb} <strong>${escapeHtml(label)}</strong> in ${escapeHtml(options.projectName)}.</p>${commentHtml}`,
        url,
        'Open task'
      ),
    });
  }
}

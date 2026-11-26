/**
 * Check the SMTP setup, and optionally send one real test message.
 *
 *   npm run verify:email                      # check credentials only, sends nothing
 *   npm run verify:email -- you@example.com   # also send one test email
 *
 * The recipient must be given explicitly: without one this script only opens a
 * connection and authenticates, so it can never send mail by accident.
 */
import nodemailer from 'nodemailer';
import { config, isEmailConfigured } from '@/config';
import { EmailService } from '@/services/EmailService';

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(22)} ${value}`);
}

async function main() {
  const recipient = process.argv[2];

  console.log('\nSMTP configuration');
  line('Configured', String(isEmailConfigured()));
  line('Host', config.SMTP_HOST || '(unset)');
  line('Port', String(config.SMTP_PORT));
  line('From name', config.SMTP_FROM_NAME);
  line('Username set', String(Boolean(config.SMTP_EMAIL)));
  line('Password set', String(Boolean(config.SMTP_PASSWORD)));

  if (!isEmailConfigured()) {
    console.log('\nEmail is disabled. The app runs normally and logs every message it skips.');
    console.log(
      'To enable it, set SMTP_HOST, SMTP_PORT, SMTP_EMAIL and SMTP_PASSWORD in backend/.env.'
    );
    return;
  }

  console.log('\nAuthenticating');
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: { user: config.SMTP_EMAIL, pass: config.SMTP_PASSWORD },
  });

  try {
    await transporter.verify();
    console.log('  OK — the mail server accepted these credentials.');
  } catch (error: any) {
    console.log(`  FAILED — ${error.message}`);
    if (/Username and Password not accepted|Invalid login|535/i.test(error.message)) {
      console.log('\n  For Gmail this almost always means the app password is wrong or revoked:');
      console.log('    1. Enable 2-Step Verification on the Google account.');
      console.log('    2. Create a new app password at https://myaccount.google.com/apppasswords');
      console.log('    3. Put the 16-character value in SMTP_PASSWORD (spaces may be removed).');
      console.log('    4. SMTP_EMAIL must be that same Google account address.');
    }
    process.exitCode = 1;
    return;
  }

  if (!recipient) {
    console.log('\nNo recipient given, so nothing was sent.');
    console.log('To send one real test message:  npm run verify:email -- you@example.com');
    return;
  }

  console.log(`\nSending one test message to ${recipient}`);
  const sent = await EmailService.sendReviewRequest({
    to: recipient,
    submitterName: 'SynergySphere test',
    taskTitle: 'SMTP delivery check',
    taskKey: 'TASK-0',
    projectName: 'Configuration test',
    taskId: 'smtp-check',
    description: 'This is a test message sent by npm run verify:email.',
    evidence: [
      { label: 'Example pull request', url: 'https://github.com/octocat/Hello-World/pull/1' },
    ],
  });

  console.log(
    sent ? '  Sent. Check the inbox (and the spam folder).' : '  Send failed — see the error above.'
  );
  if (!sent) process.exitCode = 1;
}

void main().catch(error => {
  console.error('Email check failed:', error.message);
  process.exit(1);
});

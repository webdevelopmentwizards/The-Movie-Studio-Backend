import nodemailer, { type Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import Logger from '../core/Logger';
import { SMTP } from '../config/globals';

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(SMTP.user?.trim() && SMTP.pass?.trim() && SMTP.contactToEmail?.trim());
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (!isMailConfigured()) {
    throw new Error('SMTP is not configured.');
  }

  transporter = nodemailer.createTransport({
    host: SMTP.host || 'smtp.office365.com',
    port: SMTP.port || 587,
    secure: SMTP.secure,
    requireTLS: !SMTP.secure && SMTP.port === 587,
    auth: {
      user: SMTP.user,
      pass: SMTP.pass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });

  return transporter;
}

function fromAddress(): string {
  const email = (SMTP.fromEmail || SMTP.user || '').trim();
  const name = (SMTP.fromName || 'The Movie Studio').trim();
  return name ? `"${name}" <${email}>` : email;
}

function loadEmailTemplate(templateName: string): string {
  const possiblePaths = [
    path.join(__dirname, '../email_templates', `${templateName}.html`),
    path.join(__dirname, '../../email_templates', `${templateName}.html`),
    path.join(process.cwd(), 'src/email_templates', `${templateName}.html`),
    path.join(process.cwd(), 'dist/email_templates', `${templateName}.html`),
    path.join(process.cwd(), 'dist/src/email_templates', `${templateName}.html`),
  ];

  for (const templatePath of possiblePaths) {
    if (fs.existsSync(templatePath)) {
      return fs.readFileSync(templatePath, 'utf-8');
    }
  }

  throw new Error(`Email template ${templateName}.html not found`);
}

function renderTemplate(templateName: string, data: Record<string, string | undefined>): string {
  let html = loadEmailTemplate(templateName);
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
  }
  return html;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}): Promise<string> {
  const mailer = getTransporter();
  const result = await mailer.sendMail({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    replyTo,
  });

  Logger.info(`Email sent to ${Array.isArray(to) ? to.join(',') : to}. MessageId: ${result.messageId}`);
  return String(result.messageId || '');
}

export async function sendContactStudioEmail({
  name,
  email,
  subjectLabel,
  message,
}: {
  name: string;
  email: string;
  subjectLabel: string;
  message: string;
}): Promise<void> {
  await sendEmail({
    to: SMTP.contactToEmail,
    subject: `[Contact] ${subjectLabel} — ${name}`,
    html: renderTemplate('contact-studio', { name, email, subjectLabel, message }),
    replyTo: `"${name}" <${email}>`,
  });
}

export async function sendContactUserEmail({
  to,
  name,
  subjectLabel,
}: {
  to: string;
  name: string;
  subjectLabel: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: 'We received your message — The Movie Studio',
    html: renderTemplate('contact-user', { name, subjectLabel }),
  });
}

export async function sendAuditionStudioEmail({
  fullName,
  email,
  videoUrl,
  photoUrl,
}: {
  fullName: string;
  email: string;
  videoUrl: string;
  photoUrl: string;
}): Promise<void> {
  await sendEmail({
    to: SMTP.contactToEmail,
    subject: `[Audition] ${fullName}`,
    html: renderTemplate('audition-studio', { fullName, email, videoUrl, photoUrl }),
    replyTo: `"${fullName}" <${email}>`,
  });
}

export async function sendAuditionUserEmail({
  to,
  firstName,
}: {
  to: string;
  firstName: string;
}): Promise<void> {
  await sendEmail({
    to,
    subject: 'We received your audition — The Movie Studio',
    html: renderTemplate('audition-user', { firstName }),
  });
}

export async function verifyMailTransport(): Promise<boolean> {
  if (!isMailConfigured()) return false;
  await getTransporter().verify();
  return true;
}

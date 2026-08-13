/**
 * @deprecated Use services/mailService.ts (SMTP/nodemailer).
 * Kept for import compatibility.
 */
export {
  sendEmail,
  sendContactStudioEmail,
  sendContactUserEmail,
  sendAuditionStudioEmail,
  sendAuditionUserEmail,
  isMailConfigured,
  verifyMailTransport,
} from '../services/mailService';

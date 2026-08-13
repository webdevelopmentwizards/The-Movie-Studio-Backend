import { Response } from 'express';
import asyncHandler from '../../../helpers/async';
import { BadRequestError, InternalError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';
import {
  isMailConfigured,
  sendContactStudioEmail,
  sendContactUserEmail,
} from '../../../services/mailService';
import { SMTP } from '../../../config/globals';
import ContactRepo from './contact.repository';
import Logger from '../../../core/Logger';

const SUBJECTS: Record<string, string> = {
  general: 'General Inquiry',
  partnership: 'Partnership',
  press: 'Press & Media',
  careers: 'Careers',
};

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_MESSAGE = 5000;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clientIp(req: any): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || null;
  }
  return req.socket?.remoteAddress || null;
}

export class ContactController {
  submit = asyncHandler(async (req: any, res: Response) => {
    const body = req.body || {};

    // Honeypot — pretend success
    if (body.company && String(body.company).trim().length > 0) {
      return new SuccessResponse('Message sent successfully', { received: true }).send(res);
    }

    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();

    if (!name || name.length > MAX_NAME) {
      throw new BadRequestError('Please enter your name.');
    }
    if (!email || email.length > MAX_EMAIL || !isValidEmail(email)) {
      throw new BadRequestError('Please enter a valid email address.');
    }
    if (!subject || !SUBJECTS[subject]) {
      throw new BadRequestError('Please select a subject.');
    }
    if (!message || message.length < 10) {
      throw new BadRequestError('Please enter a message (at least 10 characters).');
    }
    if (message.length > MAX_MESSAGE) {
      throw new BadRequestError('Message is too long. Please shorten it.');
    }

    if (!isMailConfigured()) {
      throw new InternalError('Email is not configured. Please try again later.');
    }

    const subjectLabel = SUBJECTS[subject];

    const submission = await ContactRepo.create({
      name,
      email,
      subject,
      subjectLabel,
      message,
      ipAddress: clientIp(req),
    });

    try {
      await sendContactStudioEmail({ name, email, subjectLabel, message });
      if (SMTP.sendAutoReply) {
        await sendContactUserEmail({ to: email, name, subjectLabel });
      }
    } catch (error) {
      Logger.error(`Contact email failed: ${error instanceof Error ? error.message : error}`);
      throw new InternalError('Unable to send your message right now. Please try again shortly.');
    }

    return new SuccessResponse('Message sent successfully', {
      id: submission.id,
      received: true,
    }).send(res);
  });
}

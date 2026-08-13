import { Response } from 'express';
import asyncHandler from '../../../helpers/async';
import { BadRequestError, InternalError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';
import FileRepo from '../upload/file.repository';
import AuditionRepo from './audition.repository';
import {
  isMailConfigured,
  sendAuditionStudioEmail,
  sendAuditionUserEmail,
} from '../../../services/mailService';
import Logger from '../../../core/Logger';

const AUDITION_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const AUDITION_MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export class AuditionController {
  submit = asyncHandler(async (req: any, res: Response) => {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!firstName || !lastName) {
      throw new BadRequestError('First and last name are required.');
    }
    if (!email || !isValidEmail(email)) {
      throw new BadRequestError('A valid email is required.');
    }

    const files = req.files as
      | { video?: Express.Multer.File[]; photo?: Express.Multer.File[] }
      | undefined;

    const video = files?.video?.[0];
    const photo = files?.photo?.[0];

    if (!video || !photo) {
      throw new BadRequestError('Audition video and photo are required.');
    }

    if (video.size <= 0 || video.size > AUDITION_MAX_VIDEO_BYTES) {
      throw new BadRequestError('Video must be 100MB or smaller.');
    }
    if (photo.size <= 0 || photo.size > AUDITION_MAX_PHOTO_BYTES) {
      throw new BadRequestError('Photo must be 10MB or smaller.');
    }

    let videoUpload;
    let photoUpload;

    try {
      [videoUpload, photoUpload] = await Promise.all([
        FileRepo.uploadFile(video, 'auditions/video'),
        FileRepo.uploadFile(photo, 'auditions/photo'),
      ]);
    } catch (error) {
      Logger.error(`Audition upload failed: ${error instanceof Error ? error.message : error}`);
      const message = error instanceof Error ? error.message : 'Upload failed';
      const unreachable = /ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout|timed out/i.test(message);
      throw new InternalError(
        unreachable
          ? 'File storage server is unreachable. Please try again later.'
          : 'Unable to upload audition files. Please try again.',
      );
    }

    const submission = await AuditionRepo.create({
      firstName,
      lastName,
      email,
      videoUrl: videoUpload.url,
      photoUrl: photoUpload.url,
      userId: req.user?.id || null,
    });

    let emailSent = false;
    if (isMailConfigured()) {
      try {
        const fullName = `${firstName} ${lastName}`.trim();
        await sendAuditionStudioEmail({
          fullName,
          email,
          videoUrl: videoUpload.url,
          photoUrl: photoUpload.url,
        });
        await sendAuditionUserEmail({ to: email, firstName });
        emailSent = true;
      } catch (mailError) {
        // DB row is already saved — do not fail the request because of SMTP
        Logger.error(
          `Audition email failed (submission ${submission.id} saved): ${
            mailError instanceof Error ? mailError.message : mailError
          }`,
        );
      }
    } else {
      Logger.warn('Audition mail not configured; skipped emails.');
    }

    return new SuccessResponse('Audition submitted successfully', {
      id: submission.id,
      videoUrl: videoUpload.url,
      photoUrl: photoUpload.url,
      emailSent,
      firstName: submission.firstName,
      lastName: submission.lastName,
      email: submission.email,
      createdAt: submission.createdAt,
    }).send(res);
  });
}

import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import asyncHandler from '../../../helpers/async';
import { BadRequestError } from '../../../core/ApiError';
import { SuccessResponse } from '../../../core/ApiResponse';
import FileRepo from '../upload/file.repository';
import AuditionRepo from './audition.repository';
import { AuditionStatus } from '../../../database';
import {
  isMailConfigured,
  sendAuditionStudioEmail,
  sendAuditionUserEmail,
} from '../../../services/mailService';
import { compressVideo, compressPhoto } from '../../../services/compression.service';
import Logger from '../../../core/Logger';

const AUDITION_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const AUDITION_MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanupTempFiles(filePaths: (string | undefined)[]) {
  for (const filePath of filePaths) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        Logger.warn(`Failed to remove temporary file: ${filePath}`);
      }
    }
  }
}

export class AuditionController {
  submit = asyncHandler(async (req: any, res: Response) => {
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    const files = req.files as
      | { video?: Express.Multer.File[]; photo?: Express.Multer.File[] }
      | undefined;

    const video = files?.video?.[0];
    const photo = files?.photo?.[0];

    const tempPathsToClean = [video?.path, photo?.path];

    if (!firstName || !lastName) {
      cleanupTempFiles(tempPathsToClean);
      throw new BadRequestError('First and last name are required.');
    }
    if (!email || !isValidEmail(email)) {
      cleanupTempFiles(tempPathsToClean);
      throw new BadRequestError('A valid email is required.');
    }

    if (!video || !photo) {
      cleanupTempFiles(tempPathsToClean);
      throw new BadRequestError('Audition video and photo are required.');
    }

    if (video.size <= 0 || video.size > AUDITION_MAX_VIDEO_BYTES) {
      cleanupTempFiles(tempPathsToClean);
      throw new BadRequestError('Video must be 100MB or smaller.');
    }
    if (photo.size <= 0 || photo.size > AUDITION_MAX_PHOTO_BYTES) {
      cleanupTempFiles(tempPathsToClean);
      throw new BadRequestError('Photo must be 10MB or smaller.');
    }

    // 1. Create DB record immediately with PROCESSING status
    const submission = await AuditionRepo.create({
      firstName,
      lastName,
      email,
      status: AuditionStatus.PROCESSING,
      userId: req.user?.id || null,
    });

    // 2. Respond HTTP 200 OK immediately (< 2s)
    new SuccessResponse('Audition uploaded successfully and is being processed.', {
      id: submission.id,
      firstName: submission.firstName,
      lastName: submission.lastName,
      email: submission.email,
      status: submission.status,
      createdAt: submission.createdAt,
    }).send(res);

    // 3. Asynchronous background processing for compression, MinIO upload & email
    const videoTempPath = video.path;
    const photoTempPath = photo.path;
    const uploadDir = path.dirname(videoTempPath);

    setImmediate(async () => {
      const compressedVideoPath = path.join(
        uploadDir,
        `compressed-video-${submission.id}.mp4`,
      );
      const compressedPhotoPath = path.join(
        uploadDir,
        `compressed-photo-${submission.id}.jpg`,
      );

      try {
        Logger.info(`[Audition] Starting background compression for submission ${submission.id}`);

        // Step A: Compress Video & Photo in parallel
        await Promise.all([
          compressVideo(videoTempPath, compressedVideoPath),
          compressPhoto(photoTempPath, compressedPhotoPath),
        ]);

        // Step B: Stream Upload Compressed Files to MinIO
        const [videoUpload, photoUpload] = await Promise.all([
          FileRepo.uploadLocalFile(
            compressedVideoPath,
            'auditions/video',
            'video/mp4',
            video.originalname,
          ),
          FileRepo.uploadLocalFile(
            compressedPhotoPath,
            'auditions/photo',
            'image/jpeg',
            photo.originalname,
          ),
        ]);

        // Step C: Update DB Record to COMPLETED
        await AuditionRepo.update(submission.id, {
          videoUrl: videoUpload.url,
          photoUrl: photoUpload.url,
          status: AuditionStatus.COMPLETED,
        });

        // Step D: Send Emails Asynchronously
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
            Logger.error(
              `[Audition] Email sending failed for submission ${submission.id}: ${
                mailError instanceof Error ? mailError.message : mailError
              }`,
            );
          }
        } else {
          Logger.warn('[Audition] SMTP not configured; skipped audition emails.');
        }

        if (emailSent) {
          await AuditionRepo.update(submission.id, { emailSent: true }).catch(() => {});
        }

        Logger.info(`[Audition] Successfully finished processing for submission ${submission.id}`);
      } catch (error) {
        Logger.error(
          `[Audition] Error during background processing for submission ${submission.id}: ${
            error instanceof Error ? error.message : error
          }`,
        );
        await AuditionRepo.update(submission.id, {
          status: AuditionStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Processing failed',
        }).catch((err) => {
          Logger.error(`[Audition] Failed to mark audition as FAILED: ${err}`);
        });
      } finally {
        // Step E: Clean up all temporary files safely
        cleanupTempFiles([
          videoTempPath,
          photoTempPath,
          compressedVideoPath,
          compressedPhotoPath,
        ]);
      }
    });
  });
}

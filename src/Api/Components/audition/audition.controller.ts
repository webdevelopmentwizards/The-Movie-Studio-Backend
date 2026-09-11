import { Response } from 'express';
import asyncHandler from '../../../helpers/async';
import AuditionRepo from './audition.repository';
import { AuditionStatus } from '../../../database';
import {
  isMailConfigured,
  sendAuditionStudioEmail,
  sendAuditionUserEmail,
} from '../../../services/mailService';
import {
  compressUploadedFile,
  safeUnlink,
} from '../../../services/media-compression.service';
import { uploadToMinio } from '../../../services/storage.service';
import Logger from '../../../core/Logger';

const AUDITION_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const AUDITION_MAX_PHOTO_BYTES = 10 * 1024 * 1024;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function writeProgress(res: Response, percent: number, stage: string) {
  res.write(JSON.stringify({ type: 'progress', percent, stage }) + '\n');
  const anyRes = res as Response & { flush?: () => void };
  anyRes.flush?.();
}

function writeError(res: Response, message: string) {
  if (!res.headersSent) {
    res.status(400);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
  }
  res.write(JSON.stringify({ type: 'error', message }) + '\n');
  res.end();
}

function beginNdjsonStream(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
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

    const cleanupInputs = async () => {
      await safeUnlink(...[video?.path, photo?.path].filter(Boolean) as string[]);
    };

    if (!firstName || !lastName) {
      await cleanupInputs();
      res.status(400).json({ type: 'error', message: 'First and last name are required.' });
      return;
    }
    if (!email || !isValidEmail(email)) {
      await cleanupInputs();
      res.status(400).json({ type: 'error', message: 'A valid email is required.' });
      return;
    }
    if (!video || !photo) {
      await cleanupInputs();
      res.status(400).json({ type: 'error', message: 'Video and photo are required.' });
      return;
    }
    if (video.size <= 0 || video.size > AUDITION_MAX_VIDEO_BYTES) {
      await cleanupInputs();
      res.status(400).json({ type: 'error', message: 'Video must be 100MB or smaller.' });
      return;
    }
    if (photo.size <= 0 || photo.size > AUDITION_MAX_PHOTO_BYTES) {
      await cleanupInputs();
      res.status(400).json({ type: 'error', message: 'Photo must be 10MB or smaller.' });
      return;
    }

    // Start streaming BEFORE heavy work (frontend parses NDJSON live)
    beginNdjsonStream(res);

    let submissionId: string | undefined;
    let cVideoPath: string | undefined;
    let cPhotoPath: string | undefined;

    try {
      writeProgress(res, 20, 'receiving');
      // Multer already finished writing temp files when handler runs
      writeProgress(res, 35, 'received');

      const submission = await AuditionRepo.create({
        firstName,
        lastName,
        email,
        status: AuditionStatus.PROCESSING,
        userId: req.user?.id || null,
      });
      submissionId = submission.id;

      writeProgress(res, 55, 'compressing_photo');
      const cPhoto = await compressUploadedFile(photo);
      cPhotoPath = cPhoto.path;

      writeProgress(res, 75, 'compressing_video');
      const cVideo = await compressUploadedFile(video);
      cVideoPath = cVideo.path;

      writeProgress(res, 90, 'storing');
      const [videoUpload, photoUpload] = await Promise.all([
        uploadToMinio(
          cVideo.path,
          'auditions/video',
          `video-${submission.id}.mp4`,
          cVideo.mimeType,
        ),
        uploadToMinio(
          cPhoto.path,
          'auditions/photo',
          `photo-${submission.id}.jpg`,
          cPhoto.mimeType,
        ),
      ]);

      await AuditionRepo.update(submission.id, {
        videoUrl: videoUpload.url,
        photoUrl: photoUpload.url,
        status: AuditionStatus.COMPLETED,
      });

      writeProgress(res, 95, 'email');
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
            `[Audition] Email failed for ${submission.id}: ${
              mailError instanceof Error ? mailError.message : mailError
            }`,
          );
        }
      } else {
        Logger.warn('[Audition] SMTP not configured; skipped emails.');
      }

      if (emailSent) {
        await AuditionRepo.update(submission.id, { emailSent: true }).catch(() => {});
      }

      res.write(
        JSON.stringify({
          type: 'done',
          percent: 100,
          data: {
            id: submission.id,
            firstName: submission.firstName,
            lastName: submission.lastName,
            email: submission.email,
            videoUrl: videoUpload.url,
            photoUrl: photoUpload.url,
            createdAt: submission.createdAt,
          },
        }) + '\n',
      );
      res.end();

      await safeUnlink(video.path, photo.path, cVideo.path, cPhoto.path);
      Logger.info(`[Audition] NDJSON stream completed for ${submission.id}`);
    } catch (err: any) {
      Logger.error(
        `[Audition] Stream failed${submissionId ? ` for ${submissionId}` : ''}: ${
          err?.message || err
        }`,
      );

      if (submissionId) {
        await AuditionRepo.update(submissionId, {
          status: AuditionStatus.FAILED,
          errorMessage: err?.message || 'Submission failed',
        }).catch(() => {});
      }

      if (!res.writableEnded) {
        writeError(res, err?.message || 'Submission failed.');
      }

      await safeUnlink(
        video.path,
        photo.path,
        ...(cVideoPath ? [cVideoPath] : []),
        ...(cPhotoPath ? [cPhotoPath] : []),
      );
    }
  });
}

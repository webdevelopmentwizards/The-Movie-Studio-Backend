import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs/promises';
import Logger from '../core/Logger';

export type CompressedMedia = {
  path: string;
  mimeType: string;
  originalName: string;
};

function outPath(inputPath: string, ext: string) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}.compressed${ext}`);
}

export async function compressImage(inputPath: string): Promise<CompressedMedia> {
  const output = outPath(inputPath, '.jpg');
  await sharp(inputPath)
    .rotate() // respect EXIF orientation
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toFile(output);

  Logger.info(`[Sharp] Image compressed: ${output}`);
  return { path: output, mimeType: 'image/jpeg', originalName: path.basename(output) };
}

export async function compressVideo(inputPath: string): Promise<CompressedMedia> {
  const output = outPath(inputPath, '.mp4');

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-crf 26',
        '-preset fast',
        '-c:a aac',
        '-b:a 128k',
        '-ar 44100',
        "-vf scale='min(1920,iw)':-2",
        '-movflags +faststart',
      ])
      .output(output)
      .on('start', (commandLine) => {
        Logger.info(`[FFmpeg] Started: ${commandLine}`);
      })
      .on('end', () => {
        Logger.info(`[FFmpeg] Video compressed: ${output}`);
        resolve();
      })
      .on('error', reject)
      .run();
  });

  return { path: output, mimeType: 'video/mp4', originalName: path.basename(output) };
}

/** Detect type and compress. Pass-through for non-image/video (e.g. docs, gif). */
export async function compressUploadedFile(file: {
  path: string;
  mimetype: string;
  originalname: string;
}): Promise<CompressedMedia> {
  if (file.mimetype.startsWith('image/') && file.mimetype !== 'image/gif') {
    return compressImage(file.path);
  }
  if (file.mimetype.startsWith('video/')) {
    return compressVideo(file.path);
  }
  return {
    path: file.path,
    mimeType: file.mimetype,
    originalName: file.originalname,
  };
}

export async function compressMany(
  files: Express.Multer.File[],
): Promise<CompressedMedia[]> {
  return Promise.all(files.map((f) => compressUploadedFile(f)));
}

export async function safeUnlink(...paths: string[]) {
  await Promise.all(
    paths.map(async (p) => {
      try {
        await fs.unlink(p);
      } catch {
        /* ignore */
      }
    }),
  );
}

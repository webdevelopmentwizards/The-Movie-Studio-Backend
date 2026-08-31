import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import Logger from '../core/Logger';

/**
 * Compresses video to 1080p max, H.264 CRF 26 with web streaming support (+faststart)
 */
export function compressVideo(
  inputPath: string,
  outputPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        '-crf 26',
        '-preset fast',
        '-c:a aac',
        '-b:a 128k',
        '-ar 44100',
        "-vf scale='min(1920,iw)':-2", // Downscales to 1080p max while preserving aspect ratio
        '-movflags +faststart',        // Essential: Enables instant web streaming
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        Logger.info(`[FFmpeg] Started: ${commandLine}`);
      })
      .on('error', (err) => {
        Logger.error(`[FFmpeg] Error: ${err instanceof Error ? err.message : err}`);
        reject(err);
      })
      .on('end', () => {
        Logger.info(`[FFmpeg] Video compression completed successfully: ${outputPath}`);
        resolve(outputPath);
      })
      .run();
  });
}

/**
 * Optimizes headshot image using Sharp (max 1600x1600, JPEG 82% progressive)
 */
export async function compressPhoto(
  inputPath: string,
  outputPath: string,
): Promise<string> {
  await sharp(inputPath)
    .resize({
      width: 1600,
      height: 1600,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({
      quality: 82,
      progressive: true,
      mozjpeg: true,
    })
    .toFile(outputPath);

  Logger.info(`[Sharp] Image compression completed successfully: ${outputPath}`);
  return outputPath;
}

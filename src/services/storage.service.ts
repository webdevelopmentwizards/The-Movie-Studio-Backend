import path from 'path';
import FileRepo from '../Api/Components/upload/file.repository';
import {
  compressMany,
  compressUploadedFile,
  safeUnlink,
  type CompressedMedia,
} from './media-compression.service';

export async function uploadToMinio(
  localFilePath: string,
  folder: string,
  destinationFileName?: string,
  contentType?: string,
): Promise<{ key: string; url: string; size: number; name: string; extension: string }> {
  const result = await FileRepo.uploadLocalFile(
    localFilePath,
    folder,
    contentType,
    destinationFileName,
  );
  return result;
}

/**
 * Compress then upload every file. Used by generic upload APIs.
 * Always cleans temp originals + compressed outputs.
 */
export async function processAndStoreUploads(
  files: Express.Multer.File[],
  folder: string,
  keyPrefix = 'file',
) {
  const compressed = await compressMany(files);
  const results: Awaited<ReturnType<typeof uploadToMinio>>[] = [];

  try {
    for (let i = 0; i < compressed.length; i++) {
      const item = compressed[i];
      const ext = path.extname(item.path) || path.extname(files[i].originalname);
      const destName = `${keyPrefix}-${Date.now()}-${i}${ext}`;
      const uploaded = await uploadToMinio(item.path, folder, destName, item.mimeType);
      results.push(uploaded);
    }
  } finally {
    const originalPaths = files.map((f) => f.path).filter(Boolean);
    const compressedPaths = compressed
      .map((c) => c.path)
      .filter((p, idx) => p && p !== files[idx]?.path);
    await safeUnlink(...originalPaths, ...compressedPaths);
  }

  return results;
}

/** Compress + store a single multer file (image/video/other). */
export async function processAndStoreUpload(
  file: Express.Multer.File,
  folder?: string,
) {
  let compressed: CompressedMedia | null = null;
  try {
    compressed = await compressUploadedFile(file);
    const result = await FileRepo.uploadLocalFile(
      compressed.path,
      folder,
      compressed.mimeType,
      file.originalname,
    );
    return result;
  } finally {
    const toClean = [file.path];
    if (compressed?.path && compressed.path !== file.path) {
      toClean.push(compressed.path);
    }
    await safeUnlink(...toClean);
  }
}

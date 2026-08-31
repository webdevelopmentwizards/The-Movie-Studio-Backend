import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { MINIO } from '../../../config/globals';

export default class FileRepo {
  private static client: Minio.Client | null = null;

  private static getClient(): Minio.Client {
    if (this.client) return this.client;

    this.client = new Minio.Client({
      endPoint: MINIO.endPoint,
      port: MINIO.port,
      useSSL: MINIO.useSSL,
      accessKey: MINIO.accessKey,
      secretKey: MINIO.secretKey,
    });

    return this.client;
  }

  private static getBucket(): string {
    return MINIO.bucket;
  }

  private static getPublicBaseUrl(): string {
    return MINIO.publicBaseUrl.replace(/\/$/, '');
  }

  private static generateKey(file: Express.Multer.File, folderOverride?: string) {
    const ext = path.extname(file.originalname).toLowerCase();
    let folder = folderOverride || 'general';

    if (!folderOverride) {
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        folder = 'images';
      } else if (['.mp4', '.mov', '.avi', '.mkv'].includes(ext)) {
        folder = 'videos';
      } else if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus'].includes(ext)) {
        folder = 'audios';
      } else if (['.pdf', '.doc', '.docx', '.xls', '.xlsx'].includes(ext)) {
        folder = 'documents';
      }
    }

    return `${folder}/${randomUUID()}${ext}`;
  }

  private static getPublicUrl(key: string): string {
    return `${this.getPublicBaseUrl()}/${key}`;
  }

  private static extractKey(identifier: string): string {
    if (!identifier.startsWith('http://') && !identifier.startsWith('https://')) {
      return identifier.replace(/^\/+/, '');
    }

    const url = new URL(identifier);
    const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const bucket = this.getBucket();

    if (pathname.startsWith(`${bucket}/`)) {
      return pathname.substring(bucket.length + 1);
    }

    const publicBase = this.getPublicBaseUrl();
    try {
      const publicPath = decodeURIComponent(new URL(publicBase).pathname).replace(/^\/+|\/+$/g, '');
      if (publicPath && pathname.startsWith(`${publicPath}/`)) {
        return pathname.substring(publicPath.length + 1);
      }
    } catch {
      // identifier is a URL; public base may be invalid only if env is wrong
    }

    return pathname;
  }

  public static async uploadFile(file: Express.Multer.File, folderOverride?: string) {
    const key = this.generateKey(file, folderOverride);

    await this.getClient().putObject(this.getBucket(), key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return {
      key,
      url: this.getPublicUrl(key),
      name: file.originalname,
      size: file.size,
      extension: key.split('.').pop() || '',
    };
  }

  public static async uploadLocalFile(
    localFilePath: string,
    folderOverride?: string,
    contentType?: string,
    originalFileName?: string,
  ) {
    const ext = path.extname(localFilePath).toLowerCase();
    const folder = folderOverride || 'general';
    const key = `${folder}/${randomUUID()}${ext}`;
    const fileStream = fs.createReadStream(localFilePath);
    const fileStat = fs.statSync(localFilePath);

    const detectedMime =
      contentType ||
      (ext === '.mp4'
        ? 'video/mp4'
        : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
        ? 'image/webp'
        : ext === '.png'
        ? 'image/png'
        : 'application/octet-stream');

    await this.getClient().putObject(this.getBucket(), key, fileStream, fileStat.size, {
      'Content-Type': detectedMime,
    });

    return {
      key,
      url: this.getPublicUrl(key),
      name: originalFileName || path.basename(localFilePath),
      size: fileStat.size,
      extension: ext.replace(/^\./, ''),
    };
  }

  public static async deleteFile(identifier: string) {
    const key = this.extractKey(identifier);

    await this.getClient().removeObject(this.getBucket(), key);

    return { key, message: 'File deleted successfully' };
  }

  public static async updateFile(file: Express.Multer.File, oldFileUrl?: string) {
    if (oldFileUrl) {
      await this.deleteFile(oldFileUrl);
    }
    return await this.uploadFile(file);
  }
}

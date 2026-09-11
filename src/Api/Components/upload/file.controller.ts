import { Response, Request } from 'express';
import asyncHandler from '../../../helpers/async';
import { SuccessResponse } from '../../../core/ApiResponse';
import FileRepo from './file.repository';
import { processAndStoreUpload } from '../../../services/storage.service';
import { safeUnlink } from '../../../services/media-compression.service';

export class FileController {
  upload = asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      return new SuccessResponse('No file uploaded', null).send(res);
    }

    try {
      const result = await processAndStoreUpload(req.file);
      new SuccessResponse('Uploaded successfully', result).send(res);
    } catch (error) {
      await safeUnlink(req.file.path);
      throw error;
    }
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.identifier) {
      return new SuccessResponse('File URL or key is required', null).send(res);
    }

    const result = await FileRepo.deleteFile(req.body.identifier);
    new SuccessResponse('Deleted successfully', result).send(res);
  });

  update = asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      return new SuccessResponse('No file uploaded', null).send(res);
    }

    try {
      const result = await processAndStoreUpload(req.file);
      if (req.body.oldFileUrl) {
        await FileRepo.deleteFile(req.body.oldFileUrl).catch(() => {});
      }
      new SuccessResponse('Updated successfully', result).send(res);
    } catch (error) {
      await safeUnlink(req.file.path);
      throw error;
    }
  });
}

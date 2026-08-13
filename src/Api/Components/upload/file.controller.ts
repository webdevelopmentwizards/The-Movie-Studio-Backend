import { Response, Request } from "express";
import asyncHandler from "../../../helpers/async";
import { SuccessResponse } from "../../../core/ApiResponse";
import FileRepo from "./file.repository";

export class FileController {
  upload = asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      return new SuccessResponse("No file uploaded", null).send(res);
    }

    const result = await FileRepo.uploadFile(req.file);
    new SuccessResponse("Uploaded successfully", result).send(res);
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.identifier) {
      return new SuccessResponse("File URL or key is required", null).send(res);
    }

    const result = await FileRepo.deleteFile(req.body.identifier);
    new SuccessResponse("Deleted successfully", result).send(res);
  });

  update = asyncHandler(async (req: any, res: Response) => {
    if (!req.file) {
      return new SuccessResponse("No file uploaded", null).send(res);
    }

    const result = await FileRepo.updateFile(req.file, req.body.oldFileUrl);
    new SuccessResponse("Updated successfully", result).send(res);
  });
}

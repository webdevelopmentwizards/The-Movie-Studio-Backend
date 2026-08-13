import { Router } from "express";
import { FileController } from "./file.controller";
import multer from "multer";
import authentication from "../../../middleware/authentication";

const upload = multer({ storage: multer.memoryStorage() });

export class FileRoutes {
  readonly router: Router = Router();
  readonly controller: FileController = new FileController();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post(
      "/upload",
      authentication,
      upload.single("file"),
      this.controller.upload
    );

    this.router.post(
      "/delete",
      authentication,
      this.controller.delete
    );

    this.router.put(
      "/update",
      authentication,
      upload.single("file"),
      this.controller.update
    );
  }
}

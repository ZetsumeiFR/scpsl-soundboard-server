import multer from "multer";
import path from "node:path";
import type { Request } from "express";
import { UPLOAD_CONFIG } from "../config/upload.js";

// File filter to check extension before processing
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions: string[] = [...UPLOAD_CONFIG.ALLOWED_EXTENSIONS];
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Extension non supportée. Extensions acceptées : ${UPLOAD_CONFIG.ALLOWED_EXTENSIONS.join(", ")}`
      )
    );
  }
};

// Configure multer with memory storage
export const uploadSound = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
  },
  fileFilter,
}).single("audio");

// Error handler wrapper for multer errors
export function handleMulterError(
  err: Error,
  _req: Request,
  res: import("express").Response,
  next: import("express").NextFunction
) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: `Le fichier dépasse la taille maximale de ${UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024} Mo`,
        },
      });
    }
    return res.status(400).json({
      error: {
        code: "UPLOAD_ERROR",
        message: err.message,
      },
    });
  }

  if (err) {
    return res.status(400).json({
      error: {
        code: "UPLOAD_ERROR",
        message: err.message,
      },
    });
  }

  next();
}

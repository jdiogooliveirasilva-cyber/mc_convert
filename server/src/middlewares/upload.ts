import multer from "multer";

// In-memory storage: worlds are processed entirely in RAM and never written
// to disk.
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB

export const worldUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

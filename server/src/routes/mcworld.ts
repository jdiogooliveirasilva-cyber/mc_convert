import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { worldUpload } from "../middlewares/upload.js";
import { convertWorldToMcworld } from "../lib/mcworld/convert.js";

const router: IRouter = Router();

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  worldUpload.single("world")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error:
          "O arquivo enviado é muito grande. Compacte apenas a pasta do mundo, sem backups extras.",
      });
      return;
    }

    console.error("Upload failed before conversion could start", err);
    res.status(400).json({
      error: "Não foi possível processar o upload. Tente novamente.",
    });
  });
}

/**
 * POST /api/mcworld/convert
 *
 * Accepts a single multipart field named "world" containing either:
 * - A ZIP file the user exported from a Bedrock world folder, or
 * - A ZIP built client-side from a raw folder selection/drop.
 *
 * On success: responds with the generated .mcworld binary. The JSON
 * conversion report (errors/warnings/fixes/preview/addon detection) is
 * base64 encoded into the `X-Conversion-Report` response header so the
 * client can read both the file and the report from a single request.
 *
 * On failure (structurally invalid world): responds 422 with a JSON body
 * containing the report so the UI can show detailed error messages.
 */
router.post("/mcworld/convert", handleUpload, async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({
      error: 'Nenhum arquivo foi enviado. Envie um arquivo .zip no campo "world".',
    });
    return;
  }

  try {
    const result = await convertWorldToMcworld(file.buffer);

    if (!result.report.valid || !result.archive || !result.fileName) {
      res.status(422).json({ report: result.report });
      return;
    }

    const reportBase64 = Buffer.from(JSON.stringify(result.report), "utf8").toString("base64");

    res.status(200);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.fileName)}"`,
    );
    res.setHeader("X-Conversion-Report", reportBase64);
    res.setHeader("Access-Control-Expose-Headers", "X-Conversion-Report, Content-Disposition");
    res.send(result.archive);
  } catch (err) {
    console.error("Failed to convert Minecraft world", err);
    res.status(500).json({
      error:
        "Ocorreu um erro inesperado ao processar o mundo. Tente novamente ou verifique se o arquivo não está corrompido.",
    });
  }
});

export default router;

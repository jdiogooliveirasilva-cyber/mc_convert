import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import mcworldRouter from "./routes/mcworld.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawPort = process.env["PORT"];
const port = rawPort ? Number(rawPort) : 3000;

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const app: Express = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes (binary upload/download, kept as raw Express routes — see
// routes/mcworld.ts for details).
app.use("/api", mcworldRouter);

// Serve the built frontend (produced by `npm run build` in ../client, which
// outputs directly into ./public). Everything that isn't an API route falls
// through to index.html so client-side routing keeps working on refresh.
const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Conversor de Mundos Bedrock ouvindo na porta ${port}`);
});

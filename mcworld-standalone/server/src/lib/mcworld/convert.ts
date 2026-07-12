/**
 * Core logic for validating, auto-fixing, and repackaging a Minecraft
 * Bedrock world folder/ZIP into a compatible `.mcworld` archive.
 *
 * Design principles:
 * - Never touch the bytes of world data files (level.dat, level.dat_old,
 *   anything inside db/, or any addon/pack file). Only structural fixes are
 *   allowed: stripping an extra wrapping folder, merging sibling addon
 *   folders into the world, dropping OS junk files, and — only when a
 *   required companion file is entirely missing — regenerating it from data
 *   that already exists inside the world (e.g. levelname.txt from the
 *   LevelName NBT tag).
 * - Never delete any world or addon file. Structurally suspicious pack
 *   folders (e.g. missing manifest.json) are still kept in the output; we
 *   only warn about them.
 * - Never attempt to convert a world between Bedrock versions. We only
 *   detect and report when a world appears to use Preview/Beta-exclusive
 *   features; we do not strip or rewrite those features.
 * - Behavior/Resource Pack detection: worlds reference their installed
 *   packs by UUID + version in `world_behavior_packs.json` /
 *   `world_resource_packs.json`. Those files are never parsed-and-rewritten
 *   — only read for cross-checking — so any UUID/version they contain is
 *   preserved byte-for-byte in the output.
 */

import JSZip from "jszip";
import { parseLevelDat, nbtStorageVersion, type NbtCompound } from "./nbt.js";

const JUNK_DIR_NAMES = new Set(["__MACOSX", ".git", ".idea", ".vscode"]);
const JUNK_FILE_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

interface ZipEntryRef {
  path: string;
  entry: JSZip.JSZipObject;
}

function isJunkPath(relPath: string): boolean {
  const segments = relPath.split("/");
  const base = segments[segments.length - 1] ?? "";
  if (segments.some((seg) => JUNK_DIR_NAMES.has(seg))) return true;
  if (JUNK_FILE_NAMES.has(base)) return true;
  if (base.startsWith("._")) return true; // AppleDouble resource forks
  return false;
}

// A curated list of Bedrock "experiments" toggle keys that, as of writing,
// only ship in the Preview/Beta channel ahead of a stable release. This is
// a heuristic, not a guarantee — Mojang periodically promotes experiments
// to stable, and new ones appear over time. We only use this to *warn*
// users, never to alter the world.
const PREVIEW_ONLY_EXPERIMENT_HINTS = [
  "creators_experimental",
  "experimental_creator_cameras",
  "upcoming_creator_features",
  "next_major_update",
  "y_2025_drop_3",
  "y_2025_drop_2",
  "gametest",
  "experimental_molang_features",
  "gametest_extensions",
];

function findEntries(zip: JSZip): ZipEntryRef[] {
  const out: ZipEntryRef[] = [];
  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    out.push({ path: relPath.replace(/\\/g, "/"), entry });
  });
  return out;
}

/** Strip the trailing slash and last path segment from a directory prefix. */
function parentPrefixOf(prefix: string): string {
  const trimmed = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  if (trimmed.length === 0) return "";
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? "" : trimmed.slice(0, idx + 1);
}

/**
 * Locate `level.dat` anywhere in the archive (at the root, nested inside one
 * or more wrapping folders, or alongside sibling addon folders) instead of
 * relying on a whole-zip common-prefix scan. This is robust to zips that
 * bundle the world together with separate `behavior_packs/`/`resource_packs/`
 * folders at the same level — a common packaging pattern that previously
 * broke root detection entirely.
 */
function locateWorldRoot(paths: string[]): {
  worldRootPrefix: string | null;
  ambiguous: boolean;
} {
  const candidates = paths.filter(
    (p) => p === "level.dat" || p.endsWith("/level.dat"),
  );
  if (candidates.length === 0) return { worldRootPrefix: null, ambiguous: false };

  candidates.sort((a, b) => a.split("/").length - b.split("/").length);
  const shallowestDepth = candidates[0]!.split("/").length;
  const shallowest = candidates.filter(
    (p) => p.split("/").length === shallowestDepth,
  );

  const chosen = shallowest[0]!;
  const worldRootPrefix = chosen === "level.dat" ? "" : chosen.slice(0, -"level.dat".length);
  return {
    worldRootPrefix,
    ambiguous: candidates.length > 1,
  };
}

function extractLevelName(nbt: NbtCompound): string | null {
  const v = nbt["LevelName"];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function detectPreviewIndicators(nbt: NbtCompound): string[] {
  const indicators: string[] = [];

  const experiments = nbt["experiments"];
  if (experiments && typeof experiments === "object" && !Array.isArray(experiments)) {
    for (const key of PREVIEW_ONLY_EXPERIMENT_HINTS) {
      const val = (experiments as NbtCompound)[key];
      if (val === 1) {
        indicators.push(`Experimento ativo possivelmente exclusivo do Preview: "${key}"`);
      }
    }
  }

  const packageId = nbt["lastOpenedWithPackageId"];
  if (typeof packageId === "string" && /beta|preview/i.test(packageId)) {
    indicators.push(`O mundo foi aberto pela última vez pelo pacote "${packageId}"`);
  }

  const editorWorldType = nbt["editorWorldType"];
  if (typeof editorWorldType === "number" && editorWorldType !== 0) {
    indicators.push("O mundo contém metadados do modo Editor (recurso experimental)");
  }

  return indicators;
}

function sanitizeWorldFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned : "world";
}

function formatVersion(version: unknown): string | null {
  if (Array.isArray(version)) return version.join(".");
  if (typeof version === "string" || typeof version === "number") return String(version);
  return null;
}

function versionsEqual(a: unknown, b: unknown): boolean {
  const fa = formatVersion(a);
  const fb = formatVersion(b);
  if (fa === null || fb === null) return false;
  return fa === fb;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PackFolder {
  /** e.g. "behavior_packs" or "resource_packs" */
  kind: "behavior" | "resource";
  /** Immediate folder name under behavior_packs/resource_packs. */
  folderName: string;
  /** Path prefix of this pack folder relative to the (new) world root. */
  prefix: string;
  uuid: string | null;
  version: unknown;
  name: string | null;
  hasValidManifest: boolean;
}

interface PackReference {
  uuid: string;
  version: unknown;
}

async function readManifestPacks(
  kind: "behavior" | "resource",
  topDir: "behavior_packs" | "resource_packs",
  outputEntries: Map<string, JSZip.JSZipObject>,
): Promise<PackFolder[]> {
  const folderNames = new Set<string>();
  const topPrefix = `${topDir}/`;
  for (const key of outputEntries.keys()) {
    if (!key.startsWith(topPrefix)) continue;
    const rest = key.slice(topPrefix.length);
    const firstSeg = rest.split("/")[0];
    if (firstSeg) folderNames.add(firstSeg);
  }

  const packs: PackFolder[] = [];
  for (const folderName of folderNames) {
    const prefix = `${topPrefix}${folderName}/`;
    const manifestEntry = outputEntries.get(`${prefix}manifest.json`);

    let uuid: string | null = null;
    let version: unknown = null;
    let name: string | null = null;
    let hasValidManifest = false;

    if (manifestEntry) {
      try {
        const raw = await manifestEntry.async("text");
        const manifest = JSON.parse(raw) as {
          header?: { uuid?: unknown; version?: unknown; name?: unknown };
        };
        const header = manifest.header;
        if (header && typeof header.uuid === "string") {
          uuid = header.uuid;
          hasValidManifest = UUID_RE.test(header.uuid);
        }
        if (header && header.version !== undefined) {
          version = header.version;
        }
        if (header && typeof header.name === "string") {
          name = header.name;
        }
      } catch {
        // Malformed manifest.json — keep the files, just flag as invalid below.
      }
    }

    packs.push({ kind, folderName, prefix, uuid, version, name, hasValidManifest });
  }

  return packs;
}

async function readPackReferences(
  fileName: "world_behavior_packs.json" | "world_resource_packs.json",
  worldEntries: Map<string, JSZip.JSZipObject>,
): Promise<{ refs: PackReference[]; malformed: boolean; present: boolean }> {
  const entry = worldEntries.get(fileName);
  if (!entry) return { refs: [], malformed: false, present: false };

  try {
    const raw = await entry.async("text");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return { refs: [], malformed: true, present: true };
    const refs: PackReference[] = [];
    for (const item of data) {
      if (item && typeof item === "object" && typeof item.pack_id === "string") {
        refs.push({ uuid: item.pack_id, version: item.version });
      }
    }
    return { refs, malformed: false, present: true };
  } catch {
    return { refs: [], malformed: true, present: true };
  }
}

export interface AddonInfo {
  type: "behavior" | "resource";
  folderName: string;
  uuid: string | null;
  version: string | null;
  name: string | null;
  hasValidManifest: boolean;
  status: "used" | "unused";
  /** True when the world references a different version than the one found. */
  versionMismatch: boolean;
}

export interface MissingAddon {
  type: "behavior" | "resource";
  uuid: string;
  version: string | null;
}

export interface AddonsReport {
  usesBehaviorPacks: boolean;
  usesResourcePacks: boolean;
  behaviorPacks: AddonInfo[];
  resourcePacks: AddonInfo[];
  missing: MissingAddon[];
  /**
   * True when the world references at least one pack but the upload
   * contained no pack folders at all (neither nested inside the world nor
   * as sibling behavior_packs/resource_packs directories) — i.e. the user
   * only uploaded the world folder itself.
   */
  worldOnlyUpload: boolean;
}

export interface ConversionReport {
  valid: boolean;
  worldName: string | null;
  errors: string[];
  warnings: string[];
  fixesApplied: string[];
  preview: {
    isLikelyPreview: boolean;
    indicators: string[];
  };
  addons: AddonsReport;
  stats: {
    totalFiles: number;
    totalBytes: number;
    strippedPrefix: string | null;
    junkFilesRemoved: number;
  };
}

export interface ConvertResult {
  report: ConversionReport;
  archive: Buffer | null;
  fileName: string | null;
}

const EMPTY_ADDONS: AddonsReport = {
  usesBehaviorPacks: false,
  usesResourcePacks: false,
  behaviorPacks: [],
  resourcePacks: [],
  missing: [],
  worldOnlyUpload: false,
};

export async function convertWorldToMcworld(zipBuffer: Buffer): Promise<ConvertResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fixesApplied: string[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    return {
      report: {
        valid: false,
        worldName: null,
        errors: [
          "Não foi possível abrir o arquivo enviado como um ZIP válido. " +
            "Verifique se o upload não foi interrompido e tente novamente.",
        ],
        warnings: [],
        fixesApplied: [],
        preview: { isLikelyPreview: false, indicators: [] },
        addons: EMPTY_ADDONS,
        stats: { totalFiles: 0, totalBytes: 0, strippedPrefix: null, junkFilesRemoved: 0 },
      },
      archive: null,
      fileName: null,
    };
  }

  const allEntries = findEntries(zip);
  const junkEntries = allEntries.filter((e) => isJunkPath(e.path));
  const keptEntries = allEntries.filter((e) => !isJunkPath(e.path));

  if (keptEntries.length === 0) {
    return {
      report: {
        valid: false,
        worldName: null,
        errors: ["O arquivo enviado está vazio ou contém apenas arquivos de sistema."],
        warnings: [],
        fixesApplied: [],
        preview: { isLikelyPreview: false, indicators: [] },
        addons: EMPTY_ADDONS,
        stats: {
          totalFiles: 0,
          totalBytes: 0,
          strippedPrefix: null,
          junkFilesRemoved: junkEntries.length,
        },
      },
      archive: null,
      fileName: null,
    };
  }

  const paths = keptEntries.map((e) => e.path);
  const { worldRootPrefix, ambiguous } = locateWorldRoot(paths);

  if (worldRootPrefix === null) {
    return {
      report: {
        valid: false,
        worldName: null,
        errors: [
          'Arquivo obrigatório "level.dat" não foi encontrado em nenhum lugar do arquivo enviado. Confirme que você selecionou a pasta correta do mundo (ela deve conter level.dat, levelname.txt e a pasta db).',
        ],
        warnings: [],
        fixesApplied: [],
        preview: { isLikelyPreview: false, indicators: [] },
        addons: EMPTY_ADDONS,
        stats: {
          totalFiles: 0,
          totalBytes: 0,
          strippedPrefix: null,
          junkFilesRemoved: junkEntries.length,
        },
      },
      archive: null,
      fileName: null,
    };
  }

  if (ambiguous) {
    warnings.push(
      "Foram encontrados múltiplos arquivos level.dat no upload, o que sugere que mais de um mundo foi enviado junto. Apenas o mundo na pasta mais externa foi convertido.",
    );
  }

  if (worldRootPrefix.length > 0) {
    fixesApplied.push(
      `Detectamos uma pasta extra dentro do arquivo ("${worldRootPrefix.replace(/\/$/, "")}") e a estrutura foi corrigida automaticamente.`,
    );
  }

  // Files that live inside the world root (this already includes any
  // behavior_packs/resource_packs folders nested directly inside the world).
  const worldRelative: ZipEntryRef[] = keptEntries
    .filter(({ path }) => path.startsWith(worldRootPrefix))
    .map(({ path, entry }) => ({ path: path.slice(worldRootPrefix.length), entry }))
    .filter(({ path }) => path.length > 0);

  const worldRelativePaths = new Set(worldRelative.map((e) => e.path));

  const hasLevelDat = worldRelativePaths.has("level.dat");
  const dbFiles = worldRelative.filter((e) => e.path.startsWith("db/") && e.path !== "db/");
  const hasLevelName = worldRelativePaths.has("levelname.txt");

  if (!hasLevelDat) {
    errors.push(
      'Arquivo obrigatório "level.dat" não foi encontrado. Confirme que você selecionou a pasta correta do mundo (ela deve conter level.dat, levelname.txt e a pasta db diretamente dentro dela).',
    );
  }

  if (dbFiles.length === 0) {
    errors.push(
      'Pasta obrigatória "db" não foi encontrada ou está vazia. Essa pasta contém os dados do mundo (formato LevelDB) — sem ela, o mundo não pode ser importado.',
    );
  }

  if (errors.length > 0) {
    return {
      report: {
        valid: false,
        worldName: null,
        errors,
        warnings,
        fixesApplied,
        preview: { isLikelyPreview: false, indicators: [] },
        addons: EMPTY_ADDONS,
        stats: {
          totalFiles: worldRelative.length,
          totalBytes: 0,
          strippedPrefix: worldRootPrefix || null,
          junkFilesRemoved: junkEntries.length,
        },
      },
      archive: null,
      fileName: null,
    };
  }

  // Detect sibling behavior_packs/resource_packs folders — i.e. addon
  // folders packaged next to (not inside) the world folder. This is the
  // scenario that previously broke conversion entirely: users often export
  // the world together with the addons it depends on as sibling folders.
  const parentPrefix = parentPrefixOf(worldRootPrefix);
  const siblingBehaviorEntries: ZipEntryRef[] = [];
  const siblingResourceEntries: ZipEntryRef[] = [];

  for (const { path, entry } of keptEntries) {
    if (path.startsWith(worldRootPrefix)) continue; // already handled above
    if (!path.startsWith(parentPrefix)) continue;
    const remainder = path.slice(parentPrefix.length);
    const firstSlash = remainder.indexOf("/");
    if (firstSlash === -1) continue; // a loose file next to the world, not a pack folder
    const firstSeg = remainder.slice(0, firstSlash);
    const rest = remainder.slice(firstSlash + 1);
    if (rest.length === 0) continue;
    const segLower = firstSeg.toLowerCase();
    if (segLower === "behavior_packs") {
      siblingBehaviorEntries.push({ path: rest, entry });
    } else if (segLower === "resource_packs") {
      siblingResourceEntries.push({ path: rest, entry });
    }
  }

  const foundSiblingPacks = siblingBehaviorEntries.length > 0 || siblingResourceEntries.length > 0;

  // Merge everything into the final output map (rel path -> zip entry).
  // World-relative entries are added first so they win over sibling entries
  // in the unlikely case of a path collision.
  const outputEntries = new Map<string, JSZip.JSZipObject>();
  for (const { path, entry } of worldRelative) {
    if (!outputEntries.has(path)) outputEntries.set(path, entry);
  }
  for (const { path, entry } of siblingBehaviorEntries) {
    const key = `behavior_packs/${path}`;
    if (!outputEntries.has(key)) outputEntries.set(key, entry);
  }
  for (const { path, entry } of siblingResourceEntries) {
    const key = `resource_packs/${path}`;
    if (!outputEntries.has(key)) outputEntries.set(key, entry);
  }

  if (foundSiblingPacks) {
    fixesApplied.push(
      "Foram detectadas pastas de addons (behavior_packs/resource_packs) ao lado da pasta do mundo enviada; elas foram mescladas automaticamente dentro do pacote .mcworld gerado.",
    );
  }

  const behaviorPackFolders = await readManifestPacks("behavior", "behavior_packs", outputEntries);
  const resourcePackFolders = await readManifestPacks("resource", "resource_packs", outputEntries);

  for (const pack of [...behaviorPackFolders, ...resourcePackFolders]) {
    if (!pack.hasValidManifest) {
      const kindLabel = pack.kind === "behavior" ? "Behavior Pack" : "Resource Pack";
      warnings.push(
        `A pasta "${pack.kind === "behavior" ? "behavior_packs" : "resource_packs"}/${pack.folderName}" não contém um manifest.json válido e pode não funcionar como um ${kindLabel}. Os arquivos foram mantidos no pacote, mas verifique se essa pasta realmente é um addon do Minecraft.`,
      );
    }
  }

  const worldEntriesMap = new Map(worldRelative.map((e) => [e.path, e.entry]));
  const behaviorRefsResult = await readPackReferences("world_behavior_packs.json", worldEntriesMap);
  const resourceRefsResult = await readPackReferences("world_resource_packs.json", worldEntriesMap);

  if (behaviorRefsResult.malformed) {
    warnings.push(
      'O arquivo "world_behavior_packs.json" não pôde ser interpretado; ele foi mantido no arquivo final sem alterações, mas não foi possível validar quais Behavior Packs o mundo espera.',
    );
  }
  if (resourceRefsResult.malformed) {
    warnings.push(
      'O arquivo "world_resource_packs.json" não pôde ser interpretado; ele foi mantido no arquivo final sem alterações, mas não foi possível validar quais Resource Packs o mundo espera.',
    );
  }

  const missing: MissingAddon[] = [];

  function crossCheck(
    refs: PackReference[],
    packFolders: PackFolder[],
    type: "behavior" | "resource",
  ): AddonInfo[] {
    const usedFolderNames = new Set<string>();

    const mismatchedFolderNames = new Set<string>();

    for (const ref of refs) {
      const match = packFolders.find((p) => p.uuid === ref.uuid);
      if (!match) {
        // Not pushed to the generic `warnings` list — this is already
        // surfaced in a dedicated, less alarming way via `addons.missing`
        // in the UI, so duplicating it as a big warning banner would just
        // repeat the same message twice on screen.
        missing.push({ type, uuid: ref.uuid, version: formatVersion(ref.version) });
        continue;
      }
      usedFolderNames.add(match.folderName);
      if (!versionsEqual(match.version, ref.version)) {
        // Same reasoning: surfaced per-pack via `versionMismatch` instead of
        // a duplicate warning banner.
        mismatchedFolderNames.add(match.folderName);
      }
    }

    return packFolders.map((p) => ({
      type: p.kind,
      folderName: p.folderName,
      uuid: p.uuid,
      version: formatVersion(p.version),
      name: p.name,
      hasValidManifest: p.hasValidManifest,
      status: usedFolderNames.has(p.folderName) ? "used" : "unused",
      versionMismatch: mismatchedFolderNames.has(p.folderName),
    }));
  }

  const behaviorAddonInfos = crossCheck(behaviorRefsResult.refs, behaviorPackFolders, "behavior");
  const resourceAddonInfos = crossCheck(resourceRefsResult.refs, resourcePackFolders, "resource");

  const usesBehaviorPacks = behaviorRefsResult.refs.length > 0 || behaviorPackFolders.length > 0;
  const usesResourcePacks = resourceRefsResult.refs.length > 0 || resourcePackFolders.length > 0;

  const worldOnlyUpload =
    (usesBehaviorPacks || usesResourcePacks) &&
    behaviorPackFolders.length === 0 &&
    resourcePackFolders.length === 0 &&
    missing.length > 0;

  if (!worldOnlyUpload && (behaviorPackFolders.length > 0 || resourcePackFolders.length > 0)) {
    fixesApplied.push(
      `Foram detectados e mantidos ${behaviorPackFolders.length} Behavior Pack(s) e ${resourcePackFolders.length} Resource Pack(s) junto com o mundo.`,
    );
  }

  let nbt: NbtCompound | null = null;
  let worldNameFromNbt: string | null = null;
  const previewIndicators: string[] = [];

  const levelDatEntry = outputEntries.get("level.dat")!;
  try {
    const levelDatBuffer = await levelDatEntry.async("nodebuffer");
    const version = nbtStorageVersion(levelDatBuffer);
    nbt = parseLevelDat(levelDatBuffer);
    worldNameFromNbt = extractLevelName(nbt);
    previewIndicators.push(...detectPreviewIndicators(nbt));
    if (version !== null && version < 0) {
      warnings.push("O campo de versão de armazenamento em level.dat parece incomum.");
    }
  } catch {
    warnings.push(
      "Não foi possível interpretar os metadados internos de level.dat, mas o arquivo binário será mantido intacto e incluído sem nenhuma alteração.",
    );
  }

  let levelNameContent: string | null = null;
  if (!hasLevelName) {
    if (worldNameFromNbt) {
      levelNameContent = worldNameFromNbt;
      fixesApplied.push(
        `Arquivo "levelname.txt" estava ausente e foi recriado automaticamente a partir do nome salvo dentro de level.dat ("${worldNameFromNbt}").`,
      );
    } else {
      levelNameContent = "Imported World";
      warnings.push(
        'Arquivo "levelname.txt" estava ausente e não foi possível recuperar o nome original a partir de level.dat. Um nome genérico ("Imported World") foi usado — você pode renomear o mundo depois de importá-lo no jogo.',
      );
    }
  }

  const finalWorldName = worldNameFromNbt ?? "Imported World";

  if (junkEntries.length > 0) {
    fixesApplied.push(
      `${junkEntries.length} arquivo(s) de sistema irrelevante(s) (ex: .DS_Store, Thumbs.db, __MACOSX) foram removidos.`,
    );
  }

  const outZip = new JSZip();
  let totalBytes = 0;

  for (const [path, entry] of outputEntries) {
    const content = await entry.async("nodebuffer");
    totalBytes += content.length;
    outZip.file(path, content, { binary: true });
  }

  if (levelNameContent !== null) {
    const buf = Buffer.from(levelNameContent, "utf8");
    totalBytes += buf.length;
    outZip.file("levelname.txt", buf);
  }

  const archive = await outZip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const report: ConversionReport = {
    valid: true,
    worldName: finalWorldName,
    errors: [],
    warnings,
    fixesApplied,
    preview: {
      isLikelyPreview: previewIndicators.length > 0,
      indicators: previewIndicators,
    },
    addons: {
      usesBehaviorPacks,
      usesResourcePacks,
      behaviorPacks: behaviorAddonInfos,
      resourcePacks: resourceAddonInfos,
      missing,
      worldOnlyUpload,
    },
    stats: {
      totalFiles: outputEntries.size + (levelNameContent !== null ? 1 : 0),
      totalBytes,
      strippedPrefix: worldRootPrefix || null,
      junkFilesRemoved: junkEntries.length,
    },
  };

  const fileName = `${sanitizeWorldFileName(finalWorldName)}.mcworld`;

  return { report, archive, fileName };
}

/**
 * Core (non-React) logic for the Bedrock world -> .mcworld converter.
 *
 * This talks directly to a raw Express endpoint (`POST /api/mcworld/convert`)
 * served by the shared API server. That endpoint accepts multipart/form-data
 * and returns a binary `.mcworld` archive with a base64-encoded JSON report
 * in the `X-Conversion-Report` header. This endpoint is intentionally NOT
 * part of the generated OpenAPI client — binary upload/download doesn't fit
 * the JSON-oriented codegen — so this module owns the fetch/XHR wiring
 * instead of `@workspace/api-client-react`.
 *
 * Do not add any other API call pattern here; this is the single source of
 * truth for talking to the conversion endpoint.
 */

// The shared API server always serves under the fixed "/api" prefix (see
// lib/api-spec/openapi.yaml `servers`), regardless of which artifact is
// serving the current page — the shared proxy routes it to the right
// service. This is a cross-artifact call, not a same-artifact route, so it
// must NOT be prefixed with this app's own BASE_URL.
const CONVERT_ENDPOINT = '/api/mcworld/convert';

export interface AddonInfo {
  type: 'behavior' | 'resource';
  folderName: string;
  uuid: string | null;
  version: string | null;
  name: string | null;
  hasValidManifest: boolean;
  status: 'used' | 'unused';
  versionMismatch: boolean;
}

export interface MissingAddon {
  type: 'behavior' | 'resource';
  uuid: string;
  version: string | null;
}

export interface AddonsReport {
  usesBehaviorPacks: boolean;
  usesResourcePacks: boolean;
  behaviorPacks: AddonInfo[];
  resourcePacks: AddonInfo[];
  missing: MissingAddon[];
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

export interface PickedFile {
  file: File;
  /** Path relative to the folder the user selected/dropped, using "/" separators. */
  relativePath: string;
}

export interface ConvertSuccess {
  kind: 'success';
  report: ConversionReport;
  blob: Blob;
  fileName: string;
}

export interface ConvertFailure {
  kind: 'failure';
  /** Present when the server returned a structured 422 report (invalid world). */
  report: ConversionReport | null;
  /** Human-readable message for network errors / unexpected 400/500 responses. */
  message: string;
}

export type ConvertOutcome = ConvertSuccess | ConvertFailure;

/**
 * Recursively walk a `DataTransferItemList` from a drag-and-drop event,
 * collecting every file with its path relative to whatever was dropped
 * (a single file, a single folder, or multiple files/folders at once —
 * including a world folder dropped together with addon folders).
 */
export async function collectFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<PickedFile[]> {
  const results: PickedFile[] = [];

  async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
      results.push({ file, relativePath: `${prefix}${entry.name}` });
      return;
    }

    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const entries: FileSystemEntry[] = [];
      // readEntries must be called repeatedly until it returns an empty
      // array — a single call is not guaranteed to return everything.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (batch.length === 0) break;
        entries.push(...batch);
      }
      for (const child of entries) {
        await walkEntry(child, `${prefix}${entry.name}/`);
      }
    }
  }

  const entries: FileSystemEntry[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entry = item?.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  for (const entry of entries) {
    await walkEntry(entry, '');
  }

  return results;
}

/** Convert a `FileList` from a `<input webkitdirectory multiple>` picker. */
export function collectFilesFromFileList(fileList: FileList): PickedFile[] {
  const results: PickedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!file) continue;
    const withRelPath = file as File & { webkitRelativePath?: string };
    results.push({
      file,
      relativePath:
        withRelPath.webkitRelativePath && withRelPath.webkitRelativePath.length > 0
          ? withRelPath.webkitRelativePath
          : file.name,
    });
  }
  return results;
}

/** True when the picked items are best treated as "one zip file". */
export function isSingleZipFile(files: PickedFile[]): boolean {
  return (
    files.length === 1 &&
    /\.zip$/i.test(files[0]!.file.name) &&
    !files[0]!.relativePath.includes('/')
  );
}

/**
 * Build a ZIP in the browser from a set of picked files, preserving their
 * relative folder structure exactly as selected/dropped — including any
 * sibling behavior_packs/resource_packs folders the user dropped alongside
 * the world folder. Used when the user picks or drops a raw folder
 * selection instead of a pre-made .zip.
 */
export async function buildZipFromFiles(
  files: PickedFile[],
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const { file, relativePath } of files) {
    zip.file(relativePath, file);
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, (metadata) => {
    onProgress?.(metadata.percent / 100);
  });
}

function decodeReportHeader(base64: string | null): ConversionReport | null {
  if (!base64) return null;
  try {
    // atob() only yields a Latin1 binary string; the report was UTF-8 encoded
    // on the server (accented Portuguese text), so we must reinterpret those
    // raw bytes as UTF-8 instead of feeding the Latin1 string straight into
    // JSON.parse (which mangles accented characters into mojibake).
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(json) as ConversionReport;
  } catch {
    return null;
  }
}

function parseFileNameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^";]+)"?/i.exec(header);
  if (!match || !match[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Upload a world ZIP blob to the conversion endpoint. Reports upload
 * progress via `onUploadProgress` (0-1). Resolves with a discriminated
 * union so callers never need to guess whether the request "worked" at the
 * HTTP level vs. produced a valid world.
 */
export function uploadWorldZip(
  zipBlob: Blob,
  fileName: string,
  onUploadProgress?: (fraction: number) => void,
): Promise<ConvertOutcome> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', CONVERT_ENDPOINT);
    xhr.responseType = 'arraybuffer';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress?.(event.loaded / event.total);
      }
    };

    xhr.onerror = () => {
      resolve({
        kind: 'failure',
        report: null,
        message: 'Falha de rede ao enviar o arquivo. Verifique sua conexão e tente novamente.',
      });
    };

    xhr.onload = () => {
      const status = xhr.status;
      const buffer = xhr.response as ArrayBuffer;

      if (status >= 200 && status < 300) {
        const report = decodeReportHeader(xhr.getResponseHeader('X-Conversion-Report'));
        const downloadName =
          parseFileNameFromContentDisposition(xhr.getResponseHeader('Content-Disposition')) ??
          'world.mcworld';

        if (!report) {
          resolve({
            kind: 'failure',
            report: null,
            message: 'O servidor respondeu sem um relatório de conversão válido.',
          });
          return;
        }

        resolve({
          kind: 'success',
          report,
          blob: new Blob([buffer], { type: 'application/octet-stream' }),
          fileName: downloadName,
        });
        return;
      }

      // Error responses are JSON, not binary — decode the array buffer as text.
      let message = `O servidor retornou um erro (HTTP ${status}).`;
      let report: ConversionReport | null = null;
      try {
        const text = new TextDecoder('utf-8').decode(buffer);
        const data = JSON.parse(text) as { error?: string; report?: ConversionReport };
        if (data.report) {
          report = data.report;
          message = 'O mundo enviado não pôde ser convertido.';
        } else if (data.error) {
          message = data.error;
        }
      } catch {
        // keep default message
      }

      resolve({ kind: 'failure', report, message });
    };

    const formData = new FormData();
    formData.append('world', zipBlob, fileName);
    xhr.send(formData);
  });
}

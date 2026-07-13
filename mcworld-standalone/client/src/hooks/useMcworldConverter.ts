import { useCallback, useRef, useState } from 'react';
import {
  buildZipFromFiles,
  collectFilesFromDataTransfer,
  collectFilesFromFileList,
  isSingleZipFile,
  uploadWorldZip,
  type ConversionReport,
  type PickedFile,
} from '@/lib/mcworldConverter';

export type ConverterPhase =
  | 'idle'
  | 'reading'
  | 'zipping'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error';

export interface ConverterState {
  phase: ConverterPhase;
  /** 0-100 overall progress. Only meaningful during reading/zipping/uploading. */
  progress: number;
  report: ConversionReport | null;
  errorMessage: string | null;
  resultFileName: string | null;
  /** Name of whatever the user selected (zip file name, or folder name). */
  sourceName: string | null;
}

const INITIAL_STATE: ConverterState = {
  phase: 'idle',
  progress: 0,
  report: null,
  errorMessage: null,
  resultFileName: null,
  sourceName: null,
};

/**
 * Drives the full "select world -> validate/fix -> download .mcworld" flow.
 * This hook owns all upload/progress/report state; UI components should
 * only call `convertFromFileList`, `convertFromDataTransfer`, and
 * `downloadResult` — never talk to `mcworldConverter.ts` directly.
 */
export function useMcworldConverter() {
  const [state, setState] = useState<ConverterState>(INITIAL_STATE);
  const resultBlobRef = useRef<Blob | null>(null);

  const reset = useCallback(() => {
    resultBlobRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const runConversion = useCallback(async (files: PickedFile[], sourceName: string) => {
    if (files.length === 0) {
      setState({
        ...INITIAL_STATE,
        phase: 'error',
        errorMessage: 'Nenhum arquivo foi encontrado na pasta ou ZIP selecionado.',
      });
      return;
    }

    resultBlobRef.current = null;
    setState({ ...INITIAL_STATE, phase: 'reading', sourceName, progress: 2 });

    let zipBlob: Blob;
    let uploadFileName: string;

    if (isSingleZipFile(files)) {
      zipBlob = files[0]!.file;
      uploadFileName = files[0]!.file.name;
      setState((prev) => ({ ...prev, phase: 'uploading', progress: 5 }));
    } else {
      setState((prev) => ({ ...prev, phase: 'zipping', progress: 5 }));
      zipBlob = await buildZipFromFiles(files, (fraction) => {
        setState((prev) => ({
          ...prev,
          phase: 'zipping',
          progress: 5 + Math.round(fraction * 25),
        }));
      });
      uploadFileName = 'world.zip';
      setState((prev) => ({ ...prev, phase: 'uploading', progress: 30 }));
    }

    const outcome = await uploadWorldZip(zipBlob, uploadFileName, (fraction) => {
      setState((prev) => ({
        ...prev,
        phase: 'uploading',
        progress: Math.min(95, 30 + Math.round(fraction * 60)),
      }));
    });

    setState((prev) => ({ ...prev, phase: 'processing', progress: 97 }));

    if (outcome.kind === 'success') {
      resultBlobRef.current = outcome.blob;
      setState({
        phase: 'done',
        progress: 100,
        report: outcome.report,
        errorMessage: null,
        resultFileName: outcome.fileName,
        sourceName,
      });
      return;
    }

    setState({
      phase: 'error',
      progress: 0,
      report: outcome.report,
      errorMessage: outcome.message,
      resultFileName: null,
      sourceName,
    });
  }, []);

  const convertFromFileList = useCallback(
    (fileList: FileList) => {
      const files = collectFilesFromFileList(fileList);
      const sourceName =
        files.length === 1 ? files[0]!.file.name : (files[0]?.relativePath.split('/')[0] ?? 'mundo');
      return runConversion(files, sourceName);
    },
    [runConversion],
  );

  const convertFromDataTransfer = useCallback(
    async (dataTransfer: DataTransfer) => {
      const files = dataTransfer.items?.length
        ? await collectFilesFromDataTransfer(dataTransfer.items)
        : collectFilesFromFileList(dataTransfer.files);
      const sourceName =
        files.length === 1 ? files[0]!.file.name : (files[0]?.relativePath.split('/')[0] ?? 'mundo');
      return runConversion(files, sourceName);
    },
    [runConversion],
  );

  const downloadResult = useCallback(() => {
    const blob = resultBlobRef.current;
    if (!blob || !state.resultFileName) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.resultFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [state.resultFileName]);

  return {
    ...state,
    convertFromFileList,
    convertFromDataTransfer,
    downloadResult,
    reset,
  };
}

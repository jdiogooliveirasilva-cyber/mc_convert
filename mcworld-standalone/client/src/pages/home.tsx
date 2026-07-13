import { useMcworldConverter } from '@/hooks/useMcworldConverter';
import { Layout } from '@/components/layout';
import { Dropzone } from '@/components/dropzone';
import { ProgressView } from '@/components/progress-view';
import { SuccessView } from '@/components/success-view';
import { ErrorView } from '@/components/error-view';
import { InfoSection } from '@/components/info-section';

export function Home() {
  const {
    phase,
    progress,
    report,
    errorMessage,
    resultFileName: _resultFileName,
    sourceName,
    convertFromFileList,
    convertFromDataTransfer,
    downloadResult,
    reset,
  } = useMcworldConverter();

  return (
    <Layout>
      <div className="w-full max-w-2xl mx-auto flex flex-col items-center">
        {phase === 'idle' && (
          <Dropzone onFiles={convertFromFileList} onDataTransfer={convertFromDataTransfer} />
        )}

        {(phase === 'reading' ||
          phase === 'zipping' ||
          phase === 'uploading' ||
          phase === 'processing') && <ProgressView phase={phase} progress={progress} />}

        {phase === 'done' && report && (
          <SuccessView
            report={report}
            sourceName={sourceName}
            onDownload={downloadResult}
            onReset={reset}
          />
        )}

        {phase === 'error' && <ErrorView message={errorMessage} report={report} onReset={reset} />}

        {phase === 'idle' && <InfoSection />}
      </div>
    </Layout>
  );
}

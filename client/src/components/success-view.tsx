import { CheckCircle2, Download, RefreshCw, AlertTriangle, Info, FileStack, Zap } from 'lucide-react';
import type { ConversionReport } from '@/lib/mcworldConverter';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { AddonReport } from './addon-report';
import { formatBytes } from '@/lib/utils';

interface SuccessViewProps {
  report: ConversionReport;
  sourceName: string | null;
  onDownload: () => void;
  onReset: () => void;
}

export function SuccessView({ report, sourceName, onDownload, onReset }: SuccessViewProps) {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-2">
        <div className="inline-flex items-center justify-center p-3 bg-success/10 text-success rounded-full mb-3">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Conversão Concluída</h2>
        <p className="text-muted-foreground text-sm">
          Seu mundo está pronto para ser importado no Minecraft Bedrock.
        </p>
      </div>

      <Card className="border-border/50 shadow-md">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-6">
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-1 tracking-tight">
                {report.worldName || sourceName || 'Mundo Desconhecido'}
              </h3>
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FileStack className="w-4 h-4" /> {report.stats.totalFiles} arquivos
                </span>
                <span>&bull;</span>
                <span className="font-mono">{formatBytes(report.stats.totalBytes)}</span>
              </div>
            </div>
            <Button
              size="lg"
              onClick={onDownload}
              className="w-full md:w-auto font-medium shadow-primary/25 shadow-lg gap-2 text-base"
            >
              <Download className="w-5 h-5" />
              Baixar .mcworld
            </Button>
          </div>

          <div className="grid gap-3">
            <AddonReport addons={report.addons} />

            {report.fixesApplied.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <h4 className="flex items-center gap-2 font-medium text-primary mb-2 text-sm">
                  <Zap className="w-4 h-4" /> Correções Automáticas Aplicadas
                </h4>
                <ul className="space-y-1.5">
                  {report.fixesApplied.map((fix, idx) => (
                    <li key={idx} className="text-sm text-primary/80 flex items-start gap-2">
                      <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-primary/50" />
                      {fix}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                <h4 className="flex items-center gap-2 font-medium text-warning mb-2 text-sm">
                  <AlertTriangle className="w-4 h-4" /> Avisos
                </h4>
                <ul className="space-y-1.5">
                  {report.warnings.map((warn, idx) => (
                    <li key={idx} className="text-sm text-warning/90 flex items-start gap-2">
                      <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-warning/50" />
                      {warn}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.preview.isLikelyPreview && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mt-2">
                <h4 className="flex items-center gap-2 font-medium text-destructive mb-2 text-sm">
                  <Info className="w-4 h-4" /> Possível Incompatibilidade de Versão
                </h4>
                <p className="text-sm text-destructive/90 mb-3 leading-relaxed">
                  Este mundo parece ter sido salvo em uma versão Preview/Beta do Minecraft e pode
                  não funcionar corretamente na versão estável do jogo. Isso foi identificado
                  pelos seguintes fatores:
                </p>
                <ul className="space-y-2">
                  {report.preview.indicators.map((ind, idx) => (
                    <li
                      key={idx}
                      className="text-sm text-destructive/80 flex items-start gap-2 font-mono text-xs bg-destructive/5 p-2 rounded"
                    >
                      {ind}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center">
        <Button
          variant="ghost"
          onClick={onReset}
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="w-4 h-4" />
          Converter outro mundo
        </Button>
      </div>
    </div>
  );
}

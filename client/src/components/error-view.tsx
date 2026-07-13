import { XCircle, RefreshCw, AlertTriangle, Zap } from 'lucide-react';
import type { ConversionReport } from '@/lib/mcworldConverter';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { AddonReport } from './addon-report';

interface ErrorViewProps {
  message: string | null;
  report: ConversionReport | null;
  onReset: () => void;
}

export function ErrorView({ message, report, onReset }: ErrorViewProps) {
  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2 mb-2">
        <div className="inline-flex items-center justify-center p-3 bg-destructive/10 text-destructive rounded-full mb-3">
          <XCircle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-foreground tracking-tight">Falha na Conversão</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto leading-relaxed">
          {message || 'Ocorreu um erro desconhecido ao processar o mundo.'}
        </p>
      </div>

      {report &&
        (report.errors.length > 0 ||
          report.warnings.length > 0 ||
          report.fixesApplied.length > 0 ||
          report.addons.usesBehaviorPacks ||
          report.addons.usesResourcePacks) && (
          <Card className="border-border/50 shadow-md">
            <CardContent className="p-6 grid gap-4">
              {report.errors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h4 className="flex items-center gap-2 font-medium text-destructive mb-2 text-sm">
                    Motivos da falha
                  </h4>
                  <ul className="space-y-1.5">
                    {report.errors.map((err, idx) => (
                      <li key={idx} className="text-sm text-destructive/90 flex items-start gap-2">
                        <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-destructive/50" />
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <AddonReport addons={report.addons} />

              {report.warnings.length > 0 && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                  <h4 className="flex items-center gap-2 font-medium text-warning mb-2 text-sm">
                    <AlertTriangle className="w-4 h-4" /> Avisos da inspeção
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

              {report.fixesApplied.length > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <h4 className="flex items-center gap-2 font-medium text-primary mb-2 text-sm">
                    <Zap className="w-4 h-4" /> Correções tentadas
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
            </CardContent>
          </Card>
        )}

      <div className="flex justify-center mt-2">
        <Button onClick={onReset} className="gap-2 shadow-sm" variant="outline">
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}

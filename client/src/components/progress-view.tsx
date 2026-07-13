import { Loader2 } from 'lucide-react';
import type { ConverterPhase } from '@/hooks/useMcworldConverter';
import { Card, CardContent } from './ui/card';

interface ProgressViewProps {
  phase: ConverterPhase;
  progress: number;
}

const phaseText: Partial<Record<ConverterPhase, string>> = {
  reading: 'Lendo arquivos...',
  zipping: 'Compactando mundo...',
  uploading: 'Enviando para o servidor...',
  processing: 'Validando estrutura do mundo e addons...',
};

export function ProgressView({ phase, progress }: ProgressViewProps) {
  const text = phaseText[phase] || 'Processando...';

  return (
    <Card className="w-full animate-in fade-in zoom-in-95 duration-300 shadow-md border-primary/20 overflow-hidden bg-card/50 backdrop-blur-sm">
      <div className="h-1.5 w-full bg-secondary">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center text-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <Loader2 className="w-10 h-10 text-primary animate-spin relative" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-medium text-foreground tracking-tight">{text}</h3>
          <p className="text-sm text-muted-foreground font-mono">{progress}% concluído</p>
        </div>
      </CardContent>
    </Card>
  );
}

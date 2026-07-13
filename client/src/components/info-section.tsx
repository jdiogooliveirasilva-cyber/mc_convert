import { Info, FolderTree, PackageCheck, Settings2 } from 'lucide-react';
import { Card, CardContent } from './ui/card';

export function InfoSection() {
  return (
    <div className="w-full mt-12 animate-in fade-in duration-700 delay-300 fill-mode-both">
      <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
        <Info className="w-4 h-4" />
        <h3 className="text-sm font-medium">Como o conversor funciona</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-transparent border-border/40 shadow-none">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="p-2.5 bg-secondary rounded-lg w-fit text-foreground">
              <FolderTree className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-sm tracking-tight">Limpeza de Pastas</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Remove automaticamente pastas extras e garante que os arquivos do mundo estejam na
              raiz do pacote — mesmo quando addons foram enviados junto.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-transparent border-border/40 shadow-none">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="p-2.5 bg-secondary rounded-lg w-fit text-foreground">
              <PackageCheck className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-sm tracking-tight">Preservação de Addons</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Detecta Behavior e Resource Packs, confere UUIDs e versões contra{' '}
              <code className="bg-secondary px-1 py-0.5 rounded font-mono text-xs text-foreground">
                world_behavior_packs.json
              </code>{' '}
              e avisa se algum addon estiver faltando.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-transparent border-border/40 shadow-none">
          <CardContent className="p-5 flex flex-col gap-3">
            <div className="p-2.5 bg-secondary rounded-lg w-fit text-foreground">
              <Settings2 className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-sm tracking-tight">Arquivos Intactos</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Apenas organiza e valida. Nenhum dado de jogo, inventário, chunk ou arquivo de addon
              é removido ou alterado no processo.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

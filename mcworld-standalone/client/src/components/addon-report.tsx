import { PackageCheck, PackageSearch, Info } from 'lucide-react';
import type { AddonsReport } from '@/lib/mcworldConverter';
import { Badge } from './ui/badge';

interface AddonReportProps {
  addons: AddonsReport;
}

/**
 * Surfaces which Behavior/Resource Packs were detected and embedded, which
 * referenced packs are missing, and whether the user only uploaded the world
 * folder without the addon folders it depends on.
 *
 * Kept intentionally low-key (muted "info" tone, small text) rather than a
 * big red/orange banner: a missing addon never blocks the conversion or
 * corrupts the world, so it doesn't warrant an alarming visual treatment —
 * it's a heads-up, not an error.
 */
export function AddonReport({ addons }: AddonReportProps) {
  const hasAnyPacks = addons.behaviorPacks.length > 0 || addons.resourcePacks.length > 0;
  const hasMissing = addons.missing.length > 0;

  if (!addons.usesBehaviorPacks && !addons.usesResourcePacks) return null;

  return (
    <div className="grid gap-2">
      {hasAnyPacks && (
        <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
          <h4 className="flex items-center gap-1.5 font-medium text-foreground/80 mb-2 text-xs uppercase tracking-wide">
            <PackageCheck className="w-3.5 h-3.5" /> Addons incluídos no pacote
          </h4>
          <div className="flex flex-col gap-1.5">
            {[...addons.behaviorPacks, ...addons.resourcePacks].map((pack, idx) => (
              <div
                key={`${pack.type}-${pack.folderName}-${idx}`}
                className="flex flex-wrap items-center gap-1.5 text-sm text-foreground/80"
              >
                <Badge variant="secondary" className="font-normal text-xs">
                  {pack.type === 'behavior' ? 'Behavior Pack' : 'Resource Pack'}
                </Badge>
                <span>{pack.name || pack.folderName}</span>
                {pack.version && (
                  <span className="text-muted-foreground font-mono text-xs">v{pack.version}</span>
                )}
                {!pack.hasValidManifest && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    manifest.json inválido
                  </Badge>
                )}
                {pack.versionMismatch && (
                  <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    versão diferente da referenciada pelo mundo
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(addons.worldOnlyUpload || hasMissing) && (
        <div className="bg-muted/40 border border-border/60 rounded-lg p-3">
          <h4 className="flex items-center gap-1.5 font-medium text-foreground/80 mb-1.5 text-xs uppercase tracking-wide">
            <PackageSearch className="w-3.5 h-3.5" /> Addons não encontrados no upload
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Este mundo faz referência a Behavior/Resource Packs que não estavam no arquivo
              enviado. Isso não impede o download, mas o addon precisa ser instalado à parte no
              jogo — ou envie a pasta correspondente (behavior_packs/resource_packs, ou o arquivo
              .mcpack) junto com o mundo na próxima conversão para embuti-lo automaticamente.
            </span>
          </p>
          {hasMissing && (
            <ul className="mt-2 space-y-1">
              {addons.missing.map((missing, idx) => (
                <li
                  key={idx}
                  className="text-xs text-muted-foreground font-mono bg-background/60 px-2 py-1 rounded"
                >
                  {missing.type === 'behavior' ? 'Behavior Pack' : 'Resource Pack'} — UUID{' '}
                  {missing.uuid}
                  {missing.version ? ` (versão ${missing.version})` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { UploadCloud, Folder, FileArchive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

interface DropzoneProps {
  onFiles: (files: FileList) => void;
  onDataTransfer: (dt: DataTransfer) => void;
}

export function Dropzone({ onFiles, onDataTransfer }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      onDataTransfer(e.dataTransfer);
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(e.dataTransfer.files);
    }
  };

  const handleFolderSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFiles(e.target.files);
    }
  };

  const handleZipSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFiles(e.target.files);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in zoom-in-95 duration-300">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative group flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl transition-all duration-200 bg-card',
          isDragging
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-border hover:border-primary/50 hover:bg-secondary/50',
        )}
      >
        <div className="absolute inset-0 pointer-events-none rounded-2xl bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div
          className={cn(
            'p-4 rounded-full mb-4 transition-colors',
            isDragging
              ? 'bg-primary/20 text-primary'
              : 'bg-secondary text-muted-foreground group-hover:text-primary group-hover:bg-primary/10',
          )}
        >
          <UploadCloud className="w-10 h-10" />
        </div>

        <h3 className="text-xl font-medium text-foreground mb-2 text-center tracking-tight">
          Arraste a pasta do mundo ou o arquivo .zip
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm mb-2">
          Solte os arquivos aqui para convertê-los automaticamente em um pacote .mcworld pronto
          para importar.
        </p>
        <p className="text-xs text-muted-foreground text-center max-w-sm mb-8">
          Se o seu mundo usa addons instalados separadamente, arraste também as pastas
          behavior_packs/resource_packs correspondentes junto com a pasta do mundo.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="default"
            onClick={() => folderInputRef.current?.click()}
            className="flex gap-2"
          >
            <Folder className="w-4 h-4" />
            Escolher pasta
          </Button>
          <Button
            variant="outline"
            onClick={() => zipInputRef.current?.click()}
            className="flex gap-2"
          >
            <FileArchive className="w-4 h-4 text-muted-foreground" />
            Escolher .zip
          </Button>
        </div>

        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderSelect}
          className="hidden"
          // @ts-expect-error webkitdirectory is supported by all modern browsers
          webkitdirectory="true"
          multiple
        />
        <input
          type="file"
          ref={zipInputRef}
          onChange={handleZipSelect}
          accept=".zip"
          className="hidden"
        />
      </div>
    </div>
  );
}

import { type ReactNode } from 'react';
import { Package, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import { Button } from './ui/button';

export function Layout({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col selection:bg-primary/20">
      <header className="border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-1.5 rounded-lg border border-primary/20 text-primary">
              <Package className="w-5 h-5" />
            </div>
            <h1 className="font-semibold tracking-tight text-lg text-foreground">
              Conversor de Mundos Bedrock
            </h1>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground hover:bg-secondary/80"
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8 md:py-16 flex flex-col items-center">
        {children}
      </main>

      <footer className="py-8 border-t border-border/40 text-center text-sm text-muted-foreground">
        <p>Conversor de Mundos Bedrock &bull; Preserva addons, texturas e mods ao empacotar</p>
      </footer>
    </div>
  );
}

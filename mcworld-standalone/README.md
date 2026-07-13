# Conversor de Mundos Bedrock

Converte uma pasta de mundo do Minecraft Bedrock (ou um .zip dela) em um arquivo `.mcworld` pronto para importar, detectando e preservando automaticamente Behavior Packs e Resource Packs que o mundo utiliza — inclusive quando enviados como arquivos `.mcpack`/`.mcaddon` soltos junto com o mundo.

## Estrutura

```
client/   → frontend (React + Vite + Tailwind)
server/   → backend (Express) — serve a API de conversão e os arquivos estáticos do frontend em produção
```

Em produção, um único processo Node (o `server`) serve tanto a interface quanto a API — não é necessário hospedar frontend e backend separadamente.

Este projeto usa **npm workspaces** (client + server compartilhando uma única instalação na raiz) — não use `npm install --prefix`, apenas `npm install` na raiz.

**Requer Node.js 20 LTS** (definido em `engines` no `package.json` e em `.nvmrc`).

## Rodando localmente

```bash
# Instala as dependências de client e server em um único passo
npm install

# Terminal 1: frontend em modo dev
npm run dev:client

# Terminal 2: build + start do backend (produção)
npm run build
PORT=3000 npm start
```

Depois acesse `http://localhost:3000`.

## Publicando no Render (ou serviço similar)

Este repositório já inclui um `render.yaml` pronto. No Render:

1. Crie um novo **Web Service** e aponte para este repositório (ou faça upload do código).
2. **Runtime/Environment:** `Node` (não `Docker` — este projeto não tem Dockerfile).
3. **Build Command:** `npm install --include=dev`
4. **Start Command:** `npm start`
5. Defina as variáveis de ambiente `NODE_VERSION=20.18.1` e `NPM_CONFIG_PRODUCTION=false` (ambas já incluídas no `render.yaml`) — a segunda é essencial: o Render define `NODE_ENV=production` por padrão, o que faz o `npm install` pular `devDependencies` (onde ficam `vite`/`typescript`, necessários para o build) e quebra o build com `vite: not found`.
6. O Render injeta a variável `PORT` automaticamente — o servidor já lê `process.env.PORT`.
7. Nenhuma variável de ambiente adicional, banco de dados ou serviço externo é necessário — a conversão roda inteiramente em memória.

**Importante:** se você criou o serviço manualmente pelo painel (não via "Blueprint"), o Render **não lê o `render.yaml`** — os campos de Runtime, Build Command, Start Command e variáveis de ambiente precisam ser configurados manualmente em Settings, exatamente com os valores acima.

**Por que o Build Command é só `npm install --include=dev` (sem `&& npm run build`)?** O build acontece automaticamente através do hook `postinstall` do `package.json` raiz, disparado pelo próprio `npm install`. Isso é intencional: o build do frontend/backend depende de dois pacotes (`client` e `server`), e sempre que o comando de build do Render executa **dois processos `npm` de nível superior encadeados** (ex.: `npm install && npm run build`, ou `npm install --prefix a && npm install --prefix b`), o build trava com `npm error Exit handler never called!` — um bug conhecido do próprio npm nas imagens de build do Render. Rodar só `npm install --include=dev` evita esse padrão porque o build fica "dentro" do único processo npm que já estava rodando.

Erros comuns de build:

- **`npm error Exit handler never called!`**: acontece quando o Build Command tem mais de um comando `npm` encadeado (`&&`, `;`, `--prefix` múltiplos). A solução é usar exatamente `npm install --include=dev` como Build Command, sem nada depois — o build já roda pelo `postinstall`.
- **`sh: vite: not found` / `sh: tsc: not found`**: o host pulou `devDependencies` por causa de `NODE_ENV=production`. Garanta que o Build Command inclua `--include=dev` e que `NPM_CONFIG_PRODUCTION=false` esteja definida.
- **`failed to read Dockerfile`**: o serviço está configurado com Runtime `Docker` em vez de `Node`. Troque em Settings → Runtime.

O mesmo `Build Command`/`Start Command` funciona em qualquer outro serviço de hospedagem Node.js (Koyeb, Railway, Fly.io, VPS próprio, etc.).

## Como funciona a conversão

- O upload (`.zip` da pasta do mundo) é processado inteiramente em memória — nada é gravado em disco.
- A raiz do mundo é localizada procurando `level.dat` dentro do zip (em vez de assumir uma estrutura de pastas fixa), o que funciona mesmo quando o mundo vem junto com pastas `behavior_packs/`/`resource_packs/` ao lado dele.
- `world_behavior_packs.json`/`world_resource_packs.json` são apenas lidos (nunca reescritos) para conferir quais addons o mundo espera, comparando UUID e versão com os addons realmente enviados.
- Arquivos `.mcpack`/`.mcaddon` enviados junto com o mundo (soltos ao lado da pasta, ou dentro dela) são detectados automaticamente, abertos e mesclados como Behavior/Resource Packs — o tipo de cada um é lido do `manifest.json` interno (campo `modules[].type`), nunca adivinhado pelo nome do arquivo.
- Nenhum arquivo do mundo ou de addons é apagado — arquivos que não puderem ser validados (ex: `manifest.json` inválido) são mantidos e apenas sinalizados.
- Manifests nunca são reescritos, apenas realocados — UUIDs e números de versão de cada addon são preservados byte a byte.

## Limites

- Tamanho máximo de upload: 1 GB (ajustável em `server/src/middlewares/upload.ts`).

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
2. **Build Command:** `npm install && npm run build`
3. **Start Command:** `npm start`
4. Defina a variável de ambiente `NODE_VERSION=20.18.1` (já incluída no `render.yaml`) — o projeto exige Node 20 LTS.
5. O Render injeta a variável `PORT` automaticamente — o servidor já lê `process.env.PORT`.
6. Nenhuma variável de ambiente adicional, banco de dados ou serviço externo é necessário — a conversão roda inteiramente em memória.

Se o build falhar com `npm error Exit handler never called!`: isso é um bug conhecido do npm que costuma aparecer ao rodar múltiplos `npm install --prefix` encadeados em um único comando de build. Este projeto já evita esse padrão usando **npm workspaces** (uma única instalação na raiz) — se você alterar o `Build Command` manualmente, mantenha `npm install && npm run build` como está.

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

# Conversor de Mundos Bedrock

Converte uma pasta de mundo do Minecraft Bedrock (ou um .zip dela) em um arquivo `.mcworld` pronto para importar, detectando e preservando automaticamente Behavior Packs e Resource Packs que o mundo utiliza.

## Estrutura

```
client/   → frontend (React + Vite + Tailwind)
server/   → backend (Express) — serve a API de conversão e os arquivos estáticos do frontend em produção
```

Em produção, um único processo Node (o `server`) serve tanto a interface quanto a API — não é necessário hospedar frontend e backend separadamente.

## Rodando localmente

```bash
# Instala as dependências de client e server
npm install --prefix client
npm install --prefix server

# Terminal 1: frontend em modo dev (proxy não incluído — configure conforme necessário,
# ou simplesmente rode "npm run build" abaixo e sirva tudo pelo server)
npm run dev --prefix client

# Terminal 2: build + start do backend (produção)
npm run build --prefix server
PORT=3000 npm start --prefix server
```

Para testar o fluxo completo como em produção (frontend buildado + servido pelo Express):

```bash
npm run build   # builda client (gera server/public) e o server (gera server/dist)
PORT=3000 npm start
```

Depois acesse `http://localhost:3000`.

## Publicando no Render (ou serviço similar)

Este repositório já inclui um `render.yaml` pronto. No Render:

1. Crie um novo **Web Service** e aponte para este repositório (ou faça upload do código).
2. **Build Command:** `npm run build`
3. **Start Command:** `npm start`
4. O Render injeta a variável `PORT` automaticamente — o servidor já lê `process.env.PORT`.
5. Nenhuma variável de ambiente adicional, banco de dados ou serviço externo é necessário — a conversão roda inteiramente em memória.

O mesmo `Build Command`/`Start Command` funciona em qualquer outro serviço de hospedagem Node.js (Railway, Fly.io, VPS próprio, etc.).

## Como funciona a conversão

- O upload (`.zip` da pasta do mundo) é processado inteiramente em memória — nada é gravado em disco.
- A raiz do mundo é localizada procurando `level.dat` dentro do zip (em vez de assumir uma estrutura de pastas fixa), o que funciona mesmo quando o mundo vem junto com pastas `behavior_packs/`/`resource_packs/` ao lado dele.
- `world_behavior_packs.json`/`world_resource_packs.json` são apenas lidos (nunca reescritos) para conferir quais addons o mundo espera, comparando UUID e versão com os addons realmente enviados.
- Nenhum arquivo do mundo ou de addons é apagado — arquivos que não puderem ser validados (ex: `manifest.json` inválido) são mantidos e apenas sinalizados.

## Limites

- Tamanho máximo de upload: 1 GB (ajustável em `server/src/middlewares/upload.ts`).

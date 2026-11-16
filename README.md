# Tapetê – sistema

Código do sistema Tapetê. A documentação do projeto fica fora desta pasta (`../docs`, `../flow`, `../marca`).

| Endereço | Container | O que atende |
|---|---|---|
| `tapete.solucoesdigitais.io` | `tapete-web` (nginx) | Site em `/` e painel da equipe em `/admin` |
| `api.tapete.solucoesdigitais.io` | `tapete-api` (porta 3000) | API: endpoint do WhatsApp Flow, webhooks da Meta, API do painel e, depois, do orçamento pelo site |

| Pasta | Conteúdo |
|---|---|
| `apps/site` | Site público (Astro, páginas estáticas). O orçamento pelo site entra aqui |
| `apps/admin` | Painel da equipe (React + Vite), publicado em `/admin` do site |
| `apps/api` | Backend Node + Fastify |
| `packages/core` | Núcleo: catálogo, unidade pelo CEP, cálculo de preço, status do pedido |
| `config/precos.json` | Unidades, faixas de CEP e preços (relido sem reiniciar) |
| `infra` | Docker Compose (web, API, PostgreSQL) e `.env.example` |

## Desenvolvimento

Comandos rodados dentro de `app/`:

```bash
npm install
npm test            # testes do núcleo
npm run typecheck
npm run build
npm run dev:site    # http://localhost:4321
npm run dev:admin   # http://localhost:5173/admin/ (proxy para a API na 3000)
```

Tudo em Docker no computador, com portas publicadas (site na 8080, API na 3000):

```bash
cd infra
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

## VPS

```bash
cd app/infra
cp .env.example .env   # PROXY_NETWORK, senha do banco, WHATSAPP_NUMERO
docker compose up -d --build
```

Nenhuma porta é publicada. No Nginx Proxy Manager:

| Domínio | Forward Hostname | Porta |
|---|---|---|
| `tapete.solucoesdigitais.io` | `tapete-web` | 80 |
| `api.tapete.solucoesdigitais.io` | `tapete-api` | 3000 |

Os dois com certificado Let's Encrypt, Force SSL e HTTP/2. Chaves e segredos ficam em `infra/.env` e `infra/keys/`, fora do git.

### Banco de dados

O PostgreSQL grava os dados numa pasta do disco da VPS (`POSTGRES_DATA_DIR`, padrão `infra/data/postgres`). Os dados sobrevivem a `docker compose down`, à recriação dos containers e à atualização da imagem. O banco não publica porta; só a API o acessa, pela rede interna.

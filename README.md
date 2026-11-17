# Tapetê – sistema

Código do sistema Tapetê. A documentação do projeto fica fora desta pasta (`../docs`, `../flow`, `../marca`).

Um domínio só, `tapete.solucoesdigitais.io`. O Nginx Proxy Manager aponta para o `tapete-web`. O nginx do site encaminha `/flow`, `/health`, `/webhooks/` e `/admin/api/` para o `tapete-api`, que não fica exposto.

| Pasta | Conteúdo |
|---|---|
| `apps/site` | Site público (Astro, páginas estáticas). O orçamento pelo site entra aqui |
| `apps/admin` | Painel da equipe (React + Vite), publicado em `/admin` do site |
| `apps/api` | Backend Node + Fastify |
| `packages/core` | Núcleo: catálogo, unidade pelo CEP, cálculo de preço, status do pedido |
| `config/precos.json` | Preços iniciais, importados para o banco só na primeira vez. Depois, os preços são editados no painel (Preços e configurações) |
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

No clone, a raiz do repositório já é o sistema. Nesta pasta de trabalho, entre em `app/` antes.

```bash
cd infra
cp .env.example .env   # troque só POSTGRES_PASSWORD. A rede já é nginx-proxy_default
docker compose up -d --build
```

Nenhuma porta é publicada. No Nginx Proxy Manager, um host só:

| Domínio | Forward Hostname | Porta |
|---|---|---|
| `tapete.solucoesdigitais.io` | `tapete-web` | 8000 |

Certificado Let's Encrypt, Force SSL e HTTP/2. Chaves e segredos ficam em `infra/.env` e `infra/keys/`, fora do git.

### Endpoint do Flow

Na Meta, o endpoint do Flow é `https://tapete.solucoesdigitais.io/flow`. O webhook (quando for configurar) é `https://tapete.solucoesdigitais.io/webhooks/meta`.

A chave privada tem que ser a par da chave pública já assinada no número. Se ainda não tiver o par, na VPS, a partir da raiz do clone:

```bash
mkdir -p infra/keys
openssl genrsa -out infra/keys/flow_private.pem 2048
openssl rsa -in infra/keys/flow_private.pem -pubout -out infra/keys/flow_public.pem
```

Cole `flow_public.pem` na criptografia do número. O container lê `flow_private.pem` em `/app/keys`. `https://tapete.solucoesdigitais.io/health` mostra `flow_chave: true` quando o arquivo está no lugar. Aí cole a URL do endpoint e clique em Enviar: a Meta manda um ping cifrado e o servidor responde `active`.

### Usuários do painel

Não há cadastro pela tela. O usuário é criado no servidor; sem senha informada, uma aleatória é gerada e mostrada uma vez. Rodar de novo com o mesmo e-mail redefine a senha e encerra as sessões abertas.

```bash
cd infra
docker compose exec tapete-api node apps/api/dist/cli/criar-admin.js email@dominio.com "Nome" admin      # ou atendente
```

Senhas guardadas com scrypt. Sessão por cookie `HttpOnly` de 12 horas, renovada a cada uso. Após 5 senhas erradas, o usuário fica bloqueado por 15 minutos.

### Banco de dados

O PostgreSQL grava os dados numa pasta do disco da VPS (`POSTGRES_DATA_DIR`, padrão `infra/data/postgres`). Os dados sobrevivem a `docker compose down`, à recriação dos containers e à atualização da imagem. O banco não publica porta; só a API o acessa, pela rede interna.

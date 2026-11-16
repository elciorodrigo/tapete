# Site (/) e painel (/admin) servidos por nginx. Contexto do build: app/
FROM node:22-alpine AS build
WORKDIR /app
ARG API_PUBLIC_URL
ARG WHATSAPP_NUMERO=""
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/site/package.json apps/site/
RUN npm ci
COPY apps/admin apps/admin
COPY apps/site apps/site
RUN VITE_API_URL=$API_PUBLIC_URL npm run build -w @tapete/admin \
 && PUBLIC_WHATSAPP=$WHATSAPP_NUMERO npm run build -w @tapete/site

FROM nginx:1.29-alpine
COPY apps/site/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/site/dist /usr/share/nginx/html
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html/admin
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

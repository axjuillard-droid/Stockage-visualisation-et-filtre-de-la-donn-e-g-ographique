# ─── Stage builder ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Copier uniquement les manifestes pour profiter du cache Docker
COPY package.json package-lock.json ./
RUN npm ci

# Copier le reste et construire le bundle de production
COPY . .
RUN npm run build

# ─── Stage runtime ────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

# Supprimer la config Nginx par défaut
RUN rm -rf /usr/share/nginx/html/*

# Copier le build React
COPY --from=builder /build/dist /usr/share/nginx/html

# Copier la configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

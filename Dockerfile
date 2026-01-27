# ---------- 1) Build frontend (Vite/React) ----------
FROM node:20-alpine AS client_build
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ .
RUN npm run build


# ---------- 2) Install backend prod deps ----------
FROM node:20-alpine AS server_deps
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev


# ---------- 3) Final runtime image ----------
FROM node:20-alpine AS runner
WORKDIR /app/server

ENV NODE_ENV=production

# backend code
COPY --from=server_deps /app/server/node_modules ./node_modules
COPY server/ ./

# built frontend -> backend içine koy
# (Express'te bunu static serve edeceğiz)
COPY --from=client_build /app/client/dist ./public

# Cloud Run PORT verir (genelde 8080)
EXPOSE 8080

# server/package.json içinde "start" script'i olmalı
CMD ["npm", "start"]

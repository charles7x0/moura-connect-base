FROM node:20-alpine AS builder
WORKDIR /app
COPY packages/types /packages/types
COPY packages/health /packages/health
COPY packages/circuit-breaker /packages/circuit-breaker
COPY services/processamento/package.json ./
RUN npm install
COPY services/processamento/tsconfig.json ./
COPY services/processamento/src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY packages/types /packages/types
COPY packages/health /packages/health
COPY packages/circuit-breaker /packages/circuit-breaker
COPY services/processamento/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist/
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8081/ || exit 1
CMD ["node", "dist/index.js"]

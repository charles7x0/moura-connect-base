FROM node:20-alpine AS builder
WORKDIR /app
# Copy shared packages
COPY packages/types /packages/types
COPY packages/health /packages/health
# Copy service files
COPY services/ingestao/package.json ./
RUN npm install
COPY services/ingestao/tsconfig.json ./
COPY services/ingestao/src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY packages/types /packages/types
COPY packages/health /packages/health
COPY services/ingestao/package.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist/
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/ || exit 1
CMD ["node", "dist/index.js"]

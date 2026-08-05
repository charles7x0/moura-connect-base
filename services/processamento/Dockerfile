FROM node:20-alpine AS builder
WORKDIR /app

# Build shared packages
COPY packages/types /tmp/types
RUN cd /tmp/types && npm install && npm run build
COPY packages/health /tmp/health
RUN cd /tmp/health && npm install && npm run build
COPY packages/circuit-breaker /tmp/circuit-breaker
RUN cd /tmp/circuit-breaker && npm install && npm run build

# Install service deps
COPY services/processamento/package.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.dependencies['@moura/types'];delete p.dependencies['@moura/health'];delete p.dependencies['@moura/circuit-breaker'];require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm install

# Place packages
RUN mkdir -p node_modules/@moura/types && cp /tmp/types/package.json node_modules/@moura/types/ && cp -r /tmp/types/dist node_modules/@moura/types/
RUN mkdir -p node_modules/@moura/health && cp /tmp/health/package.json node_modules/@moura/health/ && cp -r /tmp/health/dist node_modules/@moura/health/
RUN mkdir -p node_modules/@moura/circuit-breaker && cp /tmp/circuit-breaker/package.json node_modules/@moura/circuit-breaker/ && cp -r /tmp/circuit-breaker/dist node_modules/@moura/circuit-breaker/

# Build service
COPY services/processamento/tsconfig.json ./
COPY services/processamento/src/ ./src/
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

COPY packages/types /tmp/types
RUN cd /tmp/types && npm install && npm run build
COPY packages/health /tmp/health
RUN cd /tmp/health && npm install && npm run build
COPY packages/circuit-breaker /tmp/circuit-breaker
RUN cd /tmp/circuit-breaker && npm install && npm run build

COPY services/processamento/package.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.dependencies['@moura/types'];delete p.dependencies['@moura/health'];delete p.dependencies['@moura/circuit-breaker'];require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm install --omit=dev
RUN mkdir -p node_modules/@moura/types && cp /tmp/types/package.json node_modules/@moura/types/ && cp -r /tmp/types/dist node_modules/@moura/types/
RUN mkdir -p node_modules/@moura/health && cp /tmp/health/package.json node_modules/@moura/health/ && cp -r /tmp/health/dist node_modules/@moura/health/
RUN mkdir -p node_modules/@moura/circuit-breaker && cp /tmp/circuit-breaker/package.json node_modules/@moura/circuit-breaker/ && cp -r /tmp/circuit-breaker/dist node_modules/@moura/circuit-breaker/

COPY --from=builder /app/dist ./dist/
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8081/ || exit 1
CMD ["node", "dist/index.js"]

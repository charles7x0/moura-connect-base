FROM node:20-alpine AS builder
WORKDIR /app

# Build shared packages
COPY packages/types /tmp/types
RUN cd /tmp/types && npm install && npm run build
COPY packages/health /tmp/health
RUN cd /tmp/health && npm install && npm run build

# Install service deps
COPY services/api/package.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.dependencies['@moura/types'];delete p.dependencies['@moura/health'];require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm install

# Place packages
RUN mkdir -p node_modules/@moura/types && cp /tmp/types/package.json node_modules/@moura/types/ && cp -r /tmp/types/dist node_modules/@moura/types/
RUN mkdir -p node_modules/@moura/health && cp /tmp/health/package.json node_modules/@moura/health/ && cp -r /tmp/health/dist node_modules/@moura/health/

# Build service
COPY services/api/tsconfig.json ./
COPY services/api/src/ ./src/
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl

COPY packages/types /tmp/types
RUN cd /tmp/types && npm install && npm run build
COPY packages/health /tmp/health
RUN cd /tmp/health && npm install && npm run build

COPY services/api/package.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.dependencies['@moura/types'];delete p.dependencies['@moura/health'];require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm install --omit=dev
RUN mkdir -p node_modules/@moura/types && cp /tmp/types/package.json node_modules/@moura/types/ && cp -r /tmp/types/dist node_modules/@moura/types/
RUN mkdir -p node_modules/@moura/health && cp /tmp/health/package.json node_modules/@moura/health/ && cp -r /tmp/health/dist node_modules/@moura/health/

COPY --from=builder /app/dist ./dist/
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8082/ || exit 1
CMD ["node", "dist/index.js"]

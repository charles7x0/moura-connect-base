FROM node:20-alpine AS builder
WORKDIR /app

# Build shared types package
COPY packages/types /tmp/moura-types
RUN cd /tmp/moura-types && npm install && npm run build

# Install web dependencies (strip @moura/types from package.json temporarily)
COPY services/web/package.json ./
RUN node -e "const p=JSON.parse(require('fs').readFileSync('package.json','utf8'));delete p.dependencies['@moura/types'];require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN npm install

# Place compiled @moura/types in node_modules
RUN rm -rf node_modules/@moura/types && \
    mkdir -p node_modules/@moura/types && \
    cp /tmp/moura-types/package.json node_modules/@moura/types/ && \
    cp -r /tmp/moura-types/dist node_modules/@moura/types/

# Copy source and build
COPY services/web/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]

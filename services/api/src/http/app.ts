import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.routes.js';
import { sitesRoutes } from './routes/sites.routes.js';
import { bancosRoutes } from './routes/bancos.routes.js';
import { alertasRoutes } from './routes/alertas.routes.js';
import { setupWebSocket } from './websocket/ws-server.js';

export async function buildApp() {
  const app = Fastify({
    logger: { level: 'info' },
    genReqId: () => crypto.randomUUID(),
  });

  // #1: Security headers (Helmet)
  await app.register(helmet, {
    contentSecurityPolicy: false, // Desabilitado para Swagger UI funcionar
  });

  // #3: CORS — aceita frontend local + Docker network
  await app.register(cors, {
    origin: true,  // Em dev aceita tudo; em prod restringir para domínio específico
    credentials: true,
  });

  // #4: Rate limiting global (100 req/min)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // Swagger / OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Moura Connect API',
        description: 'API de monitoramento preditivo de baterias estacionárias',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Local' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      tags: [
        { name: 'Auth', description: 'Autenticação' },
        { name: 'Sites', description: 'Sites de monitoramento' },
        { name: 'Bancos', description: 'Bancos de baterias' },
        { name: 'Alertas', description: 'Alertas de anomalia' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  await app.register(websocket);

  // Error handler centralizado
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    request.log.error({ err: error, reqId: request.id, url: request.url, method: request.method });

    if (error.validation) {
      return reply.code(400).send({
        error: 'Erro de validação',
        details: error.validation.map((v) => v.message),
        requestId: request.id,
      });
    }

    if (statusCode === 429) {
      return reply.code(429).send({ error: 'Muitas requisições. Tente novamente em instantes.', requestId: request.id });
    }

    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Erro interno' : error.message,
      requestId: request.id,
    });
  });

  // Health check
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // Routes
  await app.register(authRoutes);
  await app.register(sitesRoutes);
  await app.register(bancosRoutes);
  await app.register(alertasRoutes);

  // WebSocket
  await setupWebSocket(app);

  return app;
}

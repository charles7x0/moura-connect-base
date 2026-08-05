import { buildApp } from './http/app.js';
import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { connectRedis, disconnectRedis } from './infra/redis.js';
import { startAlertConsumer, stopAlertConsumer } from './consumers/alertas.consumer.js';
import { startHealthServer, markActivity } from '@moura/health';
import { config } from './config.js';

let app: Awaited<ReturnType<typeof buildApp>>;

async function main(): Promise<void> {
  console.log('[api] Iniciando serviço de API...');

  await connectMongo();
  await connectRedis();
  await startAlertConsumer();

  startHealthServer({ port: 8082, timeoutMs: 120_000 });
  markActivity();

  app = await buildApp();
  await app.listen({ port: config.port, host: '0.0.0.0' });

  console.log(`[api] Servidor rodando na porta ${config.port}`);
}

async function shutdown(): Promise<void> {
  console.log('[api] Encerrando gracefully...');

  // #4: Graceful shutdown — para de aceitar novas conexões, finaliza in-flight
  if (app) {
    await app.close();
    console.log('[api] Fastify encerrado (requests in-flight finalizados)');
  }

  await stopAlertConsumer();
  await disconnectRedis();
  await disconnectMongo();

  console.log('[api] Shutdown completo');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[api] Erro fatal:', err);
  process.exit(1);
});

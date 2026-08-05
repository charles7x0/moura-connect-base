import { connectMongo, disconnectMongo } from './infra/mongo.js';
import { connectRedis, disconnectRedis } from './infra/redis.js';
import { connectAlertProducer, disconnectAlertProducer, startConsumer, stopConsumer } from './infra/kafka.js';
import { criarIndices, startPeriodicFlush, drainBuffer, getBulkMetrics } from './repositories/leituras.repo.js';
import { handle, getQualityThreshold, getMetrics } from './pipeline/leitura-handler.js';
import { registerAllRules } from './rules/register-all.js';
import { getRegisteredNames, getTimeRules } from './rules/registry.js';
import { startHealthServer, markActivity } from '@moura/health';
import { config } from './config.js';

let offlineInterval: NodeJS.Timeout;
let metricsInterval: NodeJS.Timeout;

async function main(): Promise<void> {
  console.log('[processamento] Iniciando serviço de processamento...');

  startHealthServer({ port: 8081 });

  await connectMongo();
  await criarIndices();
  await connectRedis();
  await connectAlertProducer();

  // Bulk write periodic flush
  startPeriodicFlush();

  // Registrar regras plugáveis
  registerAllRules();
  console.log(`[processamento] Regras: ${getRegisteredNames().join(', ')}`);
  console.log(`[kafka] Quality threshold: ${getQualityThreshold()}`);

  // Handler com health mark
  const handleWithHealth = async (leitura: Parameters<typeof handle>[0]) => {
    await handle(leitura);
    markActivity();
  };

  await startConsumer(handleWithHealth);

  // Timer para regras time-driven
  const timeRules = getTimeRules();
  offlineInterval = setInterval(async () => {
    for (const rule of timeRules) {
      try {
        await rule.fn();
      } catch (err) {
        console.error(`[time-rule:${rule.name}] Erro: ${(err as Error).message}`);
      }
    }
  }, config.rules.offlineCheckIntervalMs);

  // Métricas periódicas
  metricsInterval = setInterval(() => {
    const { processedCount, skippedLowQuality } = getMetrics();
    const { bulkWriteCount, bufferSize } = getBulkMetrics();
    console.log(`[metricas] Processadas: ${processedCount} | Skip qualidade: ${skippedLowQuality} | Bulk writes: ${bulkWriteCount} | Buf: ${bufferSize}`);
  }, 30_000);

  console.log('[processamento] Serviço rodando. Kafka → MongoDB + Redis + Alertas');
  console.log(`[processamento] Features: bulk write, circuit breaker, graceful drain`);
  console.log(`[processamento] Config: tensão<${config.rules.tensaoThresholdV}V (${config.rules.tensaoCountThreshold}x), temp>${config.rules.temperaturaThresholdC}°C, offline>${config.rules.offlineThresholdMs / 1000}s, descarga>${config.rules.descargaThresholdMs / 1000}s`);
}

async function shutdown(): Promise<void> {
  console.log('[processamento] Encerrando gracefully...');
  clearInterval(offlineInterval);
  clearInterval(metricsInterval);

  // 1. Parar consumer (graceful drain — espera in-flight)
  await stopConsumer();

  // 2. Flush buffer de leituras pendentes no MongoDB
  await drainBuffer();

  // 3. Desconectar infra
  await disconnectAlertProducer();
  await disconnectRedis();
  await disconnectMongo();

  console.log('[processamento] Shutdown completo');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[processamento] Erro fatal:', err);
  process.exit(1);
});

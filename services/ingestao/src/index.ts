import { registerAllProtocols, getRegisteredVersions } from './protocols/index.js';
import { connectProducer, disconnectProducer, publishBatch, publishToDlq } from './egress/kafka-producer.js';
import { startSubscriber, stopSubscriber, IngressCallbacks } from './ingress/mqtt-subscriber.js';
import { startHealthServer } from '@moura/health';
import { config } from './config.js';

async function main(): Promise<void> {
  console.log('[ingestao] Iniciando serviço de ingestão...');

  startHealthServer({ port: config.health.port, timeoutMs: config.health.livenessTimeoutMs });

  registerAllProtocols();
  console.log(`[ingestao] Protocolos suportados: ${getRegisteredVersions().join(', ')}`);

  await connectProducer();

  const callbacks: IngressCallbacks = {
    onBatch: publishBatch,
    onError: publishToDlq,
  };

  await startSubscriber(callbacks);

  console.log('[ingestao] Serviço rodando. MQTT → Kafka (batched + DLQ + QoS1)');
}

async function shutdown(): Promise<void> {
  console.log('[ingestao] Encerrando gracefully...');
  await stopSubscriber();
  await disconnectProducer();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[ingestao] Erro fatal:', err);
  process.exit(1);
});

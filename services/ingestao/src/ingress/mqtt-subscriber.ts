import mqtt, { MqttClient } from 'mqtt';
import { getHandler } from '../protocols/index.js';
import { Leitura } from '../protocols/types.js';
import { annotateQuality } from '../quality/index.js';
import { markActivity } from '@moura/health';
import { config } from '../config.js';

export interface IngressCallbacks {
  onBatch(leituras: Leitura[]): Promise<void>;
  onError(reason: string, payload: Buffer, topic: string, version: string): Promise<void>;
}

let client: MqttClient;
let metricsInterval: NodeJS.Timeout;
let batchInterval: NodeJS.Timeout;

// Métricas
let messageCount = 0;
let errorCount = 0;
let batchCount = 0;
let droppedCount = 0;
const versionCount: Record<string, number> = {};

// Buffer com limite
let buffer: Leitura[] = [];

interface ParsedTopic {
  version: string;
  siteId: string;
  bancoId: string;
}

function parseTopic(topic: string): ParsedTopic | null {
  const parts = topic.split('/');

  if (parts.length === 5 && parts[2] === 'telemetria') {
    return { version: parts[1], siteId: parts[3], bancoId: parts[4] };
  }

  if (parts.length === 4 && parts[1] === 'telemetria') {
    return { version: 'v1', siteId: parts[2], bancoId: parts[3] };
  }

  return null;
}

async function flushBatch(callbacks: IngressCallbacks): Promise<void> {
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  try {
    await callbacks.onBatch(batch);
    batchCount++;
    markActivity();
  } catch (err) {
    console.error(`[mqtt] Erro ao enviar batch (${batch.length} msgs): ${(err as Error).message}`);
    if (buffer.length + batch.length <= config.batching.bufferMaxSize) {
      buffer.unshift(...batch);
    } else {
      const space = config.batching.bufferMaxSize - buffer.length;
      if (space > 0) {
        buffer.unshift(...batch.slice(batch.length - space));
      }
      droppedCount += batch.length - Math.max(0, space);
      console.warn(`[mqtt] Buffer cheio — mensagens descartadas`);
    }
  }
}

export async function startSubscriber(callbacks: IngressCallbacks): Promise<void> {
  client = await mqtt.connectAsync(config.mqtt.url, {
    clientId: config.mqtt.clientId,
    clean: config.mqtt.cleanSession,
    reconnectPeriod: config.mqtt.reconnectPeriodMs,
    connectTimeout: 30_000,
  });

  console.log(`[mqtt] Conectado (clientId=${config.mqtt.clientId}, clean=${config.mqtt.cleanSession}, QoS=1)`);

  await client.subscribeAsync([...config.mqttTopics], { qos: 1 });
  console.log(`[mqtt] Subscrito (QoS 1): ${config.mqttTopics.join(', ')}`);

  client.on('message', async (topic: string, payload: Buffer) => {
    try {
      const parsed = parseTopic(topic);
      if (!parsed) {
        errorCount++;
        await callbacks.onError('topic_invalido', payload, topic, 'unknown');
        return;
      }

      const handler = getHandler(parsed.version);
      if (!handler) {
        errorCount++;
        await callbacks.onError(`versao_nao_suportada:${parsed.version}`, payload, topic, parsed.version);
        return;
      }

      const decoded = handler.codec.decode(payload);

      const result = handler.schema.validate(decoded);
      if (!result.success) {
        errorCount++;
        await callbacks.onError(`validacao:${result.error}`, payload, topic, parsed.version);
        return;
      }

      const raw = handler.normalize(result.data);
      const leitura = annotateQuality(raw);

      if (buffer.length >= config.batching.bufferMaxSize) {
        droppedCount++;
        return;
      }

      buffer.push(leitura);
      messageCount++;
      versionCount[parsed.version] = (versionCount[parsed.version] || 0) + 1;

      if (buffer.length >= config.batching.maxSize) {
        await flushBatch(callbacks);
      }
    } catch (err) {
      errorCount++;
      console.warn(`[mqtt] Erro inesperado: ${(err as Error).message}`);
    }
  });

  batchInterval = setInterval(() => flushBatch(callbacks), config.batching.intervalMs);

  client.on('error', (err) => console.error(`[mqtt] Erro: ${err.message}`));
  client.on('reconnect', () => console.log('[mqtt] Reconectando...'));
  client.on('offline', () => console.warn('[mqtt] Offline'));

  metricsInterval = setInterval(() => {
    const versions = Object.entries(versionCount).map(([v, c]) => `${v}=${c}`).join(' ');
    console.log(`[metricas] msgs=${messageCount} erros=${errorCount} drops=${droppedCount} batches=${batchCount} buf=${buffer.length} | ${versions}`);
  }, 30_000);
}

export async function stopSubscriber(): Promise<void> {
  clearInterval(metricsInterval);
  clearInterval(batchInterval);
  if (client) await client.endAsync();
}

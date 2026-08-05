import { Kafka, Producer, CompressionTypes } from 'kafkajs';
import { Leitura } from '../protocols/types.js';
import { config } from '../config.js';

const kafka = new Kafka({
  clientId: config.kafka.clientId,
  brokers: [config.kafka.broker],
  retry: { retries: 10, initialRetryTime: 3000 },
});

let producer: Producer;

export async function connectProducer(): Promise<void> {
  producer = kafka.producer({ allowAutoTopicCreation: true });
  await producer.connect();
  console.log(`[kafka] Conectado ao broker ${config.kafka.broker} (batching habilitado)`);
}

export async function publishLeitura(leitura: Leitura): Promise<void> {
  await producer.send({
    topic: config.kafka.topics.leituras,
    messages: [{ key: leitura.bancoId, value: JSON.stringify(leitura), timestamp: Date.now().toString() }],
    compression: CompressionTypes.GZIP,
  });
}

export async function publishBatch(leituras: Leitura[]): Promise<void> {
  if (leituras.length === 0) return;

  await producer.send({
    topic: config.kafka.topics.leituras,
    messages: leituras.map((l) => ({ key: l.bancoId, value: JSON.stringify(l), timestamp: Date.now().toString() })),
    compression: CompressionTypes.GZIP,
  });
}

export async function publishToDlq(reason: string, rawPayload: Buffer, topic: string, version: string): Promise<void> {
  try {
    await producer.send({
      topic: config.kafka.topics.dlq,
      messages: [{
        key: `${version}:${topic}`,
        value: JSON.stringify({ reason, version, originalTopic: topic, payload: rawPayload.toString('base64'), timestamp: new Date().toISOString() }),
      }],
    });
  } catch (err) {
    console.error(`[dlq] Falha: ${(err as Error).message}`);
  }
}

export async function disconnectProducer(): Promise<void> {
  if (producer) await producer.disconnect();
}

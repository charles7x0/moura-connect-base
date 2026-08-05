import { Kafka, Consumer } from 'kafkajs';
import { config } from '../config.js';
import { getDb } from '../infra/mongo.js';
import { broadcastToAuthorized } from '../http/websocket/ws-server.js';
import { processAlertEvent } from '../services/alertas.service.js';
import type { AlertaEvento } from '@moura/types';

const kafka = new Kafka({
  clientId: 'api-alertas',
  brokers: [config.kafka.broker],
  retry: { retries: 10, initialRetryTime: 3000 },
});

let consumer: Consumer;

export async function startAlertConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: 'api-alertas-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'alertas.eventos', fromBeginning: true });

  const db = getDb();
  // Partial unique: max 1 alerta ATIVO por banco+regra (resolvidos podem ter múltiplos)
  await db.collection('alertas').createIndex(
    { bancoId: 1, regra: 1 },
    { unique: true, partialFilterExpression: { status: 'ativo' } }
  );
  await db.collection('alertas').createIndex({ alertaId: 1 });
  await db.collection('alertas').createIndex({ status: 1, siteId: 1 });

  console.log('[kafka] Consumer de alertas conectado');

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const evento: AlertaEvento = JSON.parse(message.value!.toString());
        await processAlertEvent(evento);
        broadcastToAuthorized(evento.siteId, { type: 'alerta', payload: evento });
      } catch (err) {
        console.error(`[kafka-alertas] Erro: ${(err as Error).message}`);
      }
    },
  });
}

export async function stopAlertConsumer(): Promise<void> {
  if (consumer) await consumer.disconnect();
}

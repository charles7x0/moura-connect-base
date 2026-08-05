import { Kafka, Consumer, Producer } from 'kafkajs';
import { config } from '../config.js';
import { Leitura } from '@moura/types';

const kafka = new Kafka({
  clientId: 'processamento',
  brokers: [config.kafka.broker],
  retry: { retries: 10, initialRetryTime: 3000 },
});

const kafkaAlertas = new Kafka({
  clientId: 'processamento-alertas',
  brokers: [config.kafka.broker],
});

let consumer: Consumer;
let alertProducer: Producer;
let inFlightCount = 0;

export async function connectAlertProducer(): Promise<void> {
  alertProducer = kafkaAlertas.producer();
  await alertProducer.connect();
  console.log('[kafka-alerts] Producer conectado');
}

export function getAlertProducer(): Producer {
  return alertProducer;
}

export async function disconnectAlertProducer(): Promise<void> {
  if (alertProducer) {
    await alertProducer.disconnect();
  }
}

export async function startConsumer(handler: (leitura: Leitura) => Promise<void>): Promise<void> {
  consumer = kafka.consumer({ groupId: config.kafka.groupId });
  await consumer.connect();
  await consumer.subscribe({ topic: 'telemetria.leituras', fromBeginning: false });

  console.log('[kafka] Consumer conectado');

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        inFlightCount++;
        const leitura: Leitura = JSON.parse(message.value!.toString());
        await handler(leitura);
      } catch (err) {
        console.error(`[kafka] Erro ao processar mensagem: ${(err as Error).message}`);
      } finally {
        inFlightCount--;
      }
    },
  });
}

/**
 * Graceful drain — para de receber novas mensagens e espera in-flight terminar.
 */
export async function stopConsumer(): Promise<void> {
  if (!consumer) return;

  console.log('[kafka] Iniciando graceful drain...');

  // Pausa o consumo (para de buscar novas mensagens)
  try {
    consumer.pause([{ topic: 'telemetria.leituras' }]);
  } catch { /* pode falhar se já desconectou */ }

  // Esperar mensagens in-flight finalizarem (max 10s)
  const deadline = Date.now() + 10_000;
  while (inFlightCount > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }

  if (inFlightCount > 0) {
    console.warn(`[kafka] Timeout no drain — ${inFlightCount} mensagens ainda em processamento`);
  } else {
    console.log('[kafka] Drain completo — todas as mensagens finalizadas');
  }

  await consumer.disconnect();
}

export function getInFlightCount(): number {
  return inFlightCount;
}

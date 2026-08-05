import { Collection } from 'mongodb';
import { getDb } from '../infra/mongo.js';
import { CircuitBreaker, CircuitOpenError } from '@moura/circuit-breaker';
import { Leitura } from '@moura/types';

const BULK_SIZE = Number(process.env.BULK_WRITE_SIZE) || 50;
const BULK_INTERVAL_MS = Number(process.env.BULK_WRITE_INTERVAL_MS) || 1000;

let leiturasCol: Collection;
let buffer: Leitura[] = [];
let flushInterval: NodeJS.Timeout;
let bulkWriteCount = 0;

const mongoCircuit = new CircuitBreaker({
  name: 'mongo-leituras',
  failureThreshold: 5,
  resetTimeoutMs: 15_000,
});

function getCollection(): Collection {
  if (!leiturasCol) {
    leiturasCol = getDb().collection('leituras');
  }
  return leiturasCol;
}

export async function criarIndices(): Promise<void> {
  const col = getCollection();
  await col.createIndex({ bancoId: 1, timestamp: -1 });
  await col.createIndex({ bancoId: 1, timestamp: 1 }, { unique: true });
  await col.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7_776_000 });
}

/**
 * Enfileira leitura para bulk write. Flush automático por tamanho ou timer.
 */
export async function gravarLeitura(leitura: Leitura): Promise<void> {
  buffer.push(leitura);

  if (buffer.length >= BULK_SIZE) {
    await flush();
  }
}

/**
 * Flush do buffer — grava tudo de uma vez com bulkWrite.
 */
async function flush(): Promise<void> {
  if (buffer.length === 0) return;

  const batch = buffer;
  buffer = [];

  try {
    await mongoCircuit.execute(async () => {
      const col = getCollection();
      const ops = batch.map((leitura) => ({
        updateOne: {
          filter: { bancoId: leitura.bancoId, timestamp: new Date(leitura.timestamp) },
          update: { $set: { ...leitura, timestamp: new Date(leitura.timestamp), _ingestedAt: new Date() } },
          upsert: true,
        },
      }));

      await col.bulkWrite(ops, { ordered: false });
      bulkWriteCount++;
    });
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      // Mongo indisponível — descartar batch (dados não são perdidos — estão no Kafka para reprocessar)
      console.warn(`[leituras] Batch descartado (${batch.length} docs) — MongoDB circuit open`);
    } else {
      console.error(`[leituras] Erro no bulkWrite: ${(err as Error).message}`);
      // Re-enfileirar se houver espaço
      if (buffer.length + batch.length < BULK_SIZE * 10) {
        buffer.unshift(...batch);
      }
    }
  }
}

/** Inicia flush periódico (garante latência máxima de escrita) */
export function startPeriodicFlush(): void {
  flushInterval = setInterval(flush, BULK_INTERVAL_MS);
}

/** Flush final antes de desligar */
export async function drainBuffer(): Promise<void> {
  clearInterval(flushInterval);
  await flush();
}

export function getBulkMetrics(): { bulkWriteCount: number; bufferSize: number } {
  return { bulkWriteCount, bufferSize: buffer.length };
}

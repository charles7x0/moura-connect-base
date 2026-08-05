import IORedis from 'ioredis';
import { config } from '../config.js';

type RedisClient = IORedis.Redis;
let redis: RedisClient;

export async function connectRedis(): Promise<void> {
  redis = new IORedis.default(config.redis.url, {
    retryStrategy: (times: number) => Math.min(times * 1000, 10_000),
    maxRetriesPerRequest: null,
  });

  redis.on('connect', () => {
    console.log(`[redis] Conectado a ${config.redis.url}`);
  });

  redis.on('error', (err: Error) => {
    console.error(`[redis] Erro: ${err.message}`);
  });
}

export function getRedis(): RedisClient {
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.disconnect();
  }
}

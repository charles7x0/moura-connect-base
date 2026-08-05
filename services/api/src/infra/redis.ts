import IORedis from 'ioredis';
import { config } from '../config.js';

type RedisClient = IORedis.Redis;
let redis: RedisClient;

export async function connectRedis(): Promise<void> {
  redis = new IORedis.default(config.redis.url, {
    retryStrategy: (times: number) => Math.min(times * 1000, 10_000),
    maxRetriesPerRequest: null,
  });

  return new Promise((resolve) => {
    redis.on('connect', () => {
      console.log(`[redis] Conectado a ${config.redis.url}`);
      resolve();
    });
  });
}

export function getRedis(): RedisClient {
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis) redis.disconnect();
}

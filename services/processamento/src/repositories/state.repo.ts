import { getRedis } from '../infra/redis.js';
import { CircuitBreaker, CircuitOpenError } from '@moura/circuit-breaker';
import { config } from '../config.js';
import { Leitura } from '@moura/types';

const redisCircuit = new CircuitBreaker({
  name: 'redis-state',
  failureThreshold: 10,
  resetTimeoutMs: 10_000,
});

async function withCircuit<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await redisCircuit.execute(fn);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      return fallback;
    }
    throw err;
  }
}

export async function atualizarEstado(leitura: Leitura): Promise<void> {
  await withCircuit(async () => {
    const redis = getRedis();
    const key = `banco:estado:${leitura.bancoId}`;
    await redis.set(
      key,
      JSON.stringify({ ...leitura, receivedAt: Date.now() }),
      'EX',
      Math.ceil(config.rules.offlineThresholdMs / 1000) + 60
    );
  }, undefined);
}

export async function getEstado(bancoId: string): Promise<string | null> {
  return withCircuit(async () => {
    const redis = getRedis();
    return redis.get(`banco:estado:${bancoId}`);
  }, null);
}

export async function alertExists(key: string): Promise<boolean> {
  return withCircuit(async () => {
    const redis = getRedis();
    return (await redis.exists(key)) === 1;
  }, false);
}

export async function setAlertKey(key: string, value: string): Promise<void> {
  await withCircuit(async () => {
    const redis = getRedis();
    await redis.set(key, value);
  }, undefined);
}

export async function delKey(key: string): Promise<void> {
  await withCircuit(async () => {
    const redis = getRedis();
    await redis.del(key);
  }, undefined);
}

export async function getKey(key: string): Promise<string | null> {
  return withCircuit(async () => {
    const redis = getRedis();
    return redis.get(key);
  }, null);
}

export async function incrKey(key: string): Promise<number> {
  return withCircuit(async () => {
    const redis = getRedis();
    return redis.incr(key);
  }, 0);
}

export async function expireKey(key: string, seconds: number): Promise<void> {
  await withCircuit(async () => {
    const redis = getRedis();
    await redis.expire(key, seconds);
  }, undefined);
}

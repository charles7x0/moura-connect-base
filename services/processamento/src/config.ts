export const config = {
  kafka: {
    broker: process.env.KAFKA_BROKER || 'kafka:29092',
    groupId: 'processamento-group',
  },
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://mongo:27017/moura',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
  },
  rules: {
    tensaoThresholdV: Number(process.env.TENSAO_THRESHOLD_V) || 48,
    tensaoCountThreshold: Number(process.env.TENSAO_COUNT_THRESHOLD) || 3,
    temperaturaThresholdC: Number(process.env.TEMPERATURA_THRESHOLD_C) || 45,
    offlineThresholdMs: Number(process.env.OFFLINE_THRESHOLD_MS) || 600_000,
    descargaThresholdMs: Number(process.env.DESCARGA_THRESHOLD_MS) || 900_000,
    offlineCheckIntervalMs: Number(process.env.OFFLINE_CHECK_INTERVAL_MS) || 60_000,
  },
} as const;

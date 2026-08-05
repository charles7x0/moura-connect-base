export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'moura-jwt-secret-dev',
  kafka: {
    broker: process.env.KAFKA_BROKER || 'kafka:29092',
  },
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://mongo:27017/moura',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
  },
} as const;

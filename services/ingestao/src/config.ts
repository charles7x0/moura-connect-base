/**
 * Configuração centralizada do serviço de ingestão.
 * Todas as variáveis de ambiente lidas num único lugar.
 */
export const config = {
  /** Conexões de infraestrutura */
  mqtt: {
    url: process.env.MQTT_URL || 'mqtt://mosquitto:1883',
    clientId: process.env.MQTT_CLIENT_ID || `ingestao-${Date.now()}`,
    cleanSession: false,
    reconnectPeriodMs: 5000,
  },

  kafka: {
    broker: process.env.KAFKA_BROKER || 'kafka:29092',
    clientId: 'ingestao',
    topics: {
      leituras: 'telemetria.leituras',
      dlq: 'telemetria.dlq',
    },
  },

  /** Health check */
  health: {
    port: Number(process.env.HEALTH_PORT) || 8080,
    livenessTimeoutMs: Number(process.env.LIVENESS_TIMEOUT_MS) || 60_000,
  },

  /** Batching — controle de throughput */
  batching: {
    intervalMs: Number(process.env.BATCH_INTERVAL_MS) || 500,
    maxSize: Number(process.env.BATCH_MAX_SIZE) || 50,
    bufferMaxSize: Number(process.env.BUFFER_MAX_SIZE) || 5000,
  },

  /** Quality — indicadores de qualidade do dado */
  quality: {
    expectedIntervalMs: Number(process.env.EXPECTED_INTERVAL_MS) || 5000,
    freshnessMarginMs: Number(process.env.FRESHNESS_MARGIN_MS) || 3000,
    maxAcceptableLatencyMs: 30_000, // Constante — não configurável
  },

  /** Tópicos MQTT (contrato da aplicação, não configurável) */
  mqttTopics: [
    'moura/+/telemetria/#',
    'moura/telemetria/#',
  ],
} as const;

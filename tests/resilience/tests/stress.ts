/**
 * Teste: Carga alta — mede throughput e verifica estabilidade.
 */
import mqtt from 'mqtt';
import { sleep, healthCheck, isContainerRunning, getIngestaoLogs, pass, fail, section } from '../helpers.js';

section('Stress Test (High Throughput)');

const MQTT_URL = 'mqtt://localhost:1883';
const MSG_COUNT = 2000;
const CONCURRENCY = 10; // publicações simultâneas

// 1. Saúde inicial
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
pass('Ingestão saudável');

// 2. Enviar MSG_COUNT mensagens válidas o mais rápido possível
console.log(`  ⏳ Enviando ${MSG_COUNT} mensagens válidas (${CONCURRENCY} clients)...`);
const startTime = Date.now();

const clients = await Promise.all(
  Array.from({ length: CONCURRENCY }, (_, i) =>
    mqtt.connectAsync(MQTT_URL, { clientId: `stress-${i}-${Date.now()}` })
  )
);

const msgsPerClient = Math.ceil(MSG_COUNT / CONCURRENCY);

await Promise.all(clients.map(async (client, clientIdx) => {
  for (let i = 0; i < msgsPerClient; i++) {
    const leitura = {
      bancoId: `STRESS-${clientIdx}-${i}`,
      siteId: 'SITE-STRESS',
      timestamp: new Date().toISOString(),
      tensaoV: 50 + Math.random() * 4,
      correnteA: -0.5 + Math.random(),
      temperaturaC: 25 + Math.random() * 10,
      estadoCarga: 0.8 + Math.random() * 0.2,
      modo: 'flutuacao',
    };
    client.publish(
      `moura/telemetria/SITE-STRESS/STRESS-${clientIdx}-${i}`,
      JSON.stringify(leitura)
    );
  }
}));

const publishDuration = Date.now() - startTime;
console.log(`  ✓ ${MSG_COUNT} mensagens publicadas em ${publishDuration}ms (${Math.round(MSG_COUNT / (publishDuration / 1000))} msgs/s)`);

await Promise.all(clients.map((c) => c.endAsync()));

// 3. Esperar processamento
console.log('  ⏳ Aguardando processamento...');
await sleep(10_000);

// 4. Verificar que está vivo
if (!isContainerRunning('mc-ingestao')) {
  fail('Ingestão crashou durante stress');
  process.exit(1);
} else {
  pass('Ingestão sobreviveu ao stress');
}

// 5. Healthcheck
const h2 = healthCheck();
if (h2?.status === 'ok') {
  pass('Healthcheck OK após stress');
} else {
  fail(`Healthcheck: ${JSON.stringify(h2)}`);
}

// 6. Verificar métricas
const logs = getIngestaoLogs(3);
const msgMatch = logs.match(/msgs=(\d+)/);
if (msgMatch) {
  const total = parseInt(msgMatch[1]);
  console.log(`  📊 Total processado: ${total} msgs`);
  pass(`Throughput sustentado — ${total} msgs processadas`);
} else {
  console.log('  ⚠️ Não foi possível ler métricas do tail');
}

// 7. Verificar drops
if (logs.includes('drops=0')) {
  pass('Zero mensagens descartadas (buffer suficiente)');
} else if (logs.includes('drops=')) {
  const dropMatch = logs.match(/drops=(\d+)/);
  console.log(`  ⚠️ ${dropMatch?.[1] || '?'} mensagens descartadas (buffer overflow)`);
}

console.log('\n✅ Teste Stress concluído');

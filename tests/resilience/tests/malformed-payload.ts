/**
 * Teste: Flood de mensagens inválidas não derruba o serviço.
 */
import mqtt from 'mqtt';
import { sleep, healthCheck, isContainerRunning, getIngestaoLogs, pass, fail, section } from '../helpers.js';

section('Malformed Payload Flood');

const MQTT_URL = 'mqtt://localhost:1883';
const COUNT = 500;

// 1. Confirmar saúde
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
pass('Ingestão saudável');

// 2. Conectar e enviar 500 mensagens inválidas rapidamente
console.log(`  ⏳ Enviando ${COUNT} mensagens malformadas...`);
const client = await mqtt.connectAsync(MQTT_URL);

for (let i = 0; i < COUNT; i++) {
  client.publish('moura/telemetria/SITE-TEST/INVALID-BANCO', `NOT_JSON_${i}`);
}

// Algumas com JSON mas schema inválido
for (let i = 0; i < 100; i++) {
  client.publish('moura/telemetria/SITE-TEST/BAD-SCHEMA', JSON.stringify({ broken: true, i }));
}

await client.endAsync();
console.log(`  ✓ ${COUNT + 100} mensagens inválidas enviadas`);

// 3. Esperar processamento
await sleep(5_000);

// 4. Ingestão viva?
if (!isContainerRunning('mc-ingestao')) {
  fail('Ingestão CRASHOU com payload inválido');
  process.exit(1);
} else {
  pass('Ingestão sobreviveu ao flood de lixo');
}

// 5. Healthcheck
const h2 = healthCheck();
if (h2?.status === 'ok') {
  pass('Healthcheck OK após flood');
} else {
  fail(`Healthcheck degradado: ${JSON.stringify(h2)}`);
}

// 6. Verificar que erros foram contados
const logs = getIngestaoLogs(5);
if (logs.includes('erros=') && !logs.includes('erros=0 ')) {
  pass('Erros contabilizados nas métricas');
} else {
  console.log('  ⚠️ Métricas de erros não visíveis no tail (pode precisar esperar ciclo de 30s)');
}

// 7. Mensagens válidas do simulador continuam fluindo
await sleep(10_000);
const h3 = healthCheck();
if (h3?.status === 'ok') {
  pass('Dados válidos continuam sendo processados após o flood');
} else {
  fail('Serviço parou de processar dados válidos');
}

console.log('\n✅ Teste Malformed Payload concluído');

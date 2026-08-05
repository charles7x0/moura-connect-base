/**
 * Teste: Versão de protocolo desconhecida vai para DLQ.
 */
import mqtt from 'mqtt';
import { execSync } from 'node:child_process';
import { sleep, healthCheck, pass, fail, section, docker } from '../helpers.js';

section('Unknown Protocol Version → DLQ');

const MQTT_URL = 'mqtt://localhost:1883';

// 1. Saúde
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
pass('Ingestão saudável');

// 2. Publicar em tópico com versão inexistente
console.log('  ⏳ Publicando em moura/v99/telemetria/...');
const client = await mqtt.connectAsync(MQTT_URL);

for (let i = 0; i < 5; i++) {
  client.publish(
    `moura/v99/telemetria/SITE-TEST/BANCO-DLQ-${i}`,
    JSON.stringify({ test: true, version: 'v99', i })
  );
}

await client.endAsync();
await sleep(5_000);

// 3. Verificar DLQ no Kafka
console.log('  ⏳ Verificando tópico telemetria.dlq...');
let dlqContent = '';
try {
  dlqContent = docker(
    'exec mc-kafka kafka-console-consumer --bootstrap-server kafka:29092 --topic telemetria.dlq --from-beginning --max-messages 3 --timeout-ms 8000'
  );
} catch { /* timeout ok */ }

if (dlqContent.includes('versao_nao_suportada') || dlqContent.includes('v99') || dlqContent.includes('reason')) {
  pass('Mensagens foram para a DLQ');
} else {
  fail(`DLQ não contém mensagens esperadas. Output: ${dlqContent.slice(0, 200)}`);
}

// 4. Ingestão continua saudável
const h2 = healthCheck();
if (h2?.status === 'ok') {
  pass('Ingestão saudável após versão desconhecida');
} else {
  fail('Ingestão degradou após versão desconhecida');
}

console.log('\n✅ Teste Unknown Version → DLQ concluído');

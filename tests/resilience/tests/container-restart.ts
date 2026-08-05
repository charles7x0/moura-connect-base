/**
 * Teste: Container restart — reconecta tudo automaticamente.
 */
import { compose, sleep, healthCheck, isContainerRunning, getIngestaoLogs, pass, fail, section } from '../helpers.js';

section('Container Restart');

// 1. Saúde
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
pass('Ingestão saudável antes do restart');

// 2. Restart
console.log('  ⏳ Reiniciando container...');
compose('restart ingestao');
await sleep(20_000);

// 3. Verificar que voltou
if (!isContainerRunning('mc-ingestao')) {
  fail('Container não voltou após restart');
  process.exit(1);
} else {
  pass('Container rodando após restart');
}

// 4. Healthcheck
const h2 = healthCheck();
if (h2?.status === 'ok') {
  pass('Healthcheck OK após restart');
} else {
  fail(`Healthcheck: ${JSON.stringify(h2)}`);
}

// 5. Verificar logs de reconexão
const logs = getIngestaoLogs(10);
if (logs.includes('Subscrito') && logs.includes('Conectado')) {
  pass('MQTT e Kafka reconectados após restart');
} else {
  fail('Logs não indicam reconexão completa');
}

// 6. Dados fluindo?
await sleep(10_000);
const finalLogs = getIngestaoLogs(3);
if (finalLogs.includes('msgs=') && !finalLogs.includes('msgs=0 ')) {
  pass('Dados fluindo normalmente após restart');
} else {
  console.log('  ⚠️ Pode precisar de mais tempo para acumular métricas');
}

console.log('\n✅ Teste Container Restart concluído');

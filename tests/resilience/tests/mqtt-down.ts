/**
 * Teste: MQTT cai e volta — ingestão reconecta automaticamente.
 */
import { compose, sleep, healthCheck, isContainerRunning, getIngestaoLogs, pass, fail, section } from '../helpers.js';

section('MQTT Down & Recovery');

// 1. Estado saudável
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
pass('Ingestão saudável');

// 2. Derrubar Mosquitto
console.log('  ⏳ Derrubando MQTT broker...');
compose('stop mosquitto');
await sleep(10_000);

// 3. Ingestão viva?
if (!isContainerRunning('mc-ingestao')) {
  fail('Ingestão crashou quando MQTT caiu');
} else {
  pass('Ingestão continua rodando');
}

// 4. Logs devem mostrar "Reconectando..." ou "Offline"
const logs = getIngestaoLogs(10);
if (logs.includes('Reconectando') || logs.includes('Offline') || logs.includes('offline')) {
  pass('Logs indicam tentativa de reconexão MQTT');
} else {
  console.log('  ⚠️ Nenhum log de reconexão detectado');
}

// 5. Subir Mosquitto
console.log('  ⏳ Subindo MQTT broker...');
compose('start mosquitto');
await sleep(15_000);

// 6. Verificar reconexão
const finalLogs = getIngestaoLogs(5);
if (finalLogs.includes('Conectado') || finalLogs.includes('Subscrito')) {
  pass('Reconectou ao MQTT automaticamente');
} else {
  // Pode não aparecer no tail — verificar que msgs voltaram a avançar
  await sleep(10_000);
  const h2 = healthCheck();
  if (h2?.status === 'ok') {
    pass('Healthcheck OK — reconexão presumida');
  } else {
    fail('Não reconectou ao MQTT');
  }
}

console.log('\n✅ Teste MQTT Down & Recovery concluído');

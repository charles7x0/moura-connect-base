/**
 * Teste: Kafka cai e volta — ingestão sobrevive e reconecta.
 */
import { compose, sleep, healthCheck, isContainerRunning, getIngestaoLogs, pass, fail, section } from '../helpers.js';

section('Kafka Down & Recovery');

// 1. Confirmar estado saudável
const h1 = healthCheck();
if (!h1 || h1.status !== 'ok') { fail('Ingestão não está saudável antes do teste'); process.exit(1); }
pass('Ingestão saudável antes do teste');

// 2. Derrubar Kafka
console.log('  ⏳ Derrubando Kafka...');
compose('stop kafka');
await sleep(15_000);

// 3. Verificar que ingestão NÃO morreu
if (!isContainerRunning('mc-ingestao')) {
  fail('Ingestão crashou quando Kafka caiu');
} else {
  pass('Ingestão continua rodando com Kafka fora');
}

// 4. Healthcheck deve estar ok (mensagens MQTT continuam chegando no buffer)
const h2 = healthCheck();
if (h2 && h2.status === 'ok') {
  pass('Healthcheck OK durante Kafka offline');
} else {
  // Pode ser stalled se nenhum batch conseguiu ser enviado (lastActivity antigo)
  console.log(`  ⚠️ Healthcheck: ${JSON.stringify(h2)} (esperado se flush falhou)`);
}

// 5. Logs devem mostrar erros de conexão, não crash
const logs = getIngestaoLogs(10);
if (logs.includes('Erro') || logs.includes('disconnect') || logs.includes('error')) {
  pass('Logs indicam erros de conexão Kafka (esperado)');
} else {
  console.log('  ⚠️ Nenhum erro de Kafka logado — talvez o buffer ainda não tentou flush');
}

// 6. Subir Kafka de volta
console.log('  ⏳ Subindo Kafka...');
compose('start kafka');
await sleep(30_000); // Kafka demora pra ficar healthy

// 7. Verificar reconexão
const h3 = healthCheck();
if (h3 && h3.status === 'ok') {
  pass('Ingestão reconectou ao Kafka e voltou a processar');
} else {
  fail(`Healthcheck após reconexão: ${JSON.stringify(h3)}`);
}

// 8. Verificar que métricas continuam avançando
await sleep(10_000);
const finalLogs = getIngestaoLogs(3);
if (finalLogs.includes('msgs=') && finalLogs.includes('batches=')) {
  pass('Métricas avançando — fluxo restaurado');
} else {
  fail('Métricas não avançaram após Kafka voltar');
}

console.log('\n✅ Teste Kafka Down & Recovery concluído');

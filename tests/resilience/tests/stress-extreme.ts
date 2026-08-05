/**
 * Teste de carga EXTREMO — simula 50.000 bancos publicando simultaneamente.
 * Objetivo: encontrar o ponto de saturação da ingestão.
 * 
 * Fases:
 *   1. Warm-up: 1.000 msgs
 *   2. Carga média: 10.000 msgs em 5s
 *   3. Burst: 50.000 msgs o mais rápido possível
 *   4. Sustentado: 20.000 msgs/s por 30s (simulando 50k bancos a cada 2.5s)
 * 
 * Métricas coletadas: throughput, latência, drops, memória do container.
 */
import mqtt, { MqttClient } from 'mqtt';
import { sleep, healthCheck, isContainerRunning, docker, pass, fail, section } from '../helpers.js';

const MQTT_URL = 'mqtt://localhost:1883';

interface Metrics {
  phase: string;
  published: number;
  durationMs: number;
  publishRate: number;
  healthy: boolean;
  drops: number;
  bufferSize: number;
  containerMemMb: number;
}

function getContainerMemory(): number {
  try {
    const stats = docker('stats mc-ingestao --no-stream --format "{{.MemUsage}}"');
    const match = stats.match(/([\d.]+)MiB/);
    return match ? parseFloat(match[1]) : 0;
  } catch {
    return 0;
  }
}

function getIngestaoMetrics(): { msgs: number; drops: number; buf: number } {
  try {
    const logs = docker('compose logs ingestao --tail 3');
    const match = logs.match(/msgs=(\d+).*?drops=(\d+).*?buf=(\d+)/);
    if (match) return { msgs: parseInt(match[1]), drops: parseInt(match[2]), buf: parseInt(match[3]) };
  } catch { /* */ }
  return { msgs: 0, drops: 0, buf: 0 };
}

function buildPayload(id: number): string {
  return JSON.stringify({
    bancoId: `LOAD-${id}`,
    siteId: `SITE-LOAD-${id % 100}`,
    timestamp: new Date().toISOString(),
    tensaoV: 50 + Math.random() * 4,
    correnteA: -0.5 + Math.random(),
    temperaturaC: 25 + Math.random() * 10,
    estadoCarga: 0.8 + Math.random() * 0.2,
    modo: 'flutuacao',
  });
}

async function publishBurst(clients: MqttClient[], count: number, label: string): Promise<{ durationMs: number; rate: number }> {
  const start = Date.now();
  const perClient = Math.ceil(count / clients.length);

  await Promise.all(clients.map(async (client, ci) => {
    for (let i = 0; i < perClient; i++) {
      const id = ci * perClient + i;
      client.publish(
        `moura/telemetria/SITE-LOAD-${id % 100}/LOAD-${id}`,
        buildPayload(id),
        { qos: 0 } // QoS 0 para máximo throughput de publicação
      );
    }
  }));

  const durationMs = Date.now() - start;
  const rate = Math.round(count / (durationMs / 1000));
  return { durationMs, rate };
}

// ═══════════════════════════════════════════
section('STRESS TEST EXTREMO');
console.log('  Objetivo: saturar a ingestão e medir limites\n');

// Pré-check
const h0 = healthCheck();
if (!h0 || h0.status !== 'ok') { fail('Ingestão não saudável'); process.exit(1); }
const memBefore = getContainerMemory();
console.log(`  Memória inicial: ${memBefore}MB`);

// Criar pool de conexões MQTT
const POOL_SIZE = 20;
console.log(`  ⏳ Criando ${POOL_SIZE} conexões MQTT...`);
const clients = await Promise.all(
  Array.from({ length: POOL_SIZE }, (_, i) =>
    mqtt.connectAsync(MQTT_URL, { clientId: `extreme-${i}-${Date.now()}`, clean: true })
  )
);
pass(`${POOL_SIZE} conexões MQTT estabelecidas`);

const results: Metrics[] = [];

// ─── FASE 1: Warm-up ────────────────────────
console.log('\n  ── FASE 1: Warm-up (1.000 msgs) ──');
const p1 = await publishBurst(clients, 1_000, 'warmup');
await sleep(3_000);
const h1 = healthCheck();
results.push({ phase: 'Warm-up', published: 1_000, ...p1, publishRate: p1.rate, healthy: h1?.status === 'ok', drops: 0, bufferSize: 0, containerMemMb: getContainerMemory() });
console.log(`  ${p1.rate} msgs/s | ${p1.durationMs}ms | Healthy: ${h1?.status}`);
pass('Warm-up OK');

// ─── FASE 2: Carga média (10.000 msgs) ────────
console.log('\n  ── FASE 2: Carga média (10.000 msgs) ──');
const p2 = await publishBurst(clients, 10_000, 'medium');
await sleep(5_000);
const h2 = healthCheck();
const m2 = getIngestaoMetrics();
results.push({ phase: 'Média', published: 10_000, ...p2, publishRate: p2.rate, healthy: h2?.status === 'ok', drops: m2.drops, bufferSize: m2.buf, containerMemMb: getContainerMemory() });
console.log(`  ${p2.rate} msgs/s | ${p2.durationMs}ms | Drops: ${m2.drops} | Buf: ${m2.buf}`);
if (h2?.status === 'ok') pass('Carga média OK'); else fail('Degradou na carga média');

// ─── FASE 3: Burst (50.000 msgs) ─────────────
console.log('\n  ── FASE 3: Burst extremo (50.000 msgs) ──');
const p3 = await publishBurst(clients, 50_000, 'burst');
console.log(`  Publicação: ${p3.rate} msgs/s em ${p3.durationMs}ms`);
console.log('  ⏳ Aguardando processamento (15s)...');
await sleep(15_000);
const h3 = healthCheck();
const m3 = getIngestaoMetrics();
results.push({ phase: 'Burst 50k', published: 50_000, ...p3, publishRate: p3.rate, healthy: h3?.status === 'ok', drops: m3.drops, bufferSize: m3.buf, containerMemMb: getContainerMemory() });
console.log(`  Drops: ${m3.drops} | Buffer: ${m3.buf} | Mem: ${getContainerMemory()}MB`);
if (isContainerRunning('mc-ingestao')) pass('Sobreviveu ao burst de 50k'); else fail('CRASHOU no burst');

// ─── FASE 4: Sustentado (20k msgs/s por 30s = 600k total) ────
console.log('\n  ── FASE 4: Carga sustentada (30s, ~600k msgs) ──');
const sustainStart = Date.now();
let totalSustained = 0;
const TARGET_RATE = 20_000; // msgs/s
const DURATION_S = 30;
const BATCH_SIZE = 5_000;
const INTERVAL_MS = Math.ceil((BATCH_SIZE / TARGET_RATE) * 1000); // ~250ms entre batches

for (let elapsed = 0; elapsed < DURATION_S * 1000; elapsed += INTERVAL_MS) {
  await publishBurst(clients, BATCH_SIZE, 'sustained');
  totalSustained += BATCH_SIZE;
  await sleep(Math.max(0, INTERVAL_MS - 50)); // Compensar overhead
}

const sustainDuration = Date.now() - sustainStart;
const sustainRate = Math.round(totalSustained / (sustainDuration / 1000));
console.log(`  Total: ${totalSustained} msgs em ${(sustainDuration / 1000).toFixed(1)}s (${sustainRate} msgs/s)`);
await sleep(10_000); // Deixar drenar

const h4 = healthCheck();
const m4 = getIngestaoMetrics();
const memAfter = getContainerMemory();
results.push({ phase: 'Sustentado 30s', published: totalSustained, durationMs: sustainDuration, publishRate: sustainRate, healthy: h4?.status === 'ok', drops: m4.drops, bufferSize: m4.buf, containerMemMb: memAfter });

if (isContainerRunning('mc-ingestao')) pass('Sobreviveu à carga sustentada'); else fail('CRASHOU na carga sustentada');

// ═══ RELATÓRIO FINAL ════════════════════════
console.log('\n\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║              RELATÓRIO DE CARGA — INGESTÃO                      ║');
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log('║ Fase           │ Msgs     │ Rate       │ Drops │ Buf  │ Mem     ║');
console.log('╠════════════════╪══════════╪════════════╪═══════╪══════╪═════════╣');
for (const r of results) {
  const phase = r.phase.padEnd(14);
  const msgs = r.published.toLocaleString().padStart(8);
  const rate = `${r.publishRate.toLocaleString()}/s`.padStart(10);
  const drops = r.drops.toString().padStart(5);
  const buf = r.bufferSize.toString().padStart(4);
  const mem = `${r.containerMemMb}MB`.padStart(7);
  console.log(`║ ${phase} │ ${msgs} │ ${rate} │ ${drops} │ ${buf} │ ${mem} ║`);
}
console.log('╠══════════════════════════════════════════════════════════════════╣');
console.log(`║ Memória: ${memBefore}MB → ${memAfter}MB (Δ${(memAfter - memBefore).toFixed(1)}MB)`.padEnd(67) + '║');
console.log(`║ Container vivo: ${isContainerRunning('mc-ingestao') ? 'SIM ✅' : 'NÃO ❌'}`.padEnd(67) + '║');
console.log(`║ Healthcheck final: ${h4?.status || 'FAIL'}`.padEnd(67) + '║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// Cleanup
await Promise.all(clients.map((c) => c.endAsync()));

if (!isContainerRunning('mc-ingestao')) {
  fail('Ingestão NÃO sobreviveu ao teste extremo');
} else if (m4.drops > 0) {
  console.log(`\n⚠️ ${m4.drops} mensagens descartadas — buffer overflow atingido (BUFFER_MAX_SIZE=5000)`);
  pass('Ingestão sobreviveu mas com drops (backpressure funcionou)');
} else {
  pass('Ingestão processou TUDO sem drops — ainda não saturou');
}

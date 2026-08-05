/**
 * Runner de todos os testes de resiliência.
 * Executa sequencialmente pois cada um manipula infraestrutura.
 */
import { execSync } from 'node:child_process';
import { section } from './helpers.js';

const tests = [
  { name: 'Malformed Payload', script: 'tests/malformed-payload.ts' },
  { name: 'Unknown Version → DLQ', script: 'tests/unknown-version.ts' },
  { name: 'Stress Test', script: 'tests/stress.ts' },
  { name: 'Container Restart', script: 'tests/container-restart.ts' },
  { name: 'MQTT Down & Recovery', script: 'tests/mqtt-down.ts' },
  { name: 'Kafka Down & Recovery', script: 'tests/kafka-down.ts' },
];

console.log('╔══════════════════════════════════════════╗');
console.log('║  TESTES DE RESILIÊNCIA — INGESTÃO       ║');
console.log('╚══════════════════════════════════════════╝');
console.log(`  ${tests.length} testes a executar\n`);

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    execSync(`npx tsx ${test.script}`, { cwd: import.meta.dirname, stdio: 'inherit', timeout: 120_000 });
    passed++;
  } catch {
    failed++;
    console.log(`\n  ⚠️ "${test.name}" falhou ou teve warnings\n`);
  }
}

console.log('\n╔══════════════════════════════════════════╗');
console.log(`║  RESULTADO: ${passed} passed, ${failed} failed        ║`);
console.log('╚══════════════════════════════════════════╝');

process.exitCode = failed > 0 ? 1 : 0;

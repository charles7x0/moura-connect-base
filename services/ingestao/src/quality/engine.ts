import { LeituraRaw, Leitura, QualityIndicator } from '../protocols/types.js';
import { QualityChecker, CheckContext } from './types.js';
import { latencyChecker } from './checkers/latency.js';
import { freshnessChecker } from './checkers/freshness.js';
import { duplicateChecker } from './checkers/duplicate.js';

const lastTimestamps = new Map<string, string>();

const checkers: QualityChecker[] = [
  latencyChecker,
  freshnessChecker,
  duplicateChecker,
];

export function registerChecker(checker: QualityChecker): void {
  checkers.push(checker);
  console.log(`[quality] Checker registrado: ${checker.name}`);
}

export function annotateQuality(raw: LeituraRaw): Leitura {
  const now = Date.now();
  const msgTime = new Date(raw.timestamp).getTime();
  const latencyMs = Math.max(0, now - msgTime);

  const context: CheckContext = {
    now,
    msgTime,
    latencyMs,
    lastTimestamp: lastTimestamps.get(raw.bancoId),
  };

  lastTimestamps.set(raw.bancoId, raw.timestamp);

  let totalPenalty = 0;
  let fresh = true;
  let duplicate = false;

  for (const checker of checkers) {
    const result = checker.check(raw, context);
    totalPenalty += result.penalty;
    if (result.fresh !== undefined) fresh = result.fresh;
    if (result.duplicate !== undefined && result.duplicate) duplicate = true;
  }

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const quality: QualityIndicator = { latencyMs, fresh, duplicate, score };

  return { ...raw, _quality: quality };
}

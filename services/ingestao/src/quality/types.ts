import { LeituraRaw } from '../protocols/types.js';

/** Contexto disponível para cada checker */
export interface CheckContext {
  now: number;
  msgTime: number;
  latencyMs: number;
  lastTimestamp?: string;
}

/** Resultado de um checker individual */
export interface CheckResult {
  penalty: number;
  fresh?: boolean;
  duplicate?: boolean;
}

/** Interface de um quality checker */
export interface QualityChecker {
  name: string;
  check(raw: LeituraRaw, context: CheckContext): CheckResult;
}

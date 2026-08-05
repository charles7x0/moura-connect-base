import { Leitura } from '@moura/types';
import { gravarLeitura } from '../repositories/leituras.repo.js';
import { atualizarEstado } from '../repositories/state.repo.js';
import { avaliarRegras } from '../rules/engine.js';

const QUALITY_THRESHOLD = Number(process.env.QUALITY_THRESHOLD) || 30;

let processedCount = 0;
let skippedLowQuality = 0;

/**
 * Handler de leitura — orquestra: gravar → atualizar estado → avaliar regras.
 * Verifica QUALITY_THRESHOLD antes de avaliar regras de alerta.
 */
export async function handle(leitura: Leitura): Promise<void> {
  // Gravar sempre (histórico completo com indicador de qualidade)
  await gravarLeitura(leitura);
  await atualizarEstado(leitura);

  // Regras de alerta: só avaliar se qualidade suficiente
  const score = leitura._quality?.score ?? 100;
  if (score >= QUALITY_THRESHOLD) {
    await avaliarRegras(leitura);
  } else {
    skippedLowQuality++;
  }

  processedCount++;
}

export function getQualityThreshold(): number {
  return QUALITY_THRESHOLD;
}

export function getMetrics(): { processedCount: number; skippedLowQuality: number } {
  return { processedCount, skippedLowQuality };
}

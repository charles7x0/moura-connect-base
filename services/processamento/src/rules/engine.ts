import { Leitura } from '@moura/types';
import * as stateRepo from '../repositories/state.repo.js';
import * as alertManager from '../alerts/alert-manager.js';
import { getEventRules } from './registry.js';
import { resolverOfflineSeNecessario } from './time-driven/banco-offline.js';

/**
 * Motor de regras — avalia todas as regras registradas para uma leitura.
 * Regras são adicionadas via registry, sem mexer aqui.
 */
export async function avaliarRegras(leitura: Leitura): Promise<void> {
  const rules = getEventRules();

  await Promise.allSettled([
    ...rules.map((rule) => rule.evaluate(leitura, stateRepo, alertManager)),
    resolverOfflineSeNecessario(leitura.bancoId),
  ]);
}

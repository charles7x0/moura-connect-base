import { Rule } from '../types.js';
import { config } from '../../config.js';
import { Leitura } from '@moura/types';
import * as stateRepo from '../../repositories/state.repo.js';
import * as alertManager from '../../alerts/alert-manager.js';

/**
 * Regra: Sobretemperatura (Severidade: Alta)
 * Dispara quando temperatura > 45°C (imediato, 1 leitura basta).
 * Resolve quando temperatura <= 45°C.
 */
export const sobretemperaturaRule: Rule = {
  name: 'sobretemperatura',
  async evaluate(
    leitura: Leitura,
    state: typeof stateRepo,
    alerts: typeof alertManager
  ): Promise<void> {
    const alertKey = `alert:active:${leitura.bancoId}:sobretemperatura`;

    if (leitura.temperaturaC > config.rules.temperaturaThresholdC) {
      if (!(await state.alertExists(alertKey))) {
        await alerts.abrirAlerta(leitura, 'sobretemperatura', 'alta');
      }
    } else {
      if (await state.alertExists(alertKey)) {
        await alerts.fecharAlerta(leitura.bancoId, 'sobretemperatura');
      }
    }
  },
};

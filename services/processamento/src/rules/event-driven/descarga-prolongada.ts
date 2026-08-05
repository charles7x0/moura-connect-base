import { Rule } from '../types.js';
import { config } from '../../config.js';
import { Leitura } from '@moura/types';
import * as stateRepo from '../../repositories/state.repo.js';
import * as alertManager from '../../alerts/alert-manager.js';

/**
 * Regra: Descarga Prolongada (Severidade: Média)
 * Dispara quando banco permanece em modo "descarga" por mais de 15 minutos.
 * Resolve quando modo != "descarga".
 */
export const descargaProlongadaRule: Rule = {
  name: 'descarga_prolongada',
  async evaluate(
    leitura: Leitura,
    state: typeof stateRepo,
    alerts: typeof alertManager
  ): Promise<void> {
    const startKey = `rule:descarga:${leitura.bancoId}:start`;
    const alertKey = `alert:active:${leitura.bancoId}:descarga_prolongada`;

    if (leitura.modo === 'descarga') {
      const start = await state.getKey(startKey);
      if (!start) {
        // Início da descarga — marcar timestamp
        await state.setAlertKey(startKey, Date.now().toString());
      } else {
        const elapsed = Date.now() - Number(start);
        if (elapsed > config.rules.descargaThresholdMs && !(await state.alertExists(alertKey))) {
          await alerts.abrirAlerta(leitura, 'descarga_prolongada', 'media');
        }
      }
    } else {
      // Saiu da descarga
      await state.delKey(startKey);
      if (await state.alertExists(alertKey)) {
        await alerts.fecharAlerta(leitura.bancoId, 'descarga_prolongada');
      }
    }
  },
};

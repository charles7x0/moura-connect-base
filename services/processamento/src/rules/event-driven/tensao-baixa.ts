import { Rule } from '../types.js';
import { config } from '../../config.js';
import { Leitura } from '@moura/types';
import * as stateRepo from '../../repositories/state.repo.js';
import * as alertManager from '../../alerts/alert-manager.js';

/**
 * Regra: Tensão Baixa (Severidade: Crítica)
 * Dispara quando tensão < 48V em 3 leituras consecutivas do mesmo banco.
 * Resolve quando tensão >= 48V.
 */
export const tensaoBaixaRule: Rule = {
  name: 'tensao_baixa',
  async evaluate(
    leitura: Leitura,
    state: typeof stateRepo,
    alerts: typeof alertManager
  ): Promise<void> {
    const countKey = `rule:tensao:${leitura.bancoId}:count`;
    const alertKey = `alert:active:${leitura.bancoId}:tensao_baixa`;

    if (leitura.tensaoV < config.rules.tensaoThresholdV) {
      const count = await state.incrKey(countKey);
      // TTL no contador para limpar se parar de receber leituras
      await state.expireKey(countKey, 300);

      if (count >= config.rules.tensaoCountThreshold && !(await state.alertExists(alertKey))) {
        await alerts.abrirAlerta(leitura, 'tensao_baixa', 'critica');
      }
    } else {
      // Tensão voltou ao normal
      await state.delKey(countKey);
      if (await state.alertExists(alertKey)) {
        await alerts.fecharAlerta(leitura.bancoId, 'tensao_baixa');
      }
    }
  },
};

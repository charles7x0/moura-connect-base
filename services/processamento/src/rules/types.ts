import { Leitura } from '@moura/types';
import * as stateRepo from '../repositories/state.repo.js';
import * as alertManager from '../alerts/alert-manager.js';

export interface Rule {
  /** Nome identificável da regra */
  name: string;
  /** Avalia a regra para uma leitura */
  evaluate(
    leitura: Leitura,
    state: typeof stateRepo,
    alerts: typeof alertManager
  ): Promise<void>;
}

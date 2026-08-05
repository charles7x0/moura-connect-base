import type { BancoState } from '@moura/types';

// Re-export for local use
export type { BancoState } from '@moura/types';

/** Eventos que podem causar transição de estado */
export type BancoEvent =
  | { type: 'LEITURA_OK' }
  | { type: 'TENSAO_BAIXA_ABERTA' }
  | { type: 'TENSAO_BAIXA_RESOLVIDA' }
  | { type: 'SOBRETEMPERATURA_ABERTA' }
  | { type: 'SOBRETEMPERATURA_RESOLVIDA' }
  | { type: 'DESCARGA_PROLONGADA_ABERTA' }
  | { type: 'DESCARGA_PROLONGADA_RESOLVIDA' }
  | { type: 'OFFLINE_DETECTADO' }
  | { type: 'ONLINE_RECUPERADO' };

/** Registro de uma transição de estado */
export interface StateTransition {
  bancoId: string;
  from: BancoState;
  to: BancoState;
  event: BancoEvent['type'];
  timestamp: string;
}

/** Estado persistido no Redis */
export interface PersistedState {
  state: BancoState;
  since: string;
  activeAlerts: string[];
}

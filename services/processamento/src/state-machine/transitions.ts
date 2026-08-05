import { BancoState, BancoEvent } from './types.js';

/**
 * Tabela de transições da FSM.
 * Dado o estado atual e um evento, retorna o novo estado.
 * Se não há transição definida, o estado permanece o mesmo.
 */
const transitionTable: Record<BancoState, Partial<Record<BancoEvent['type'], BancoState>>> = {
  normal: {
    TENSAO_BAIXA_ABERTA: 'critico',
    SOBRETEMPERATURA_ABERTA: 'alerta',
    DESCARGA_PROLONGADA_ABERTA: 'degradado',
    OFFLINE_DETECTADO: 'offline',
  },
  degradado: {
    TENSAO_BAIXA_ABERTA: 'critico',
    SOBRETEMPERATURA_ABERTA: 'alerta',
    DESCARGA_PROLONGADA_RESOLVIDA: 'normal', // Resolve via recalculação
    OFFLINE_DETECTADO: 'offline',
    LEITURA_OK: 'normal', // Só se não tem outros alertas (resolvido no engine)
  },
  alerta: {
    TENSAO_BAIXA_ABERTA: 'critico',
    SOBRETEMPERATURA_RESOLVIDA: 'normal', // Resolve via recalculação
    DESCARGA_PROLONGADA_ABERTA: 'alerta', // Permanece
    OFFLINE_DETECTADO: 'offline',
    LEITURA_OK: 'normal',
  },
  critico: {
    TENSAO_BAIXA_RESOLVIDA: 'normal', // Resolve via recalculação
    SOBRETEMPERATURA_ABERTA: 'critico', // Permanece
    OFFLINE_DETECTADO: 'offline',
    LEITURA_OK: 'normal',
  },
  offline: {
    ONLINE_RECUPERADO: 'normal', // Resolve via recalculação
    LEITURA_OK: 'normal',
  },
};

/**
 * Calcula a próxima transição dado estado atual e evento.
 * Retorna undefined se não há transição (estado permanece).
 */
export function getNextState(current: BancoState, event: BancoEvent['type']): BancoState | undefined {
  return transitionTable[current]?.[event];
}

/**
 * Calcula o estado correto baseado nos alertas ativos.
 * Usado após resolução para determinar o estado real
 * (pode ter múltiplos alertas ativos).
 */
export function calculateStateFromAlerts(activeAlerts: string[]): BancoState {
  if (activeAlerts.includes('banco_offline')) return 'offline';
  if (activeAlerts.includes('tensao_baixa')) return 'critico';
  if (activeAlerts.includes('sobretemperatura')) return 'alerta';
  if (activeAlerts.includes('descarga_prolongada')) return 'degradado';
  return 'normal';
}

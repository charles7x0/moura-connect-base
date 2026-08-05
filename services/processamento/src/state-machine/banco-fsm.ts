import { getRedis } from '../infra/redis.js';
import { BancoEvent, PersistedState, StateTransition } from './types.js';
import { calculateStateFromAlerts } from './transitions.js';

const STATE_KEY_PREFIX = 'banco:fsm:';
const TRANSITION_LOG_PREFIX = 'banco:transitions:';
const MAX_TRANSITION_LOG = 50;

/**
 * Obtém o estado atual de um banco.
 */
export async function getState(bancoId: string): Promise<PersistedState> {
  const redis = getRedis();
  const raw = await redis.get(`${STATE_KEY_PREFIX}${bancoId}`);

  if (!raw) {
    return { state: 'normal', since: new Date().toISOString(), activeAlerts: [] };
  }

  return JSON.parse(raw);
}

/**
 * Processa um evento na FSM de um banco.
 * Retorna a transição se houve mudança de estado, null se não.
 */
export async function processEvent(bancoId: string, event: BancoEvent): Promise<StateTransition | null> {
  const redis = getRedis();
  const current = await getState(bancoId);

  // Atualizar lista de alertas ativos baseado no evento
  const activeAlerts = [...current.activeAlerts];
  updateActiveAlerts(activeAlerts, event);

  // Calcular estado correto baseado nos alertas ativos
  const calculatedState = calculateStateFromAlerts(activeAlerts);

  // Se o estado não mudou, apenas atualizar alertas
  if (calculatedState === current.state) {
    const persisted: PersistedState = { ...current, activeAlerts };
    await redis.set(`${STATE_KEY_PREFIX}${bancoId}`, JSON.stringify(persisted));
    return null;
  }

  // Transição de estado
  const transition: StateTransition = {
    bancoId,
    from: current.state,
    to: calculatedState,
    event: event.type,
    timestamp: new Date().toISOString(),
  };

  // Persistir novo estado
  const persisted: PersistedState = {
    state: calculatedState,
    since: transition.timestamp,
    activeAlerts,
  };
  await redis.set(`${STATE_KEY_PREFIX}${bancoId}`, JSON.stringify(persisted));

  // Registrar transição no log (últimas N)
  await redis.lpush(
    `${TRANSITION_LOG_PREFIX}${bancoId}`,
    JSON.stringify(transition)
  );
  await redis.ltrim(`${TRANSITION_LOG_PREFIX}${bancoId}`, 0, MAX_TRANSITION_LOG - 1);

  console.log(`[fsm] ${bancoId}: ${transition.from} → ${transition.to} (${event.type})`);

  return transition;
}

/**
 * Obtém o histórico de transições de um banco.
 */
export async function getTransitionLog(bancoId: string, limit = 20): Promise<StateTransition[]> {
  const redis = getRedis();
  const raw = await redis.lrange(`${TRANSITION_LOG_PREFIX}${bancoId}`, 0, limit - 1);
  return raw.map((r) => JSON.parse(r));
}

/**
 * Atualiza a lista de alertas ativos baseado no evento recebido.
 */
function updateActiveAlerts(alerts: string[], event: BancoEvent): void {
  switch (event.type) {
    case 'TENSAO_BAIXA_ABERTA':
      if (!alerts.includes('tensao_baixa')) alerts.push('tensao_baixa');
      break;
    case 'TENSAO_BAIXA_RESOLVIDA':
      const tbIdx = alerts.indexOf('tensao_baixa');
      if (tbIdx >= 0) alerts.splice(tbIdx, 1);
      break;
    case 'SOBRETEMPERATURA_ABERTA':
      if (!alerts.includes('sobretemperatura')) alerts.push('sobretemperatura');
      break;
    case 'SOBRETEMPERATURA_RESOLVIDA':
      const stIdx = alerts.indexOf('sobretemperatura');
      if (stIdx >= 0) alerts.splice(stIdx, 1);
      break;
    case 'DESCARGA_PROLONGADA_ABERTA':
      if (!alerts.includes('descarga_prolongada')) alerts.push('descarga_prolongada');
      break;
    case 'DESCARGA_PROLONGADA_RESOLVIDA':
      const dpIdx = alerts.indexOf('descarga_prolongada');
      if (dpIdx >= 0) alerts.splice(dpIdx, 1);
      break;
    case 'OFFLINE_DETECTADO':
      if (!alerts.includes('banco_offline')) alerts.push('banco_offline');
      break;
    case 'ONLINE_RECUPERADO':
    case 'LEITURA_OK':
      const offIdx = alerts.indexOf('banco_offline');
      if (offIdx >= 0) alerts.splice(offIdx, 1);
      break;
  }
}

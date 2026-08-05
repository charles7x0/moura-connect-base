import crypto from 'node:crypto';
import { alertExists, setAlertKey, delKey, getKey } from '../repositories/state.repo.js';
import { publicarAlerta } from './alert-publisher.js';
import { processEvent, BancoEvent } from '../state-machine/index.js';
import { Leitura, AlertaEvento, RegraAlerta, Severidade } from '@moura/types';

/** Mapa de regra → evento FSM de abertura */
const OPEN_EVENTS: Record<RegraAlerta, BancoEvent['type']> = {
  tensao_baixa: 'TENSAO_BAIXA_ABERTA',
  sobretemperatura: 'SOBRETEMPERATURA_ABERTA',
  descarga_prolongada: 'DESCARGA_PROLONGADA_ABERTA',
  banco_offline: 'OFFLINE_DETECTADO',
};

/** Mapa de regra → evento FSM de resolução */
const CLOSE_EVENTS: Record<RegraAlerta, BancoEvent['type']> = {
  tensao_baixa: 'TENSAO_BAIXA_RESOLVIDA',
  sobretemperatura: 'SOBRETEMPERATURA_RESOLVIDA',
  descarga_prolongada: 'DESCARGA_PROLONGADA_RESOLVIDA',
  banco_offline: 'ONLINE_RECUPERADO',
};

/**
 * Abre um alerta: marca no Redis, publica evento Kafka, atualiza FSM.
 */
export async function abrirAlerta(
  leitura: Partial<Leitura> & { bancoId: string; siteId: string },
  regra: RegraAlerta,
  severidade: Severidade
): Promise<void> {
  const alertKey = `alert:active:${leitura.bancoId}:${regra}`;

  if (await alertExists(alertKey)) return;

  const alertaId = crypto.randomUUID();
  const evento: AlertaEvento = {
    alertaId,
    bancoId: leitura.bancoId,
    siteId: leitura.siteId,
    regra,
    severidade,
    tipo: 'abertura',
    timestamp: new Date().toISOString(),
    detalhes: {
      tensaoV: leitura.tensaoV,
      temperaturaC: leitura.temperaturaC,
      modo: leitura.modo,
    },
  };

  await setAlertKey(alertKey, '1');
  await setAlertKey(
    `alert:meta:${leitura.bancoId}:${regra}`,
    JSON.stringify({ alertaId, siteId: leitura.siteId, severidade, openedAt: evento.timestamp })
  );

  await publicarAlerta(evento);

  // Atualizar FSM
  await processEvent(leitura.bancoId, { type: OPEN_EVENTS[regra] });

  console.log(`[ALERTA ABERTO] ${regra} | ${leitura.bancoId} | ${severidade}`);
}

/**
 * Fecha um alerta: limpa Redis, publica resolução Kafka, atualiza FSM.
 */
export async function fecharAlerta(bancoId: string, regra: RegraAlerta): Promise<void> {
  const alertKey = `alert:active:${bancoId}:${regra}`;
  const metaKey = `alert:meta:${bancoId}:${regra}`;

  if (!(await alertExists(alertKey))) return;

  const metaRaw = await getKey(metaKey);
  if (!metaRaw) return;

  const { alertaId, siteId, severidade } = JSON.parse(metaRaw);

  const evento: AlertaEvento = {
    alertaId,
    bancoId,
    siteId,
    regra,
    severidade,
    tipo: 'resolucao',
    timestamp: new Date().toISOString(),
  };

  await delKey(alertKey);
  await delKey(metaKey);
  await publicarAlerta(evento);

  // Atualizar FSM
  await processEvent(bancoId, { type: CLOSE_EVENTS[regra] });

  console.log(`[ALERTA RESOLVIDO] ${regra} | ${bancoId}`);
}

import { getDb } from '../infra/mongo.js';
import type { AlertaEvento } from '@moura/types';
import { AlertaDoc } from '../types.js';

export async function getAlertas(
  filter: Record<string, unknown>,
  allowedSites?: string[]
): Promise<AlertaDoc[]> {
  const db = getDb();

  const query: Record<string, unknown> = { ...filter };
  if (allowedSites) {
    query.siteId = { $in: allowedSites };
  }

  const alertas = await db
    .collection<AlertaDoc>('alertas')
    .find(query)
    .sort({ aberturaEm: -1 })
    .limit(200)
    .toArray();

  return alertas;
}

export async function reconhecerAlerta(
  alertaId: string,
  email: string
): Promise<{ ok: boolean } | { error: string }> {
  const db = getDb();

  const alerta = await db.collection<AlertaDoc>('alertas').findOne({ alertaId });
  if (!alerta) {
    return { error: 'Alerta não encontrado' };
  }

  await db.collection<AlertaDoc>('alertas').updateOne(
    { alertaId },
    {
      $set: {
        reconhecidoPor: email,
        reconhecidoEm: new Date(),
      },
    }
  );

  return { ok: true };
}

/**
 * Processa evento de alerta vindo do Kafka.
 * 
 * ABERTURA: Upsert com chave bancoId + regra + status=ativo.
 * Se já existe alerta ativo para essa combinação, atualiza timestamp e detalhes (não cria duplicata).
 * Se não existe, cria novo.
 * 
 * RESOLUÇÃO: Fecha todos os alertas ativos para essa combinação bancoId + regra.
 */
export async function processAlertEvent(evento: AlertaEvento): Promise<void> {
  const db = getDb();
  const col = db.collection<AlertaDoc>('alertas');

  if (evento.tipo === 'abertura') {
    // Chave de deduplicação: bancoId + regra + status ativo
    await col.updateOne(
      { bancoId: evento.bancoId, regra: evento.regra, status: 'ativo' },
      {
        $set: {
          alertaId: evento.alertaId,
          siteId: evento.siteId,
          severidade: evento.severidade,
          aberturaEm: new Date(evento.timestamp),
          detalhes: evento.detalhes || {},
        },
        $setOnInsert: {
          bancoId: evento.bancoId,
          regra: evento.regra,
          status: 'ativo',
        },
      },
      { upsert: true }
    );
  } else if (evento.tipo === 'resolucao') {
    // Fechar TODOS os alertas ativos para este banco + regra
    await col.updateMany(
      { bancoId: evento.bancoId, regra: evento.regra, status: 'ativo' },
      {
        $set: {
          status: 'resolvido',
          resolvidoEm: new Date(evento.timestamp),
        },
      }
    );
  }
}

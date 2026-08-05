import { getDb } from '../infra/mongo.js';
import { getRedis } from '../infra/redis.js';
import { LeituraDoc, PaginatedLeituras, EstadoFsmResponse, FsmState, FsmTransition } from '../types.js';

export async function getLeituras(
  bancoId: string,
  de?: string,
  ate?: string,
  pagina: number = 1
): Promise<PaginatedLeituras> {
  const db = getDb();
  const PAGE_SIZE = 100;
  const page = Math.max(1, pagina);
  const skip = (page - 1) * PAGE_SIZE;

  const filter: Record<string, unknown> = { bancoId };
  const timestampFilter: Record<string, unknown> = {};

  if (de) timestampFilter.$gte = new Date(de);
  if (ate) timestampFilter.$lte = new Date(ate);
  if (Object.keys(timestampFilter).length > 0) {
    filter.timestamp = timestampFilter;
  }

  const [leituras, total] = await Promise.all([
    db
      .collection<LeituraDoc>('leituras')
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .toArray(),
    db.collection<LeituraDoc>('leituras').countDocuments(filter),
  ]);

  return {
    dados: leituras,
    paginacao: {
      pagina: page,
      porPagina: PAGE_SIZE,
      total,
      totalPaginas: Math.ceil(total / PAGE_SIZE),
    },
  };
}

export async function getEstadoFsm(
  bancoId: string
): Promise<EstadoFsmResponse> {
  const redis = getRedis();

  const fsmRaw = await redis.get(`banco:fsm:${bancoId}`);
  const fsm: FsmState = fsmRaw
    ? JSON.parse(fsmRaw) as FsmState
    : { state: 'normal', since: null, activeAlerts: [] };

  const transitionsRaw = await redis.lrange(`banco:transitions:${bancoId}`, 0, 19);
  const transitions: FsmTransition[] = transitionsRaw.map((r: string) => JSON.parse(r) as FsmTransition);

  return { ...fsm, transitions };
}

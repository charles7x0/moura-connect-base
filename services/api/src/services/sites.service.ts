import { getDb } from '../infra/mongo.js';
import { getRedis } from '../infra/redis.js';
import { JwtPayload } from '../auth/jwt.js';
import { SiteDoc, BancoDoc, FsmState, SiteOverview, BancoOverview } from '../types.js';

const STATE_SEVERITY: Record<string, number> = {
  normal: 0,
  degradado: 1,
  alerta: 2,
  critico: 3,
  offline: 4,
};

export async function getSites(user: JwtPayload): Promise<SiteOverview[]> {
  const db = getDb();
  const redis = getRedis();

  const filter: Record<string, unknown> = {};
  if (user.perfil === 'cliente') {
    filter.contratoId = { $in: user.contratos };
  }

  const sites = await db.collection<SiteDoc>('sites').find(filter).toArray();

  const resultado = await Promise.all(
    sites.map(async (site) => {
      const bancos = await db.collection<BancoDoc>('bancos').find({ siteId: site.siteId }).toArray();

      let alertasAtivos = 0;
      let alertaCritico = false;
      let minQualityScore = 100;
      let worstState = 'normal';

      for (const banco of bancos) {
        const estadoRaw = await redis.get(`banco:estado:${banco.bancoId}`);
        if (estadoRaw) {
          const estado = JSON.parse(estadoRaw) as { _quality?: { score: number } };
          const score = estado._quality?.score ?? 100;
          if (score < minQualityScore) minQualityScore = score;
        }

        const fsmRaw = await redis.get(`banco:fsm:${banco.bancoId}`);
        if (fsmRaw) {
          const fsm = JSON.parse(fsmRaw) as FsmState;
          if ((STATE_SEVERITY[fsm.state] ?? 0) > (STATE_SEVERITY[worstState] ?? 0)) {
            worstState = fsm.state;
          }
          alertasAtivos += fsm.activeAlerts?.length ?? 0;
          if (fsm.activeAlerts?.includes('tensao_baixa')) alertaCritico = true;
        }
      }

      return {
        siteId: site.siteId,
        nome: site.nome,
        uf: site.uf,
        cidade: site.cidade,
        contratoId: site.contratoId,
        totalBancos: bancos.length,
        alertasAtivos,
        alertaCritico,
        minQualityScore,
        worstState,
      };
    })
  );

  return resultado;
}

export async function getBancosBySite(siteId: string): Promise<BancoOverview[]> {
  const db = getDb();
  const redis = getRedis();
  const bancos = await db.collection<BancoDoc>('bancos').find({ siteId }).toArray();

  const resultado = await Promise.all(
    bancos.map(async (banco) => {
      const estadoRaw = await redis.get(`banco:estado:${banco.bancoId}`);
      const ultimaLeitura = estadoRaw ? JSON.parse(estadoRaw) : null;

      const fsmRaw = await redis.get(`banco:fsm:${banco.bancoId}`);
      const fsm = fsmRaw ? JSON.parse(fsmRaw) as FsmState : { state: 'normal' as const, since: null, activeAlerts: [] as string[] };

      return {
        bancoId: banco.bancoId,
        siteId: banco.siteId,
        modelo: banco.modelo,
        capacidadeAh: banco.capacidadeAh,
        tensaoNominalV: banco.tensaoNominalV,
        ultimaLeitura,
        state: fsm.state,
        activeAlerts: fsm.activeAlerts,
        alertasAtivos: fsm.activeAlerts,
        temAlerta: fsm.activeAlerts.length > 0,
      };
    })
  );

  return resultado;
}

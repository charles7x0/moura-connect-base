import { FastifyRequest, FastifyReply } from 'fastify';
import { getDb } from '../infra/mongo.js';
import { JwtPayload } from './jwt.js';
import { SiteDoc, BancoDoc } from '../types.js';

declare module 'fastify' {
  interface FastifyRequest {
    allowedSites?: string[];
  }
}

// Cache em memória com TTL (evita query ao Mongo a cada request)
const siteCache = new Map<string, { sites: string[]; expiresAt: number }>();
const CACHE_TTL_MS = 60_000; // 1 minuto

async function getAllowedSitesForUser(user: JwtPayload): Promise<string[]> {
  const cacheKey = user.contratos.sort().join(',');
  const cached = siteCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.sites;
  }

  const db = getDb();
  const sites = await db.collection<SiteDoc>('sites')
    .find({ contratoId: { $in: user.contratos } })
    .project<{ siteId: string }>({ siteId: 1, _id: 0 })
    .toArray();

  const siteIds = sites.map((s) => s.siteId);
  siteCache.set(cacheKey, { sites: siteIds, expiresAt: Date.now() + CACHE_TTL_MS });

  return siteIds;
}

/**
 * Resolve os sites que o usuário pode acessar.
 * Operador: todos. Cliente: apenas sites dos seus contratos (cacheado 1min).
 */
export async function resolveAllowedSites(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const user = request.user!;

  if (user.perfil === 'operador') return;

  request.allowedSites = await getAllowedSitesForUser(user);
}

export function canAccessSite(user: JwtPayload, siteId: string, allowedSites?: string[]): boolean {
  if (user.perfil === 'operador') return true;
  return allowedSites?.includes(siteId) ?? false;
}

export async function canAccessBanco(user: JwtPayload, bancoId: string, allowedSites?: string[]): Promise<boolean> {
  if (user.perfil === 'operador') return true;

  const db = getDb();
  const banco = await db.collection<BancoDoc>('bancos').findOne({ bancoId });
  if (!banco) return false;

  return allowedSites?.includes(banco.siteId) ?? false;
}

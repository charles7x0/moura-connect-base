import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../auth/jwt.js';
import { resolveAllowedSites, canAccessSite } from '../../auth/authorize.js';
import { getSites, getBancosBySite } from '../../services/sites.service.js';
import { SiteParams, SiteListResponse, BancoListResponse, ErrorResponse, SiteParamsType } from '../schemas.js';

export async function sitesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', resolveAllowedSites);

  app.get('/sites', {
    schema: {
      tags: ['Sites'],
      summary: 'Listar sites',
      description: 'Retorna sites com indicadores de saúde. Cliente só vê seus sites.',
      security: [{ bearerAuth: [] }],
      response: { 200: SiteListResponse },
    },
  }, async (request, reply) => {
    return reply.send(await getSites(request.user!));
  });

  app.get('/sites/:siteId/bancos', {
    schema: {
      tags: ['Sites'],
      summary: 'Bancos de um site',
      description: 'Retorna bancos com último estado, FSM e alertas ativos.',
      security: [{ bearerAuth: [] }],
      params: SiteParams,
      response: { 200: BancoListResponse, 403: ErrorResponse },
    },
  }, async (request, reply) => {
    const { siteId } = request.params as SiteParamsType;
    if (!canAccessSite(request.user!, siteId, request.allowedSites)) {
      return reply.code(403).send({ error: 'Acesso negado' });
    }
    return reply.send(await getBancosBySite(siteId));
  });
}

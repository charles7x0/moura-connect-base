import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../auth/jwt.js';
import { resolveAllowedSites, canAccessBanco } from '../../auth/authorize.js';
import { getEstadoFsm, getLeituras } from '../../services/bancos.service.js';
import { BancoParams, LeiturasQuery, EstadoFsmResponse, PaginacaoResponse, ErrorResponse, BancoParamsType, LeiturasQueryType } from '../schemas.js';

export async function bancosRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', resolveAllowedSites);

  app.get('/bancos/:bancoId/estado', {
    schema: {
      tags: ['Bancos'],
      summary: 'Estado FSM do banco',
      description: 'Retorna estado atual da máquina de estados + histórico de transições.',
      security: [{ bearerAuth: [] }],
      params: BancoParams,
      response: { 200: EstadoFsmResponse, 403: ErrorResponse },
    },
  }, async (request, reply) => {
    const { bancoId } = request.params as BancoParamsType;
    if (!(await canAccessBanco(request.user!, bancoId, request.allowedSites))) {
      return reply.code(403).send({ error: 'Acesso negado' });
    }
    return reply.send(await getEstadoFsm(bancoId));
  });

  app.get('/bancos/:bancoId/leituras', {
    schema: {
      tags: ['Bancos'],
      summary: 'Histórico de leituras',
      description: 'Retorna leituras paginadas de um banco num período.',
      security: [{ bearerAuth: [] }],
      params: BancoParams,
      querystring: LeiturasQuery,
      response: { 200: PaginacaoResponse, 403: ErrorResponse },
    },
  }, async (request, reply) => {
    const { bancoId } = request.params as BancoParamsType;
    const { de, ate, pagina = '1' } = request.query as LeiturasQueryType;
    if (!(await canAccessBanco(request.user!, bancoId, request.allowedSites))) {
      return reply.code(403).send({ error: 'Acesso negado' });
    }
    return reply.send(await getLeituras(bancoId, de, ate, Number(pagina)));
  });
}

import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../../auth/jwt.js';
import { resolveAllowedSites } from '../../auth/authorize.js';
import { getAlertas, reconhecerAlerta } from '../../services/alertas.service.js';
import { getDb } from '../../infra/mongo.js';
import {
  AlertasQuery, AlertaListResponse, AlertaIdParams,
  OkResponse, ErrorResponse, AlertasQueryType, AlertaIdParamsType,
} from '../schemas.js';

export async function alertasRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', authMiddleware);
  app.addHook('onRequest', resolveAllowedSites);

  app.get('/alertas', {
    schema: {
      tags: ['Alertas'],
      summary: 'Listar alertas',
      description: 'Retorna alertas filtrados por status. Cliente só vê alertas dos seus sites.',
      security: [{ bearerAuth: [] }],
      querystring: AlertasQuery,
      response: { 200: AlertaListResponse },
    },
  }, async (request, reply) => {
    const { status, reconhecido } = request.query as AlertasQueryType;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (reconhecido === 'true') filter.reconhecidoPor = { $exists: true, $ne: null };
    if (reconhecido === 'false') filter.reconhecidoPor = { $exists: false };
    const allowedSites = request.user!.perfil === 'cliente' ? request.allowedSites : undefined;
    return reply.send(await getAlertas(filter, allowedSites));
  });

  app.post('/alertas/:id/reconhecer', {
    schema: {
      tags: ['Alertas'],
      summary: 'Reconhecer alerta',
      description: 'Marca um alerta como visto pelo operador.',
      security: [{ bearerAuth: [] }],
      params: AlertaIdParams,
      response: { 200: OkResponse, 403: ErrorResponse, 404: ErrorResponse },
    },
  }, async (request, reply) => {
    const { id } = request.params as AlertaIdParamsType;
    const user = request.user!;

    if (user.perfil === 'cliente' && request.allowedSites) {
      const db = getDb();
      const alerta = await db.collection('alertas').findOne({ alertaId: id });
      if (!alerta) return reply.code(404).send({ error: 'Alerta não encontrado' });
      if (!request.allowedSites.includes(alerta.siteId)) return reply.code(403).send({ error: 'Acesso negado' });
    }

    const result = await reconhecerAlerta(id, user.email);
    if ('error' in result) return reply.code(404).send(result);
    return reply.send(result);
  });
}

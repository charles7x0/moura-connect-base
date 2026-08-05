import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface JwtPayload {
  email: string;
  perfil: 'operador' | 'cliente';
  contratos: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Token não fornecido' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
    request.user = payload;
  } catch {
    reply.code(401).send({ error: 'Token inválido ou expirado' });
  }
}

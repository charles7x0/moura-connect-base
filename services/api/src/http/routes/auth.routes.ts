import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb } from '../../infra/mongo.js';
import { config } from '../../config.js';
import { LoginBody, LoginResponse, ErrorResponse, LoginBodyType } from '../schemas.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', {
    // #4: Rate limit mais agressivo no login (5 tentativas/min por IP)
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags: ['Auth'],
      summary: 'Login',
      description: 'Autentica com email/senha e retorna JWT. Rate limit: 5 req/min.',
      body: LoginBody,
      response: { 200: LoginResponse, 400: ErrorResponse, 401: ErrorResponse, 429: ErrorResponse },
    },
  }, async (request, reply) => {
    const { email, senha } = request.body as LoginBodyType;

    // #10: NoSQL injection protection — garantir que email é string pura
    if (typeof email !== 'string' || typeof senha !== 'string') {
      return reply.code(400).send({ error: 'Dados inválidos' });
    }

    const db = getDb();

    // Query segura: email é validado como string pelo JSON Schema + check acima
    const usuario = await db.collection('usuarios').findOne({ email: { $eq: email } });
    if (!usuario) return reply.code(401).send({ error: 'Credenciais inválidas' });

    const match = await bcrypt.compare(senha, usuario.senhaHash);
    if (!match) return reply.code(401).send({ error: 'Credenciais inválidas' });

    const token = jwt.sign(
      { email: usuario.email, perfil: usuario.perfil, contratos: usuario.contratos || [] },
      config.jwtSecret,
      { expiresIn: '8h' }
    );

    return reply.send({
      token,
      usuario: { email: usuario.email, nome: usuario.nome, perfil: usuario.perfil, contratos: usuario.contratos || [] },
    });
  });
}

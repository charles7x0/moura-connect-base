import { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { getDb } from '../../infra/mongo.js';
import { JwtPayload } from '../../auth/jwt.js';
import { SiteDoc } from '../../types.js';

interface WsClient {
  ws: WebSocket;
  user: JwtPayload;
  allowedSites: string[];
}

const clients: WsClient[] = [];

export async function setupWebSocket(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) { socket.close(4001, 'Token não fornecido'); return; }

    let user: JwtPayload;
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      if (typeof decoded === 'string') { socket.close(4002, 'Token formato inválido'); return; }
      user = decoded as JwtPayload;
    } catch {
      socket.close(4001, 'Token inválido'); return;
    }

    let allowedSites: string[] = [];
    if (user.perfil === 'cliente') {
      const db = getDb();
      const sites = await db.collection<SiteDoc>('sites')
        .find({ contratoId: { $in: user.contratos } })
        .project<{ siteId: string }>({ siteId: 1, _id: 0 })
        .toArray();
      allowedSites = sites.map((s) => s.siteId);
    }

    const client: WsClient = { ws: socket, user, allowedSites };
    clients.push(client);
    console.log(`[ws] Conectado: ${user.email} (${user.perfil})`);

    socket.on('close', () => {
      const idx = clients.indexOf(client);
      if (idx >= 0) clients.splice(idx, 1);
      console.log(`[ws] Desconectado: ${user.email}`);
    });
  });
}

export function broadcastToAuthorized(siteId: string, payload: unknown): void {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws.readyState !== 1) continue;
    if (client.allowedSites.length === 0 || client.allowedSites.includes(siteId)) {
      client.ws.send(message);
    }
  }
}

export function getConnectedClientsCount(): number {
  return clients.filter((c) => c.ws.readyState === 1).length;
}

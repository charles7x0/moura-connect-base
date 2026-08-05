import { createServer, IncomingMessage, ServerResponse } from 'node:http';

let lastActivity = Date.now();
let livenessTimeoutMs = 60_000;

/** Marcar atividade — chamar sempre que uma mensagem for processada */
export function markActivity(): void {
  lastActivity = Date.now();
}

function isAlive(): boolean {
  return Date.now() - lastActivity < livenessTimeoutMs;
}

export interface HealthOptions {
  port?: number;
  timeoutMs?: number;
}

/**
 * Inicia servidor HTTP de healthcheck.
 * 200 = alive, 503 = stalled.
 */
export function startHealthServer(options?: HealthOptions): void {
  const port = options?.port ?? (Number(process.env.HEALTH_PORT) || 8080);
  livenessTimeoutMs = options?.timeoutMs ?? (Number(process.env.LIVENESS_TIMEOUT_MS) || 60_000);

  const server = createServer((_req: IncomingMessage, res: ServerResponse) => {
    if (isAlive()) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', lastActivity: new Date(lastActivity).toISOString() }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'stalled', lastActivity: new Date(lastActivity).toISOString() }));
    }
  });

  server.listen(port, () => {
    console.log(`[health] Healthcheck na porta ${port}`);
  });
}

# Guia de Implementação — Moura Connect

## Visão Geral do Sistema

Plataforma de monitoramento preditivo de baterias estacionárias. Captura leituras de tensão, corrente e temperatura, detecta degradação e gera alertas antes da falha.

**Fluxo de dados:**
```
Simulador → MQTT → [ingestao] → Kafka(telemetria.leituras) → [processamento] → MongoDB + Redis + Kafka(alertas.eventos) → [api] → WebSocket/REST → [web]
```

## Stack Escolhida

| Serviço | Tecnologia | Justificativa |
|---------|-----------|---------------|
| ingestao | Node.js + TypeScript + mqtt.js + kafkajs | Leve, async, mesma stack do time |
| processamento | Node.js + TypeScript + kafkajs + mongoose + ioredis | Precisa acessar Mongo e Redis |
| api | Node.js + TypeScript + Fastify + kafkajs + ws + jsonwebtoken | Performance, WS nativo |
| web | Next.js 14 + React + Recharts + Tailwind (ISA 101) | SSR, App Router, HMI de alta performance |

---

## Estrutura de Pastas Final

```
moura-connect-base/
├── docker-compose.yml          ← ESTENDER (adicionar 4 serviços)
├── mosquitto/
├── seed/
├── simulador/
├── services/
│   ├── ingestao/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── mqtt-subscriber.ts
│   │       ├── kafka-producer.ts
│   │       └── validator.ts
│   ├── processamento/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── kafka-consumer.ts
│   │       ├── mongo-writer.ts
│   │       ├── redis-cache.ts
│   │       ├── alert-publisher.ts
│   │       └── rules/
│   │           ├── engine.ts
│   │           ├── tensao-baixa.ts
│   │           ├── sobretemperatura.ts
│   │           ├── banco-offline.ts
│   │           └── descarga-prolongada.ts
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── app.ts
│   │       ├── auth/
│   │       │   ├── jwt.ts
│   │       │   └── authorize.ts
│   │       ├── routes/
│   │       │   ├── auth.routes.ts
│   │       │   ├── sites.routes.ts
│   │       │   ├── bancos.routes.ts
│   │       │   └── alertas.routes.ts
│   │       ├── websocket/
│   │       │   └── ws-server.ts
│   │       └── kafka-consumer.ts
│   └── web/
│       ├── Dockerfile
│       ├── package.json
│       └── src/
│           └── app/
│               ├── login/page.tsx
│               ├── sites/page.tsx
│               └── bancos/[bancoId]/page.tsx
├── tests/
│   └── integration/
│       └── mqtt-to-alert.test.ts
├── shared/
│   └── types.ts                ← Tipos compartilhados entre serviços
├── README.md
└── ARQUITETURA.md
```

---

## Etapa 1 — Serviço de Ingestão

### Responsabilidade
Ponte entre o campo (MQTT) e o sistema interno (Kafka). Não conhece banco de dados nem alertas.

### Implementação

**1.1 — Subscribir MQTT**
```typescript
// src/mqtt-subscriber.ts
import mqtt from 'mqtt';

const client = mqtt.connect(process.env.MQTT_URL || 'mqtt://mosquitto:1883');

client.on('connect', () => {
  client.subscribe('moura/telemetria/#');
  console.log('[ingestao] Subscrito em moura/telemetria/#');
});

client.on('message', (topic, payload) => {
  // topic: moura/telemetria/{siteId}/{bancoId}
  // payload: JSON da leitura
  handleMessage(topic, payload);
});
```

**1.2 — Validar payload (zod)**
```typescript
// src/validator.ts
import { z } from 'zod';

export const leituraSchema = z.object({
  bancoId: z.string().min(1),
  siteId: z.string().min(1),
  timestamp: z.string().datetime(),
  tensaoV: z.number(),
  correnteA: z.number(),
  temperaturaC: z.number(),
  estadoCarga: z.number().min(0).max(1),
  modo: z.enum(['flutuacao', 'descarga', 'recarga']),
});

export type Leitura = z.infer<typeof leituraSchema>;
```

**1.3 — Publicar no Kafka**
```typescript
// src/kafka-producer.ts
import { Kafka, CompressionTypes } from 'kafkajs';

const kafka = new Kafka({
  clientId: 'ingestao',
  brokers: [process.env.KAFKA_BROKER || 'kafka:29092'],
  retry: { retries: 10, initialRetryTime: 3000 },
});

const producer = kafka.producer();

export async function publishLeitura(leitura: Leitura): Promise<void> {
  await producer.send({
    topic: 'telemetria.leituras',
    messages: [{
      key: leitura.bancoId,  // Garante ordenação por banco na mesma partição
      value: JSON.stringify(leitura),
    }],
    compression: CompressionTypes.Snappy,
  });
}
```

**1.4 — Tratamento de erro**
- Mensagem inválida → log warning + descarta (NÃO derrubar o serviço)
- Kafka indisponível → retry com backoff exponencial (kafkajs já faz)
- MQTT desconectou → mqtt.js reconecta automaticamente

### Variáveis de ambiente
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| MQTT_URL | mqtt://mosquitto:1883 | Broker MQTT |
| KAFKA_BROKER | kafka:29092 | Broker Kafka |

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["node", "dist/index.js"]
```

### Checklist
- [ ] Subscribe `moura/telemetria/#`
- [ ] Validar JSON com zod
- [ ] Publicar em `telemetria.leituras` com key = bancoId
- [ ] Descartar mensagens inválidas sem derrubar
- [ ] Log de métricas (mensagens/segundo)

---

## Etapa 2 — Serviço de Processamento

### Responsabilidade
Consome leituras do Kafka. Faz 3 coisas: grava no MongoDB, atualiza cache Redis, aplica regras de alerta.

### 2.1 — Consumer Kafka
```typescript
const consumer = kafka.consumer({ groupId: 'processamento-group' });
await consumer.subscribe({ topic: 'telemetria.leituras', fromBeginning: false });

await consumer.run({
  eachMessage: async ({ message }) => {
    const leitura: Leitura = JSON.parse(message.value!.toString());
    
    await Promise.all([
      gravarMongo(leitura),
      atualizarRedis(leitura),
      avaliarRegras(leitura),
    ]);
  },
});
```

### 2.2 — Gravar no MongoDB
```typescript
// Collection: leituras
// Index composto: { bancoId: 1, timestamp: -1 } para paginação eficiente
await db.collection('leituras').insertOne({
  ...leitura,
  timestamp: new Date(leitura.timestamp),
  _ingestedAt: new Date(),
});
```

### 2.3 — Atualizar Redis (último estado)
```typescript
// Key: banco:estado:{bancoId}
// Valor: último payload completo + timestamp de quando chegou
await redis.set(
  `banco:estado:${leitura.bancoId}`,
  JSON.stringify({ ...leitura, receivedAt: Date.now() }),
  'EX', 600  // TTL 10 min — se expirar, banco está offline
);
```

### 2.4 — Motor de Regras de Alerta

**Conceito fundamental:** Um alerta por CONDIÇÃO, não por leitura. Se a tensão está baixa por 30 minutos = 1 alerta ativo, não 360.

**Estado das regras no Redis:**
```
alert:active:{bancoId}:{regra}     → "1" (existe = alerta ativo)
alert:meta:{bancoId}:{regra}       → { openedAt, alertId }
rule:tensao:{bancoId}:count        → contador de leituras consecutivas < 48V
rule:descarga:{bancoId}:start      → timestamp início da descarga
```

#### Regra 1 — Tensão Baixa (Crítica)
```typescript
// Dispara: tensão < 48V em 3 leituras SEGUIDAS do mesmo banco
// Resolve: tensão >= 48V (reseta contador)

async function avaliarTensaoBaixa(leitura: Leitura): Promise<void> {
  const key = `rule:tensao:${leitura.bancoId}:count`;
  const alertKey = `alert:active:${leitura.bancoId}:tensao_baixa`;

  if (leitura.tensaoV < 48) {
    const count = await redis.incr(key);
    if (count >= 3 && !(await redis.exists(alertKey))) {
      await abrirAlerta(leitura, 'tensao_baixa', 'critica');
    }
  } else {
    await redis.del(key);
    if (await redis.exists(alertKey)) {
      await fecharAlerta(leitura.bancoId, 'tensao_baixa');
    }
  }
}
```

#### Regra 2 — Sobretemperatura (Alta)
```typescript
// Dispara: temperatura > 45°C (imediato, 1 leitura basta)
// Resolve: temperatura <= 45°C

async function avaliarSobretemperatura(leitura: Leitura): Promise<void> {
  const alertKey = `alert:active:${leitura.bancoId}:sobretemperatura`;

  if (leitura.temperaturaC > 45) {
    if (!(await redis.exists(alertKey))) {
      await abrirAlerta(leitura, 'sobretemperatura', 'alta');
    }
  } else {
    if (await redis.exists(alertKey)) {
      await fecharAlerta(leitura.bancoId, 'sobretemperatura');
    }
  }
}
```

#### Regra 3 — Banco Offline (Alta)
```typescript
// Dispara: > 10 min sem NENHUMA leitura daquele banco
// Resolve: qualquer leitura chega daquele banco
// IMPLEMENTAÇÃO: cron a cada 60s verifica TTLs no Redis

async function verificarOffline(): Promise<void> {
  // Buscar todos os bancos cadastrados no Mongo
  const bancos = await db.collection('bancos').find().toArray();
  const agora = Date.now();
  const LIMITE_MS = Number(process.env.OFFLINE_THRESHOLD_MS) || 600_000; // 10 min

  for (const banco of bancos) {
    const estado = await redis.get(`banco:estado:${banco.bancoId}`);
    const alertKey = `alert:active:${banco.bancoId}:banco_offline`;

    if (!estado) {
      // Nunca recebeu leitura ou TTL expirou
      if (!(await redis.exists(alertKey))) {
        await abrirAlerta(
          { bancoId: banco.bancoId, siteId: banco.siteId } as any,
          'banco_offline', 'alta'
        );
      }
    } else {
      const { receivedAt } = JSON.parse(estado);
      if (agora - receivedAt > LIMITE_MS) {
        if (!(await redis.exists(alertKey))) {
          await abrirAlerta(
            { bancoId: banco.bancoId, siteId: banco.siteId } as any,
            'banco_offline', 'alta'
          );
        }
      } else {
        // Banco voltou a publicar
        if (await redis.exists(alertKey)) {
          await fecharAlerta(banco.bancoId, 'banco_offline');
        }
      }
    }
  }
}

// Rodar a cada 60 segundos
setInterval(verificarOffline, 60_000);
```

#### Regra 4 — Descarga Prolongada (Média)
```typescript
// Dispara: > 15 min seguidos em modo "descarga"
// Resolve: modo != "descarga"

async function avaliarDescargaProlongada(leitura: Leitura): Promise<void> {
  const startKey = `rule:descarga:${leitura.bancoId}:start`;
  const alertKey = `alert:active:${leitura.bancoId}:descarga_prolongada`;
  const LIMITE_MS = Number(process.env.DESCARGA_THRESHOLD_MS) || 900_000; // 15 min

  if (leitura.modo === 'descarga') {
    const start = await redis.get(startKey);
    if (!start) {
      await redis.set(startKey, Date.now().toString());
    } else {
      const elapsed = Date.now() - Number(start);
      if (elapsed > LIMITE_MS && !(await redis.exists(alertKey))) {
        await abrirAlerta(leitura, 'descarga_prolongada', 'media');
      }
    }
  } else {
    await redis.del(startKey);
    if (await redis.exists(alertKey)) {
      await fecharAlerta(leitura.bancoId, 'descarga_prolongada');
    }
  }
}
```

#### Publicar Eventos de Alerta
```typescript
// Formato do evento publicado em alertas.eventos
interface AlertaEvento {
  alertaId: string;          // UUID
  bancoId: string;
  siteId: string;
  regra: 'tensao_baixa' | 'sobretemperatura' | 'banco_offline' | 'descarga_prolongada';
  severidade: 'critica' | 'alta' | 'media';
  tipo: 'abertura' | 'resolucao';
  timestamp: string;         // ISO 8601
  detalhes?: {               // contexto da leitura que disparou
    tensaoV?: number;
    temperaturaC?: number;
    modo?: string;
  };
}

async function abrirAlerta(leitura: Leitura, regra: string, severidade: string) {
  const alertaId = crypto.randomUUID();
  const evento: AlertaEvento = {
    alertaId,
    bancoId: leitura.bancoId,
    siteId: leitura.siteId,
    regra, severidade,
    tipo: 'abertura',
    timestamp: new Date().toISOString(),
    detalhes: { tensaoV: leitura.tensaoV, temperaturaC: leitura.temperaturaC, modo: leitura.modo },
  };

  // Marcar como ativo no Redis
  await redis.set(`alert:active:${leitura.bancoId}:${regra}`, '1');
  await redis.set(`alert:meta:${leitura.bancoId}:${regra}`, JSON.stringify({ alertaId, openedAt: evento.timestamp }));

  // Publicar no Kafka
  await producer.send({
    topic: 'alertas.eventos',
    messages: [{ key: leitura.bancoId, value: JSON.stringify(evento) }],
  });

  console.log(`[ALERTA ABERTO] ${regra} | ${leitura.bancoId} | ${severidade}`);
}

async function fecharAlerta(bancoId: string, regra: string) {
  const meta = await redis.get(`alert:meta:${bancoId}:${regra}`);
  if (!meta) return;
  const { alertaId, openedAt } = JSON.parse(meta);

  const evento: AlertaEvento = {
    alertaId,
    bancoId,
    siteId: '', // resolver do banco cadastrado se necessário
    regra, severidade: '', // copiar do alerta original
    tipo: 'resolucao',
    timestamp: new Date().toISOString(),
  };

  await redis.del(`alert:active:${bancoId}:${regra}`);
  await redis.del(`alert:meta:${bancoId}:${regra}`);

  await producer.send({
    topic: 'alertas.eventos',
    messages: [{ key: bancoId, value: JSON.stringify(evento) }],
  });

  console.log(`[ALERTA RESOLVIDO] ${regra} | ${bancoId}`);
}
```

### Variáveis de ambiente (configuráveis para dev)
| Variável | Padrão | Descrição |
|----------|--------|-----------|
| KAFKA_BROKER | kafka:29092 | Broker Kafka |
| MONGO_URL | mongodb://mongo:27017/moura | MongoDB |
| REDIS_URL | redis://redis:6379 | Redis |
| OFFLINE_THRESHOLD_MS | 600000 | Limiar banco offline (10 min) |
| DESCARGA_THRESHOLD_MS | 900000 | Limiar descarga prolongada (15 min) |
| TENSAO_THRESHOLD_V | 48 | Tensão mínima |
| TEMPERATURA_THRESHOLD_C | 45 | Temperatura máxima |
| TENSAO_COUNT_THRESHOLD | 3 | Leituras consecutivas para tensão baixa |

> **Dica de dev:** Reduza os thresholds para segundos durante desenvolvimento!

### Checklist
- [ ] Consumir `telemetria.leituras`
- [ ] Gravar cada leitura no MongoDB (collection `leituras`)
- [ ] Atualizar último estado no Redis
- [ ] Regra tensão baixa (3 consecutivas < 48V)
- [ ] Regra sobretemperatura (> 45°C)
- [ ] Regra banco offline (> 10 min sem leitura)
- [ ] Regra descarga prolongada (> 15 min em descarga)
- [ ] Publicar evento abertura em `alertas.eventos`
- [ ] Publicar evento resolução quando normalizar
- [ ] Um alerta por condição (não duplicar)

---

## Etapa 3 — Serviço API

### Responsabilidade
Porta de entrada do usuário. Consome `alertas.eventos`, mantém estado dos alertas. Expõe REST + WebSocket.

### 3.1 — Autenticação JWT

```typescript
// POST /auth/login
// Body: { email, senha }
// Response: { token, usuario: { email, nome, perfil, contratos } }

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

async function login(email: string, senha: string) {
  const usuario = await db.collection('usuarios').findOne({ email });
  if (!usuario) throw new Error('Credenciais inválidas');

  const match = await bcrypt.compare(senha, usuario.senhaHash);
  if (!match) throw new Error('Credenciais inválidas');

  const token = jwt.sign(
    { email: usuario.email, perfil: usuario.perfil, contratos: usuario.contratos },
    process.env.JWT_SECRET || 'moura-secret',
    { expiresIn: '8h' }
  );

  return { token, usuario: { email: usuario.email, nome: usuario.nome, perfil: usuario.perfil } };
}
```

### 3.2 — Middleware de Autorização por Perfil

```typescript
// Operador: enxerga TODOS os sites
// Cliente: enxerga APENAS sites do contrato dele

async function authorize(req, res, next) {
  const user = req.user; // Populado pelo middleware JWT

  if (user.perfil === 'operador') return next();

  // Cliente: buscar sites permitidos
  const sites = await db.collection('sites')
    .find({ contratoId: { $in: user.contratos } })
    .project({ siteId: 1 })
    .toArray();

  req.allowedSites = sites.map(s => s.siteId);
  next();
}

// Helper para verificar acesso a um banco específico
async function checkBancoAccess(user, bancoId: string): Promise<boolean> {
  if (user.perfil === 'operador') return true;

  const banco = await db.collection('bancos').findOne({ bancoId });
  if (!banco) return false;

  const site = await db.collection('sites').findOne({ siteId: banco.siteId });
  if (!site) return false;

  return user.contratos.includes(site.contratoId);
}
```

### 3.3 — Rotas REST

#### GET /sites/{siteId}/bancos
```typescript
// Retorna bancos do site com última leitura (do Redis) e status de alerta
// FILTRAR por allowedSites se for cliente

app.get('/sites/:siteId/bancos', auth, authorize, async (req, res) => {
  const { siteId } = req.params;

  // Checar acesso
  if (req.user.perfil === 'cliente' && !req.allowedSites.includes(siteId)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const bancos = await db.collection('bancos').find({ siteId }).toArray();

  const resultado = await Promise.all(bancos.map(async (banco) => {
    // Última leitura do Redis
    const estadoRaw = await redis.get(`banco:estado:${banco.bancoId}`);
    const ultimaLeitura = estadoRaw ? JSON.parse(estadoRaw) : null;

    // Alertas ativos (verificar keys no Redis)
    const alertas = [];
    for (const regra of ['tensao_baixa', 'sobretemperatura', 'banco_offline', 'descarga_prolongada']) {
      if (await redis.exists(`alert:active:${banco.bancoId}:${regra}`)) {
        alertas.push(regra);
      }
    }

    return {
      bancoId: banco.bancoId,
      modelo: banco.modelo,
      ultimaLeitura,
      alertasAtivos: alertas,
      temAlerta: alertas.length > 0,
    };
  }));

  res.json(resultado);
});
```

#### GET /bancos/{bancoId}/leituras?de=&ate=&pagina=
```typescript
// Histórico paginado de leituras de um banco
app.get('/bancos/:bancoId/leituras', auth, authorize, async (req, res) => {
  const { bancoId } = req.params;
  const { de, ate, pagina = '1' } = req.query;

  // Checar acesso
  if (!(await checkBancoAccess(req.user, bancoId))) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const PAGE_SIZE = 100;
  const skip = (Number(pagina) - 1) * PAGE_SIZE;

  const filter: any = { bancoId };
  if (de) filter.timestamp = { ...filter.timestamp, $gte: new Date(de as string) };
  if (ate) filter.timestamp = { ...filter.timestamp, $lte: new Date(ate as string) };

  const [leituras, total] = await Promise.all([
    db.collection('leituras')
      .find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(PAGE_SIZE)
      .toArray(),
    db.collection('leituras').countDocuments(filter),
  ]);

  res.json({
    dados: leituras,
    paginacao: { pagina: Number(pagina), porPagina: PAGE_SIZE, total, totalPaginas: Math.ceil(total / PAGE_SIZE) },
  });
});
```

#### GET /alertas?status=ativo
```typescript
// Os alertas PERTENCEM à API e nascem dos eventos Kafka
// A API mantém sua própria collection de alertas

app.get('/alertas', auth, authorize, async (req, res) => {
  const { status } = req.query;

  const filter: any = {};
  if (status) filter.status = status;

  // Filtrar por sites permitidos se for cliente
  if (req.user.perfil === 'cliente') {
    const sitesPermitidos = req.allowedSites;
    filter.siteId = { $in: sitesPermitidos };
  }

  const alertas = await db.collection('alertas')
    .find(filter)
    .sort({ aberturaEm: -1 })
    .toArray();

  res.json(alertas);
});
```

#### POST /alertas/{id}/reconhecer
```typescript
// Marca o alerta como visto por um operador (não fecha, apenas reconhece)
app.post('/alertas/:id/reconhecer', auth, authorize, async (req, res) => {
  const { id } = req.params;

  const alerta = await db.collection('alertas').findOne({ alertaId: id });
  if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado' });

  // Checar acesso ao site do alerta
  if (req.user.perfil === 'cliente' && !req.allowedSites.includes(alerta.siteId)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  await db.collection('alertas').updateOne(
    { alertaId: id },
    { $set: { reconhecidoPor: req.user.email, reconhecidoEm: new Date() } }
  );

  res.json({ ok: true });
});
```

### 3.4 — Consumer de Alertas (Kafka → MongoDB da API)

```typescript
// A API consome alertas.eventos e monta o estado local dos alertas
const consumer = kafka.consumer({ groupId: 'api-alertas-group' });
await consumer.subscribe({ topic: 'alertas.eventos', fromBeginning: true });

await consumer.run({
  eachMessage: async ({ message }) => {
    const evento: AlertaEvento = JSON.parse(message.value!.toString());

    if (evento.tipo === 'abertura') {
      await db.collection('alertas').insertOne({
        alertaId: evento.alertaId,
        bancoId: evento.bancoId,
        siteId: evento.siteId,
        regra: evento.regra,
        severidade: evento.severidade,
        status: 'ativo',
        aberturaEm: new Date(evento.timestamp),
        detalhes: evento.detalhes,
      });

      // Empurrar para WebSocket
      broadcastAlerta(evento);
    } else if (evento.tipo === 'resolucao') {
      await db.collection('alertas').updateOne(
        { alertaId: evento.alertaId },
        { $set: { status: 'resolvido', resolvidoEm: new Date(evento.timestamp) } }
      );

      broadcastAlerta(evento);
    }
  },
});
```

### 3.5 — WebSocket

```typescript
import { WebSocketServer, WebSocket } from 'ws';

interface WsClient {
  ws: WebSocket;
  user: { email: string; perfil: string; contratos: string[] };
  allowedSites: string[];
}

const clients: WsClient[] = [];

// Handshake: autenticar via token no query string
wss.on('connection', async (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  try {
    const user = jwt.verify(token!, process.env.JWT_SECRET || 'moura-secret');
    const allowedSites = user.perfil === 'operador'
      ? [] // vazio = todos
      : await getSitesForContratos(user.contratos);

    clients.push({ ws, user, allowedSites });

    ws.on('close', () => {
      const idx = clients.findIndex(c => c.ws === ws);
      if (idx >= 0) clients.splice(idx, 1);
    });
  } catch {
    ws.close(4001, 'Token inválido');
  }
});

// Broadcast com filtro de visibilidade
function broadcastToAuthorized(siteId: string, payload: any) {
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    // Operador vê tudo, cliente só seus sites
    if (client.user.perfil === 'operador' || client.allowedSites.includes(siteId)) {
      client.ws.send(JSON.stringify(payload));
    }
  }
}
```

### Checklist
- [ ] POST /auth/login (JWT)
- [ ] Middleware de autenticação (verificar token)
- [ ] Middleware de autorização (perfil + contrato)
- [ ] GET /sites/{siteId}/bancos
- [ ] GET /bancos/{bancoId}/leituras?de=&ate=&pagina=
- [ ] GET /alertas?status=ativo
- [ ] POST /alertas/{id}/reconhecer
- [ ] Consumer Kafka `alertas.eventos` → collection alertas
- [ ] WebSocket com filtro por perfil/contrato
- [ ] Ricardo NÃO pode ver dados da Juliana (403)

---

## Etapa 4 — Frontend (Web) — ISA 101 High Performance HMI

### Responsabilidade
React + Next.js com 3 telas: login, lista de sites, detalhe do banco.
Design seguindo princípios **ISA 101.01-2015** (High Performance HMI) para interfaces de monitoramento industrial.

### Princípios ISA 101 Aplicados

A ISA 101 define diretrizes para HMIs de processo que maximizam a consciência situacional do operador. O conceito central é: **a tela em estado normal deve ser visualmente silenciosa**, e apenas condições anormais devem chamar atenção.

#### Hierarquia de Telas (Display Hierarchy)

ISA 101 define 4 níveis de navegação:

| Nível | Nome | Aplicação neste projeto |
|-------|------|------------------------|
| L1 | Overview | Lista de sites — visão geral de toda a operação |
| L2 | Area | Bancos de um site — situação por área |
| L3 | Detail | Detalhe de um banco — gráficos e métricas |
| L4 | Diagnostic | Histórico de alertas e leituras brutas (drill-down) |

#### Paleta de Cores (ISA 101 Color Discipline)

```
FUNDO:           #2D2D2D (cinza escuro) ou #F5F5F5 (cinza claro)
                 NUNCA branco puro ou preto puro
PROCESSO NORMAL: #808080 (cinza médio) — equipamentos operando normalmente
TEXTO:           #E0E0E0 (modo escuro) ou #333333 (modo claro)

ALARME CRÍTICO:  #FF0000 (vermelho puro) — reservado EXCLUSIVAMENTE para alarme
ALARME ALTO:     #FFA500 (laranja/âmbar)
ALARME MÉDIO:    #FFFF00 (amarelo)

ESTADO OK:       #4CAF50 (verde discreto) — NÃO usar verde vibrante em estado normal
DESCARGA ATIVA:  #2196F3 (azul) — indica ação/modo ativo sem ser alarmante
OFFLINE:         #9E9E9E (cinza) com ícone de desconexão
```

> **Regra de ouro ISA 101:** Cor vibrante = anormalidade. Se tudo está verde brilhante, quando o vermelho aparecer o operador pode não perceber rápido. O normal deve ser discreto (cinza, muted).

#### Indicadores Analógicos (Analog Representation)

Em vez de mostrar apenas números, usar representação analógica para grandezas contínuas:

```
Tensão:      [████████░░] 52.7V    ← barra horizontal com limites visíveis
             |    48V   |  54V|     ← limites de alarme marcados na barra
             
Temperatura: [████░░░░░░] 32.4°C
             |         45°C|        ← limite de alarme marcado
             
Estado de Carga: 96.8% [●●●●●●●●●○]
```

#### Alarmes (ISA 101 Alarm Presentation)

- **Não piscar** — piscamento causa fadiga visual. Usar cor sólida + ícone
- **Priorização visual** — alarme crítico ocupa mais espaço que alarme médio
- **Banner de alarme** — faixa fixa no topo da tela com contagem de alarmes ativos
- **Reconhecimento** — alarme reconhecido muda de borda sólida para borda tracejada
- **Shelving** — operador pode "silenciar" temporariamente (se implementado)

#### Navegação Consistente

- **Barra de status global** (sempre visível): contagem de alarmes, hora do sistema, usuário logado
- **Navegação por breadcrumb**: Operação > SITE-0101 > BR-PE-0101-A
- **Drill-down clicando no elemento**: clicar no banco vai para o detalhe
- **Botão de retorno** sempre no mesmo lugar

---

### Design System — Tokens Tailwind (ISA 101)

```typescript
// src/lib/theme.ts — Tokens ISA 101 para Tailwind

export const ISA101 = {
  // Backgrounds
  bg: {
    primary: 'bg-neutral-800',      // #2D2D2D — fundo principal (dark mode)
    secondary: 'bg-neutral-750',    // #363636 — cards e painéis
    surface: 'bg-neutral-700',      // #424242 — elementos interativos
  },

  // Texto
  text: {
    primary: 'text-neutral-200',    // #E0E0E0
    secondary: 'text-neutral-400',  // #9E9E9E
    muted: 'text-neutral-500',      // #6B7280
  },

  // Estado de processo (DISCRETO quando normal)
  process: {
    normal: 'text-neutral-400',     // Cinza — operação normal, sem destaque
    running: 'text-blue-400',       // Azul discreto — processo ativo
    stopped: 'text-neutral-600',    // Cinza escuro — parado
  },

  // Alarmes (COR VIBRANTE = ANORMALIDADE)
  alarm: {
    critical: 'bg-red-600 text-white',          // Vermelho — tensão baixa
    high: 'bg-amber-500 text-black',            // Âmbar — sobretemperatura, offline
    medium: 'bg-yellow-400 text-black',         // Amarelo — descarga prolongada
    acknowledged: 'border-dashed border-2',     // Reconhecido — borda tracejada
    resolved: 'bg-neutral-600 text-neutral-300', // Resolvido — discreto
  },

  // Indicadores analógicos
  gauge: {
    normal: 'bg-neutral-500',       // Barra cinza = dentro do range
    warning: 'bg-amber-500',        // Se aproximando do limite
    danger: 'bg-red-600',           // Fora do limite
    track: 'bg-neutral-700',        // Fundo da barra
  },
} as const;
```

---

### 4.1 — Tela de Login
- Formulário simples (email + senha) sobre fundo neutro
- Sem elementos distrativos — ISA 101 preza pela funcionalidade
- Feedback claro de erro (borda vermelha + mensagem)

### 4.2 — Nível 1: Overview (Lista de Sites)

Layout inspirado em sala de controle:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔔 3 alarmes ativos (1 crítico, 2 altos)    │ Ana Souza │ 14:32 │  ← Banner global
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SITE-0101                SITE-0102              SITE-0103      │
│  Belo Jardim              Caruaru                Recife          │
│  ┌──────────────┐         ┌──────────────┐      ┌──────────────┐│
│  │ ● 4 bancos   │         │ ● 4 bancos   │      │ ● 4 bancos   ││
│  │ ▲ 1 alerta   │         │   OK         │      │   OK         ││
│  │   [CRÍTICO]  │         │              │      │              ││
│  └──────────────┘         └──────────────┘      └──────────────┘│
│                                                                 │
│  Legenda: ● Normal  ▲ Alerta ativo  ■ Offline                  │
└─────────────────────────────────────────────────────────────────┘
```

**Princípios aplicados:**
- Sites sem problema = cinza discreto (não verde brilhante!)
- Sites com alerta = destaque em cor do alarme mais severo
- Contagem de alarmes no banner superior (sempre visível)
- Sem animações desnecessárias

### 4.3 — Nível 2: Bancos de um Site

```
┌─────────────────────────────────────────────────────────────────┐
│ Operação > SITE-0101 - Belo Jardim                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  BR-PE-0101-A          BR-PE-0101-B          BR-PE-0101-C      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐ │
│  │ V: [████░░] 47V│    │ V: [██████] 53V│    │ V: [██████] 52V│ │
│  │ T: [██░░░░] 31°│    │ T: [██░░░░] 29°│    │ T: [██░░░░] 30°│ │
│  │ SoC: 45%       │    │ SoC: 97%       │    │ SoC: 95%       │ │
│  │ Modo: DESCARGA │    │ Modo: flutuação │    │ Modo: flutuação │ │
│  │                │    │                │    │                │ │
│  │ ▲ TENSÃO BAIXA │    │                │    │                │ │
│  │   [CRÍTICO]    │    │                │    │                │ │
│  └────────────────┘    └────────────────┘    └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Princípios aplicados:**
- Barras analógicas com limites de alarme visíveis
- Banco com alerta = borda colorida + indicador de severidade
- Banco normal = borda neutra, valores em cinza
- Modo descarga em azul (informativo, não alarmante)

### 4.4 — Nível 3: Detalhe do Banco (com gráfico)

```
┌─────────────────────────────────────────────────────────────────┐
│ Operação > SITE-0101 > BR-PE-0101-A                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Status: ▲ TENSÃO BAIXA (Crítico) desde 14:21                  │
│  Modo: DESCARGA | SoC: 45% | Última leitura: 14:32:05          │
│                                                                 │
│  Tensão (V)                         Temperatura (°C)            │
│  54 ─┬──────────────────────        45 ─┬─ ─ ─ ─ [LIMITE] ─ ─ │
│      │     ╲                            │                       │
│  48 ─┤─ ─ ─╲─ [LIMITE] ─ ─ ─       35 ─┤──────────────────    │
│      │      ╲___________                │                       │
│  46 ─┤                                  │                       │
│      └──────────────────────        30 ─┤──────────────────    │
│       14:10  14:20  14:30               14:10  14:20  14:30    │
│                                                                 │
│  ┌─ Alertas Ativos ────────────────────────────────────────────┐│
│  │ ▲ TENSÃO BAIXA   | Crítico | Aberto: 14:21 | Não reconhecido││
│  │ ▲ DESC. PROLONG. | Médio   | Aberto: 14:17 | Reconhecido    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Princípios aplicados:**
- Linhas de limite desenhadas no gráfico (threshold lines)
- Área abaixo/acima do limite em cor de alarme sutil (fill com opacidade)
- Atualização em tempo real sem piscar — novos pontos adicionados suavemente
- Tabela de alertas com priorização visual por severidade

---

### Componentes React (ISA 101)

```
src/app/
├── layout.tsx              (providers, AuthContext, AlarmBanner global)
├── login/page.tsx
├── sites/
│   └── page.tsx            (L1 Overview — grid de sites)
├── sites/[siteId]/
│   └── page.tsx            (L2 Area — cards de bancos com barras analógicas)
└── bancos/[bancoId]/
    └── page.tsx            (L3 Detail — gráficos + alertas)

src/components/
├── AlarmBanner.tsx         (faixa fixa topo — contagem de alarmes)
├── Breadcrumb.tsx          (navegação hierárquica)
├── SiteCard.tsx            (card do site no overview)
├── BancoCard.tsx           (card do banco com barras analógicas)
├── AnalogBar.tsx           (barra horizontal com limites ISA 101)
├── TrendChart.tsx          (gráfico temporal com threshold lines)
├── AlertTable.tsx          (tabela de alertas com priorização)
├── StatusIndicator.tsx     (ícone de estado: normal/alerta/offline)
└── ModeLabel.tsx           (label do modo: flutuação/descarga/recarga)

src/lib/
├── api.ts                  (fetch wrapper com token)
├── ws.ts                   (hook useWebSocket)
├── auth.ts                 (contexto de autenticação)
└── theme.ts                (tokens ISA 101)
```

### Componente AnalogBar (ISA 101)
```typescript
// src/components/AnalogBar.tsx
interface AnalogBarProps {
  value: number;
  min: number;
  max: number;
  lowAlarm?: number;     // Limite inferior de alarme
  highAlarm?: number;    // Limite superior de alarme
  unit: string;
  label: string;
}

export function AnalogBar({ value, min, max, lowAlarm, highAlarm, unit, label }: AnalogBarProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  const isAlarmed = (lowAlarm && value < lowAlarm) || (highAlarm && value > highAlarm);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-neutral-400 w-8">{label}</span>
      <div className="relative flex-1 h-3 bg-neutral-700 rounded">
        {/* Barra de valor */}
        <div
          className={`h-full rounded ${isAlarmed ? 'bg-red-600' : 'bg-neutral-400'}`}
          style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
        />
        {/* Marcador de limite */}
        {lowAlarm && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-400 opacity-70"
            style={{ left: `${((lowAlarm - min) / (max - min)) * 100}%` }}
          />
        )}
        {highAlarm && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-400 opacity-70"
            style={{ left: `${((highAlarm - min) / (max - min)) * 100}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-mono w-16 text-right ${isAlarmed ? 'text-red-400 font-bold' : 'text-neutral-300'}`}>
        {value.toFixed(1)}{unit}
      </span>
    </div>
  );
}
```

### Componente TrendChart com Threshold Lines
```typescript
// src/components/TrendChart.tsx
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Area } from 'recharts';

interface TrendChartProps {
  data: { timestamp: string; value: number }[];
  lowThreshold?: number;
  highThreshold?: number;
  unit: string;
  color: string;
}

export function TrendChart({ data, lowThreshold, highThreshold, unit, color }: TrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="timestamp" stroke="#6B7280" tick={{ fontSize: 10 }} />
        <YAxis stroke="#6B7280" tick={{ fontSize: 10 }} />

        {/* Linha de limite — ISA 101: sempre visível no gráfico */}
        {lowThreshold && (
          <ReferenceLine y={lowThreshold} stroke="#EF4444" strokeDasharray="5 5" label="Limite" />
        )}
        {highThreshold && (
          <ReferenceLine y={highThreshold} stroke="#EF4444" strokeDasharray="5 5" label="Limite" />
        )}

        {/* Linha de tendência */}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}  // ISA 101: sem animações decorativas
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### Hook WebSocket
```typescript
// src/lib/ws.ts
export function useWebSocket(token: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}?token=${token}`
    );

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconexão automática após 3s
      setTimeout(() => { /* re-create */ }, 3000);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev.slice(-200), data]);
    };

    return () => ws.close();
  }, [token]);

  return { messages, connected };
}
```

---

### Checklist Frontend (ISA 101)
- [ ] Tela de login funcional
- [ ] Fundo neutro/cinza (não branco puro) — ISA 101
- [ ] Banner de alarmes global (contagem, sempre visível)
- [ ] L1 Overview: grid de sites com status discreto (cinza = normal)
- [ ] L2 Area: cards de bancos com barras analógicas e limites
- [ ] L3 Detail: gráfico temporal com threshold lines
- [ ] Cor reservada para anormalidade (vermelho APENAS para alarme)
- [ ] Navegação por breadcrumb hierárquico
- [ ] WebSocket atualizando tela em tempo real (sem piscar)
- [ ] Priorização visual de alertas por severidade
- [ ] Modo descarga/recarga em cor informativa (azul), não alarmante
- [ ] Reconhecimento de alerta muda visual (borda tracejada)

---

## Etapa 5 — Teste Integrado

### O que testar
Uma leitura publicada no MQTT que percorre todo o fluxo e vira um alerta na API.

```typescript
// tests/integration/mqtt-to-alert.test.ts
import mqtt from 'mqtt';

describe('Fluxo ponta-a-ponta: MQTT → Kafka → Alerta na API', () => {
  const API_URL = 'http://localhost:3000';
  let token: string;

  beforeAll(async () => {
    // Login como operador
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana.souza@exemplo.com', senha: 'senha123' }),
    });
    const data = await res.json();
    token = data.token;
  });

  it('3 leituras com tensão < 48V geram alerta crítico de tensão baixa', async () => {
    const client = mqtt.connect('mqtt://localhost:1883');

    await new Promise<void>((resolve) => client.on('connect', resolve));

    // Publicar 3 leituras com tensão baixa
    for (let i = 0; i < 3; i++) {
      const leitura = {
        bancoId: 'BR-PE-0101-A',
        siteId: 'SITE-0101',
        timestamp: new Date().toISOString(),
        tensaoV: 46.5,        // < 48V !
        correnteA: -5.2,
        temperaturaC: 32.0,
        estadoCarga: 0.45,
        modo: 'descarga',
      };

      client.publish(
        `moura/telemetria/${leitura.siteId}/${leitura.bancoId}`,
        JSON.stringify(leitura)
      );

      await new Promise(r => setTimeout(r, 1000)); // Esperar processamento
    }

    client.end();

    // Aguardar propagação (ingestão → Kafka → processamento → Kafka → API)
    await new Promise(r => setTimeout(r, 5000));

    // Verificar alerta na API
    const res = await fetch(`${API_URL}/alertas?status=ativo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const alertas = await res.json();

    const alerta = alertas.find(
      (a: any) => a.bancoId === 'BR-PE-0101-A' && a.regra === 'tensao_baixa'
    );

    expect(alerta).toBeDefined();
    expect(alerta.severidade).toBe('critica');
    expect(alerta.status).toBe('ativo');
  }, 30000); // timeout 30s
});
```

---

## Etapa 6 — Docker Compose (estender o existente)

### Adicionar ao docker-compose.yml existente:

```yaml
  ingestao:
    build: ./services/ingestao
    container_name: mc-ingestao
    depends_on:
      mosquitto:
        condition: service_started
      kafka:
        condition: service_healthy
    environment:
      MQTT_URL: mqtt://mosquitto:1883
      KAFKA_BROKER: kafka:29092
    restart: unless-stopped

  processamento:
    build: ./services/processamento
    container_name: mc-processamento
    depends_on:
      kafka:
        condition: service_healthy
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      KAFKA_BROKER: kafka:29092
      MONGO_URL: mongodb://mongo:27017/moura
      REDIS_URL: redis://redis:6379
      OFFLINE_THRESHOLD_MS: "600000"
      DESCARGA_THRESHOLD_MS: "900000"
    restart: unless-stopped

  api:
    build: ./services/api
    container_name: mc-api
    ports:
      - "3000:3000"
    depends_on:
      kafka:
        condition: service_healthy
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      PORT: "3000"
      KAFKA_BROKER: kafka:29092
      MONGO_URL: mongodb://mongo:27017/moura
      REDIS_URL: redis://redis:6379
      JWT_SECRET: moura-jwt-secret-2026
    restart: unless-stopped

  web:
    build: ./services/web
    container_name: mc-web
    ports:
      - "3001:3000"
    depends_on:
      - api
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3000
      NEXT_PUBLIC_WS_URL: ws://localhost:3000/ws
    restart: unless-stopped
```

---

## Etapa 7 — Documentos

### README.md (modelo)

Deve conter:
1. **Como rodar** — `docker compose up` e pronto
2. **Decisões técnicas** — por que cada tecnologia, trade-offs
3. **O incômodo do MongoDB compartilhado** — processamento escreve, api lê. Com mais tempo: CQRS, event sourcing, ou tópico Kafka intermediário com projeção
4. **O que ficou de fora** — se cortou algo, explicar o motivo
5. **Variáveis de ambiente** — tabela com todas as configs

### ARQUITETURA.md (modelo de tópicos)

1. **Como escalar de 40 para 50.000 bancos**
   - Ingestão: múltiplas instâncias, cada uma subscribing um subconjunto de tópicos MQTT (sharding por site)
   - Processamento: escala horizontal via consumer groups do Kafka (mais partições = mais consumers)
   - API: stateless, scale horizontal atrás de ALB

2. **MQTT na borda vs Kafka no núcleo**
   - MQTT: protocolo leve, ideal para devices com conectividade limitada, QoS 1
   - Kafka: durabilidade, replay, desacoplamento de consumers, backpressure
   - Poderia usar só Kafka se devices tivessem cliente Kafka (improvável em hardware embarcado)

3. **Partições e retenção**
   - telemetria.leituras: 50+ partições (1 por ~1000 bancos), key=bancoId
   - alertas.eventos: 10 partições, retenção 30 dias
   - Retenção de leituras: 7 dias no Kafka, MongoDB como storage permanente com TTL index (90 dias quentes, cold storage depois)

4. **WebSocket com réplicas**
   - Redis Pub/Sub ou Redis Streams como backbone entre instâncias da API
   - Sticky sessions via cookie no ALB, ou aceitar reconexão transparente no client

5. **Desenho AWS**
   - ECS Fargate para os 4 serviços
   - Amazon MSK (Kafka gerenciado)
   - AWS IoT Core como broker MQTT (auto-escala, milhões de devices)
   - DocumentDB ou Atlas para MongoDB
   - ElastiCache Redis
   - ALB na frente da API e do Web
   - CloudWatch para logs e métricas, alertas operacionais

6. **CI/CD**
   - GitHub Actions ou CodePipeline
   - Build → test → push image → deploy
   - Barrar merge: testes falhando, lint errors, sem Dockerfile buildando

7. **Qual serviço escala primeiro**
   - Processamento: é CPU-bound (regras) + I/O (Mongo + Redis + Kafka)
   - Depois API (mais usuários conectados via WS)
   - Ingestão é o mais leve (stateless, só traduz)

---

## Índices MongoDB Importantes

```javascript
// Collection: leituras
db.leituras.createIndex({ bancoId: 1, timestamp: -1 });  // Paginação por banco
db.leituras.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // TTL 90 dias

// Collection: alertas (pertence à API)
db.alertas.createIndex({ alertaId: 1 }, { unique: true });
db.alertas.createIndex({ status: 1, siteId: 1 });
db.alertas.createIndex({ bancoId: 1, status: 1 });
```

---

## Dependências por Serviço

### ingestao/package.json
```json
{
  "name": "ingestao",
  "type": "module",
  "dependencies": {
    "kafkajs": "^2.2.4",
    "mqtt": "^5.10.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0"
  }
}
```

### processamento/package.json
```json
{
  "name": "processamento",
  "type": "module",
  "dependencies": {
    "ioredis": "^5.4.0",
    "kafkajs": "^2.2.4",
    "mongoose": "^8.5.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0"
  }
}
```

### api/package.json
```json
{
  "name": "api",
  "type": "module",
  "dependencies": {
    "bcrypt": "^5.1.1",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^10.0.0",
    "ioredis": "^5.4.0",
    "jsonwebtoken": "^9.0.2",
    "kafkajs": "^2.2.4",
    "mongoose": "^8.5.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.0.0",
    "typescript": "^5.5.0"
  }
}
```

### web/package.json
```json
{
  "name": "web",
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "recharts": "^2.12.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0"
  }
}
```

---

## Dados de Referência

### Usuários para Teste

| E-mail | Senha | Perfil | Vê |
|--------|-------|--------|-----|
| ana.souza@exemplo.com | senha123 | operador | Todos 12 sites |
| carlos.lima@exemplo.com | senha123 | operador | Todos 12 sites |
| ricardo@telenordeste.exemplo.com | senha123 | cliente | CT-1001 (SITE-0101 a 0106) |
| juliana@dcsul.exemplo.com | senha123 | cliente | CT-1002 (SITE-0107 a 0112) |

### Conexões (dentro de containers)

| Serviço | URL interna |
|---------|-------------|
| MQTT | mqtt://mosquitto:1883 |
| Kafka | kafka:29092 |
| MongoDB | mongodb://mongo:27017/moura |
| Redis | redis://redis:6379 |

### Tópicos

| Tópico | Partições | Quem produz | Quem consome |
|--------|-----------|-------------|--------------|
| moura/telemetria/{siteId}/{bancoId} | — (MQTT) | Simulador | Ingestão |
| telemetria.leituras | 6 | Ingestão | Processamento |
| alertas.eventos | 3 | Processamento | API |

---

## Ordem de Prioridade (se o tempo apertar)

1. ✅ **ingestao + processamento** com as 4 regras funcionando
2. ✅ **api** com rotas, login JWT e controle de acesso
3. ✅ **WebSocket** na api empurrando alertas e leituras
4. ✅ **web** — mesmo que simples (login + lista + gráfico)
5. ✅ **Teste integrado** — 1 fluxo MQTT→alerta na API

> **Documentos (README.md e ARQUITETURA.md): entregar SEMPRE, mesmo com código incompleto.**

---

## Comandos Úteis para Debug

```bash
# Ver telemetria MQTT chegando
docker exec -it mc-mosquitto mosquitto_sub -t 'moura/telemetria/#' -C 5

# Ver o que a ingestão publicou no Kafka
docker exec -it mc-kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 --topic telemetria.leituras --max-messages 5

# Ver eventos de alerta
docker exec -it mc-kafka kafka-console-consumer \
  --bootstrap-server kafka:29092 --topic alertas.eventos --from-beginning

# Checar dados no Mongo
docker exec -it mc-mongo mongosh moura --quiet --eval 'db.leituras.countDocuments()'
docker exec -it mc-mongo mongosh moura --quiet --eval 'db.alertas.find({status:"ativo"}).pretty()'

# Checar Redis
docker exec -it mc-redis redis-cli keys 'banco:estado:*'
docker exec -it mc-redis redis-cli keys 'alert:active:*'

# Logs dos serviços
docker compose logs -f ingestao
docker compose logs -f processamento
docker compose logs -f api
```


---

## Referência ISA 101 — Resumo para Implementação

### O que é ISA 101?

A norma ANSI/ISA-101.01-2015 define diretrizes para interfaces homem-máquina (HMI) em sistemas de automação de processos. O foco é maximizar a efetividade do operador através de:

- **Situational Awareness** — O operador deve perceber o que está acontecendo com mínimo esforço cognitivo
- **Consistência** — Mesmos padrões visuais em todas as telas
- **Gestão de Alarmes** — Alinhado com ISA 18.2 (alarmes devem ser acionáveis, não informativos)
- **Hierarquia de Navegação** — Do macro ao micro em cliques previsíveis

### Os 10 Princípios Aplicados neste Projeto

| # | Princípio | Aplicação |
|---|-----------|-----------|
| 1 | **Fundo neutro** | `bg-neutral-800` — tela "silenciosa" em operação normal |
| 2 | **Cor = anormalidade** | Vermelho APENAS para alarme. Normal é cinza |
| 3 | **Hierarquia L1→L4** | Overview > Site > Banco > Diagnóstico |
| 4 | **Indicadores analógicos** | Barras com limites visíveis, não só números |
| 5 | **Threshold lines** | Linhas de limite nos gráficos de tendência |
| 6 | **Sem animação decorativa** | Dados mudam suavemente, nada pisca |
| 7 | **Banner de alarmes** | Sempre visível no topo, priorizado por severidade |
| 8 | **Reconhecimento de alarme** | Estado visual diferente (borda tracejada) |
| 9 | **Navegação por contexto** | Breadcrumb + drill-down clicando no elemento |
| 10 | **Informação, não decoração** | Cada pixel serve ao operador, não ao designer |

### Erros Comuns que ISA 101 Corrige

| ❌ Evitar | ✅ Fazer |
|-----------|---------|
| Fundo branco brilhante | Fundo cinza neutro |
| Tudo verde quando normal | Cinza discreto quando normal |
| Números soltos sem contexto | Barras analógicas com limites |
| Gráficos sem referência | Threshold lines desenhadas |
| Alarmes piscando | Cor sólida + priorização |
| Cores decorativas (gradientes) | Cor com significado operacional |
| Dashboard "bonito" mas inútil | Interface funcional e limpa |

### Fontes de Referência

- [ISA-101.01-2015 — Human Machine Interfaces for Process Automation Systems](https://www.isa.org/standards-and-publications/isa-standards/isa-101-standards)
- [ISA-TR101.02-2019 — HMI Usability and Performance](https://webstore.ansi.org/standards/isa/isatr101022019)
- [The High Performance HMI Overview (ISA)](https://www.isa.org/getmedia/06130a38-f7af-4b35-8c9c-2c34f25c1977/The-High-Performance-HMI-Overview-v2-01.pdf)

> Content was rephrased for compliance with licensing restrictions. Consulte as fontes originais para detalhes normativos completos.

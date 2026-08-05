# Arquitetura — De 40 bancos para 50.000

## Divisão de serviços

Manteria a divisão atual e acrescentaria o serviço **historico**. Cada serviço tem motivo de existir e escala de forma diferente:

- **Ingestão** — stateless, traduz protocolo de campo. Escala adicionando instâncias, cada uma subscrevendo um subconjunto de tópicos MQTT.
- **Processamento** — CPU-bound (regras + FSM) + I/O (escrita). Escala via consumer groups do Kafka. Mais partições = mais consumers paralelos.
- **API** — stateless (exceto conexões WS). Escala horizontal atrás de load balancer.
- **Historico** — dono exclusivo do banco de séries temporais. Processamento escreve nele via Kafka, API lê. Elimina o acoplamento de banco compartilhado.

## MQTT na borda vs Kafka no núcleo

**MQTT na borda** porque equipamentos em campo tem conectividade limitada (GPRS, rádio). MQTT é leve, reconecta sozinho, e funciona em diversos hardwares embarcados com pouca memória.

**Kafka no núcleo** porque o sistema interno precisa de durabilidade (replay de eventos), desacoplamento entre consumers (processamento pode parar sem perder dados) e múltiplos consumers no mesmo tópico sem interferência.

**Quando daria para usar só um dos dois?**

Cada um é otimizado para um tipo de uso diferente e não vejo como utilizar apenas um neste cenário. MQTT resolve o problema da borda (device com pouca memória, rede instável, precisa ser leve). Kafka resolve o problema do núcleo (durabilidade, replay, múltiplos consumers, ordenação). Eliminar um deles significaria forçar o outro a operar fora do seu propósito — e isso traria mais problemas do que resolveria.

## Partições e retenção

**Cálculo de partições:**

O número de partições define quantos consumers podem processar em paralelo. A conta:

```
Partições = throughput necessário ÷ throughput por consumer (no ambiente real)
```

Para 50k bancos a 10.000 msgs/s, estimando ~750 msgs/s por consumer em Graviton (1 vCPU + rede real  — latência de rede reduz throughput):

```
10.000 ÷ 750 = ~14 consumers → 24 partições (com margem de 50% + arredondamento)
```

O valor exato precisa ser validado em staging com carga sintética no ambiente real. Começar com 24 e ajustar (Kafka permite aumentar partições, nunca diminuir).

| Tópico | Partições | Retenção | Key |
|--------|-----------|----------|-----|
| telemetria.leituras | 24 | 12h | bancoId |
| alertas.eventos | 6 | 12h | bancoId |

Key = `bancoId` garante ordenação por banco na mesma partição (necessário para regras como "3 leituras consecutivas").

**Retenção curta** porque a aplicação é de alta disponibilidade — réplicas e auto-scaling garantem que o sistema não para. A retenção no Kafka serve apenas como safety net para replay pontual em caso de bug, não para recuperação de desastre. O dado permanente fica no TimescaleDB.

**Histórico permanente (TimescaleDB):**
- Raw data: 90 dias
- Agregação horária: 10 anos
- Compressão automática após 7 dias

## WebSocket com múltiplas réplicas

Com N réplicas da API atrás de um ALB, cada instância só conhece seus clientes WS locais. Usar  **sticky sessions** no ALB:

1. Cliente faz login → ALB escolhe instância A e seta cookie `AWSALB`
2. Cliente abre WebSocket → browser envia o mesmo cookie → ALB direciona para instância A
3. Todos os requests desse cliente (REST e WS) continuam na instância A

Cada instância da API consome do Kafka e faz broadcast apenas para seus clientes WS locais. Como o cookie garante que o cliente sempre volta pra mesma instância, ele recebe os eventos que aquela instância processa.

## Desenho AWS

Usando EC2, ALB, S3, IAM e CloudWatch:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              VPC                                         │
│                                                                          │
│  ╔═══ BORDA (MQTT) ════════════════════════════════════════════════╗     │
│  ║ [NLB TCP:1883]                                                  ║     │
│  ║   [EC2] EMQX Node 1 ─┐                                          ║     │
│  ║   [EC2] EMQX Node 2 ─┼─ Cluster (Open Source, gratuito)         ║     │
│  ║   [EC2] EMQX Node 3 ─┘                                          ║     │
│  ╚═════════════════════════════════════════════════════════════════╝     │
│                           │                                              │
│  ╔═══ INGESTÃO [ASG] ═════╪════════════════════════════════════════╗     │
│  ║   [EC2] ingestao-1     │  Scale: CPU > 70%                      ║     │
│  ║   [EC2] ingestao-2     ▼  Min: 2 / Max: 6                       ║     │
│  ╚═════════════════════════════════════════════════════════════════╝     │
│                            │                                             │
│  ╔═══ KAFKA [EC2 cluster] ═╪═══════════════════════════════════════╗     │
│  ║   [EC2] broker-1 / broker-2 / broker-3                          ║     │
│  ╚═════════════════════════════════════════════════════════════════╝     │
│                            │                                             │
│  ╔═══ PROCESSAMENTO [ASG] ═╪═══════════════════════════════════════╗     │
│  ║   [EC2] proc-1 / proc-2 / ... / proc-N                          ║     │
│  ║   Scale: consumer lag > 1000    Min: 3 / Max: 15                ║     │
│  ╚════════════┬═══════════════════════════┬════════════════════════╝     │
│               │ write                     │ write                        │
│  ╔════════════╪═══════════╗  ╔════════════╪════════════════════════╗     │
│  ║ REDIS [EC2]            ║  ║ TIMESCALEDB [EC2]                   ║     │
│  ║  [EC2] primary         ║  ║  [EC2] primary (escrita)            ║     │
│  ║  [EC2] replica         ║  ║  [EC2] replica-1 (leitura) ─┐       ║     │
│  ╚════════════════════════╝  ║  [EC2] replica-2 (leitura) ─┘ WAL   ║     │
│                              ╚════════════════════╤════════════════╝     │
│                                                   │ read                 │
│  ╔═══ API [ASG + ALB] ════════════════════════════╪════════════════╗     │
│  ║   [ALB] sticky sessions (HTTP + WebSocket)     │                ║     │
│  ║   [EC2] api-1 / api-2 / api-3                  ┘                ║     │
│  ║   Scale: connections > 5000    Min: 2 / Max: 8                  ║     │
│  ╚═════════════════════════════════════════════════════════════════╝     │
│                                                                          │
│  ╔═══ FRONTEND ════════════════════════════════════════════════════╗     │
│  ║   [S3] static assets (Next.js export)                           ║     │
│  ║   [CloudFront] CDN global                                       ║     │
│  ╚═════════════════════════════════════════════════════════════════╝     │
│                                                                          │
│  [IAM] Role por serviço (least privilege)                                │
│  [CloudWatch] Logs + Métricas custom + Alarmes                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Auto Scaling Groups:**

| Serviço | Métrica de scaling | Min | Max |
|---------|-------------------|-----|-----|
| Ingestão | CPU > 70% | 2 | 6 |
| Processamento | Kafka consumer lag > 1000 msgs (métrica custom CloudWatch) | 3 | 15 |
| API | Conexões ativas > 5000 por instância | 2 | 8 |

**TimescaleDB (EC2 self-hosted):**
- Primary (m6g.xlarge Graviton): PostgreSQL 16 + TimescaleDB — recebe escrita do processamento
- 2 Read Replicas (m6g.large): streaming replication via WAL — servem queries da API
- EBS gp3 (IOPS provisionado) para storage
- Backup: snapshots EBS diários + WAL archiving para S3 (point-in-time recovery)

**EMQX (EC2 cluster):**
- 3 EC2 (m6g.large) em cluster EMQX Open Source (gratuito)
- NLB (Network Load Balancer) na frente — MQTT é TCP, ALB não suporta
- Suporta 50k+ conexões simultâneas sem licença
- Bridge Kafka via Rule Engine (opcional — pode manter ingestão como mediador)

**Redis (EC2):**
- Primary + 1 replica para HA
- Armazena: FSM de cada banco, último estado, cache de allowedSites
- Se primary cai, replica assume (failover manual ou via script)

**CloudWatch:**
- Logs centralizados de todos os serviços (CloudWatch Logs Agent nos EC2)
- Métricas custom: consumer lag (processamento), msgs/s (ingestão), conexões WS (API)
- Alarmes: consumer lag > 5000, CPU > 90%, disco > 80%, instância unhealthy

## Pipeline CI/CD

```
push → GitHub Actions → lint → test → build Docker → integration test → push ECR → deploy EC2 (rolling)
```

**Stages:**

1. **Lint + Type Check** — `tsc --noEmit` + ESLint em todos os serviços
2. **Test** — testes unitários por serviço (parallel)
3. **Build** — `docker build` de cada serviço (verifica que Dockerfile funciona)
4. **Integration Test** — sobe compose em runner, roda teste e2e (MQTT → alerta na API)
5. **Push ECR** — publica imagens no Amazon ECR (tag = commit SHA)
6. **Deploy** — rolling update nos Auto Scaling Groups via AWS CodeDeploy:
   - Nova AMI com imagem atualizada do ECR
   - Launch Template atualizado
   - Instance Refresh no ASG (substitui instâncias gradualmente)
   - Health check antes de encerrar instância antiga

**O que barraria um merge:**
1. TypeScript não compila
2. Testes falhando
3. Dockerfile não builda
4. Vulnerabilidades críticas no `npm audit`
5. Teste integrado falha (fluxo ponta-a-ponta)

**Frontend:** build separado — `next export` → upload para S3 → invalidação do CloudFront. Sem downtime.

## Qual serviço escala primeiro (serviços da aplicação)

1. **Processamento** — é o gargalo pois usa mais CPU e processa todas as mensagens. Cada mensagem gera escrita no banco, atualização no Redis, avaliação de 4+ regras e atualização da FSM. Com 50k bancos a 10k msgs/s, precisa de múltiplas instâncias consumindo em paralelo via consumer groups.

2. **Ingestão** — embora seja stateless e leve, é o ponto de entrada de toda a telemetria. Se o throughput MQTT superar a capacidade de uma instância, ou se houver múltiplos brokers regionais, precisa escalar.

3. **API** — escala conforme aumentam operadores e clientes conectados via WebSocket. Cada conexão WS consome memória. Auto-scale por connection count + CPU.

4. **Histórico** — escala por volume de escrita (append-only) e por queries de range temporal longas. TimescaleDB com read replicas resolve a maioria dos cenários sem escalar o serviço em si.

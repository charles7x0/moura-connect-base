# Moura Connect

Plataforma de monitoramento preditivo de baterias estacionárias. Captura telemetria de campo via MQTT, detecta degradação e gera alertas antes da falha.

## Como rodar

```bash
# Subir tudo (infra + aplicação)
docker compose up --build -d

# Ver logs de todos os serviços
docker compose logs -f

# Ver logs de um serviço específico
docker compose logs -f ingestao

# Verificar status dos containers
docker compose ps

# Derrubar tudo e limpar dados
docker compose down -v

# Reconstruir um serviço específico
docker compose build api
docker compose up -d api
```

Aguarde ~1 minuto. Acesse:

| Recurso | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/docs |

Para derrubar: `docker compose down -v`

## Usuários

| E-mail | Senha | Perfil | Acesso |
|--------|-------|--------|--------|
| ana.souza@exemplo.com | senha123 | operador | todos os 12 sites |
| carlos.lima@exemplo.com | senha123 | operador | todos os 12 sites |
| ricardo@telenordeste.exemplo.com | senha123 | cliente | CT-1001 (sites 0101–0106) |
| juliana@dcsul.exemplo.com | senha123 | cliente | CT-1002 (sites 0107–0112) |

## Arquitetura

```
Simulador → MQTT → [ingestao] → Kafka(telemetria.leituras) → [processamento] → MongoDB + Redis + Kafka(alertas.eventos) → [api] → REST + WebSocket → [web]
```

Quatro serviços independentes, cada um em container próprio, comunicando exclusivamente por Kafka. Nenhum serviço chama outro por HTTP.

| Serviço | Responsabilidade | Stack |
|---------|-----------------|-------|
| ingestao | Ponte campo→sistema (MQTT → Kafka) | Node.js, mqtt.js, kafkajs, ArkType, MsgPack |
| processamento | Grava histórico, aplica regras, publica alertas | Node.js, kafkajs, MongoDB, ioredis |
| api | REST + WebSocket + consumer de alertas | Node.js, Fastify, kafkajs, JWT, TypeBox |
| web | Dashboard ISA 101 | Next.js 14, React, Recharts, Tailwind |

## Regras de alerta

| Regra | Condição | Severidade |
|-------|----------|-----------|
| Tensão baixa | < 48V por 3 leituras consecutivas | Crítica |
| Sobretemperatura | > 45°C | Alta |
| Banco offline | > 10 min sem leitura | Alta |
| Descarga prolongada | > 15 min em modo descarga | Média |

Alertas abrem uma vez por condição (não por leitura) e fecham automaticamente quando a situação normaliza.

## Rotas da API

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /auth/login | Login (retorna JWT) |
| GET | /sites | Sites com indicadores de saúde |
| GET | /sites/:siteId/bancos | Bancos com estado FSM e última leitura |
| GET | /bancos/:bancoId/estado | Estado da máquina de estados + transições |
| GET | /bancos/:bancoId/leituras?de=&ate=&pagina= | Histórico paginado |
| GET | /alertas?status=ativo&reconhecido=false | Alertas filtrados |
| POST | /alertas/:id/reconhecer | Reconhece alerta |
| WS | /ws?token=JWT | Canal real-time (alertas + leituras) |

---

## Decisões técnicas

### Ingestão

| Decisão | Por quê |
|---|---|
| Serviço separado | Protocolo de campo muda sem impactar o sistema interno |
| Versionamento por tópico MQTT (`moura/v1/...`, `moura/v2/...`) | Permite ter versões diferentes do payload e protocolo sem precisar atualizar os firmwares de cada equipamento em campo e com poucas mudanças na estrutura do código  |
| Indicador de qualidade do dado (latência, frescor, duplicata, score) | Os sensores em campo podem travar ou perder a sincronia, por isso é importante medir a qualidade do dado através de regras extensíveis |
| Batching + buffer limitado (5000) + file de erro (DLQ) | Suportar mais dados com a mesma infraestrutura, permite verificação das mensagens que estão com erro |
| QoS 1 + persistent session MQTT | Não perde mensagem durante reconexão |
| Ingress/Egress separados com callback injection | Testável sem Kafka/MQTT reais, extensível para outros destinos |

### Processamento

| Decisão | Por quê |
|---|---|
| Regras plugáveis (event-driven vs time-driven) | Nova regra = 1 arquivo + registrar, sem mexer no motor de regras (engine) |
| Máquina de estados (FSM) por banco | Permitir que cada banco tenha um estado único e regras de transição |
| Alertas únicos por condição | Centenas de leituras  = 1 alerta |
| Auto-resolução | Alerta fecha sozinho quando condição normaliza |
| Bulk write no MongoDB (50 docs/batch) | Otimizar a utilização de recursos |
| Circuit breaker em Mongo e Redis | Melhorar a resistência a falhas do sistema |

### API

| Decisão | Por quê |
|---|---|
| Services layer separado das rotas | Lógica testável sem HTTP |
| Alertas pertencem à API (nascem de eventos Kafka) | Separação de proprietário — API não calcula, só reage |
| Deduplicação de alertas por banco+regra (partial unique index) | Impossível ter 2 alertas ativos para a mesma condição |
| Cache de allowedSites em memória (TTL 60s) | Não consulta Mongo a cada request e otimiza recursos |
| TypeBox = validação + tipo TypeScript + Swagger | 1 fonte de verdade |
| Rate limit diferenciado no login (5/min) | Previne brute force sem penalizar operação normal |

### Web (Frontend)

| Decisão | Por quê |
|---|---|
| ISA 101 High Performance HMI | Padrão utilizado em sistemas de automação para otimizar a tomada de decisão do operador |
| Hierarquia L1→L3 (Overview → Site → Banco) | Navegação como sala de controle |
| Barras analógicas com threshold lines | Operador vê limite de alarme no gráfico |
| QualityBadge nos cards | Operador sabe se o dado é confiável |
| Banner ISA 18.2 (total por severidade + reconhecidos) | Consciência situacional instantânea, sem sobrecarga sensorial |

### Compartilhado (packages/)

| Decisão | Por quê |
|---|---|
| `@moura/types` — tipos de domínio centralizados | Schema muda em 1 lugar, todos compilam contra a mesma definição |
| `@moura/health` — health check reutilizável | Mesmo padrão em todos os serviços |
| `@moura/circuit-breaker` — classe genérica | Resiliência sem duplicar código |
| Referência via `file:` dependency | Funciona em Docker sem publicar no npm |

---

## O incômodo do MongoDB compartilhado

Dois problemas aqui. O menor: dos módulos acessam diretamente o banco. O maior: **MongoDB não é o banco certo para esta aplicação.**

**Por que MongoDB não serve para leituras de telemetria com retenção de 10+ anos:**
- Sem partição temporal automática — query de "última semana" varre a década inteira
- Sem compressão columnar — cada documento repete keys JSON, desperdício de armazenamento
- Sem downsampling nativo — precisa de jobs externos para agregar "média horária dos últimos 5 anos"
- Custo e performance degradam linearmente com o volume

**Proposta: TimescaleDB** (PostgreSQL + extensão time-series) para o histórico de leituras. MongoDB poderia permanecer apenas para dados de domínio (sites, bancos, usuários, alertas).

Ganhos concretos:
- Hypertables com partição temporal automática
- Continuous aggregates — média horária/diária pré-calculada
- Compressão 90%+ em dados antigos
- Retention policies nativas — exemplo: raw 90 dias, aggregates 10 anos
- SQL padrão, sem lock-in

**Para resolver o acoplamento entre serviços:** criar um terceiro serviço (`historico`) como dono exclusivo do banco de leituras. Processamento escreve nele via Kafka, API lê dele via Kafka. Nenhum dos dois toca o banco diretamente — só o `historico` faz isso. Cada serviço fica com sua base e seu ciclo de deploy independente.

## Variáveis de ambiente

Todos os thresholds são configuráveis. Cada serviço tem seu `.env` + um `.env` global na raiz para infra compartilhada.

Para acelerar testes em dev:
```yaml
OFFLINE_THRESHOLD_MS: "30000"      # 30s em vez de 10min
DESCARGA_THRESHOLD_MS: "60000"     # 1min em vez de 15min
```

## Teste integrado

```bash
cd tests/integration
npm install
npm test
```

Requer ambiente rodando. Testa fluxo completo: MQTT → Kafka → alerta na API.

## Testes de resiliência

```bash
cd tests/resilience
npm install
npm test
```

Testa: Kafka down/recovery, MQTT down/recovery, payload malformado, stress 600k msgs, container restart, versão desconhecida → DLQ.

## O que ficou de fora

- Refresh token / httpOnly cookie (segurança avançada)
- Audit log (quem fez o quê)
- Métricas exportadas para Prometheus/Grafana
- Tratamento de mensagem fora de ordem

## O que foi além do pedido

- Quality indicator (score 0–100) anotado na borda
- Máquina de estados formal (FSM) com histórico de transições
- Versionamento de protocolo (v1 JSON + v2 MessagePack)
- Circuit breaker nos repositories
- Testes de resiliência (stress 600k msgs, Kafka down, etc.)
- Swagger/OpenAPI gerado automaticamente
- Security headers + rate limiting
- Pacotes compartilhados (@moura/types, @moura/health, @moura/circuit-breaker)
- Bulk write com flush periódico
- Dead-letter queue para mensagens falhadas

## O que faria com mais tempo

- Trocar MongoDB por TimescaleDB para leituras (séries temporais com retenção 10+ anos)
- Serviço `historico` dedicado para desacoplar acesso ao banco entre processamento e API
- Refresh token + httpOnly cookie para segurança de sessão
- Observabilidade completa (Prometheus + Grafana + OpenTelemetry distributed traces)
- Audit log (quem logou, quem reconheceu alerta, quando)
- Pipeline CI/CD com gates de qualidade (lint, test, build, scan)
- Notificação externa (email/SMS quando alerta crítico abrir)
- Regras de alerta configuráveis por UI (CRUD de regras sem redeploy)
- Módulo de detecção de anomalias usando Machine Learning junto a um agente de monitoramento para tomar decisões e enviar alertas antecipados

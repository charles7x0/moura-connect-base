import mqtt from 'mqtt';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';

/**
 * Teste integrado ponta-a-ponta:
 * Leitura publicada no MQTT → ingestão → Kafka → processamento → alerta na API
 */
describe('Fluxo ponta-a-ponta: MQTT → Kafka → Alerta na API', () => {
  let token: string;

  beforeAll(async () => {
    // Login como operador
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana.souza@exemplo.com', senha: 'senha123' }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    token = data.token;
    expect(token).toBeDefined();
  });

  it('3 leituras consecutivas com tensão < 48V geram alerta crítico', async () => {
    const client = mqtt.connect(MQTT_URL);

    await new Promise<void>((resolve, reject) => {
      client.on('connect', resolve);
      client.on('error', reject);
    });

    // Publicar 3 leituras com tensão baixa para o mesmo banco
    const bancoId = 'BR-PE-0101-A';
    const siteId = 'SITE-0101';

    for (let i = 0; i < 3; i++) {
      const leitura = {
        bancoId,
        siteId,
        timestamp: new Date().toISOString(),
        tensaoV: 46.0 - i * 0.5,  // 46.0, 45.5, 45.0 — todas < 48V
        correnteA: -5.2,
        temperaturaC: 32.0,
        estadoCarga: 0.40,
        modo: 'descarga',
      };

      client.publish(
        `moura/telemetria/${siteId}/${bancoId}`,
        JSON.stringify(leitura)
      );

      // Esperar entre leituras para garantir processamento sequencial
      await new Promise((r) => setTimeout(r, 2000));
    }

    await client.endAsync();

    // Aguardar propagação completa (MQTT → Kafka → processamento → Kafka → API)
    await new Promise((r) => setTimeout(r, 8000));

    // Verificar que o alerta aparece na API
    const res = await fetch(`${API_URL}/alertas?status=ativo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok).toBe(true);
    const alertas = await res.json();

    const alerta = alertas.find(
      (a: any) => a.bancoId === bancoId && a.regra === 'tensao_baixa'
    );

    expect(alerta).toBeDefined();
    expect(alerta.severidade).toBe('critica');
    expect(alerta.status).toBe('ativo');
    expect(alerta.siteId).toBe(siteId);
  }, 30000);

  it('operador pode reconhecer um alerta', async () => {
    // Buscar alertas ativos
    const res = await fetch(`${API_URL}/alertas?status=ativo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const alertas = await res.json();

    if (alertas.length === 0) {
      console.warn('Nenhum alerta ativo para reconhecer — pulando teste');
      return;
    }

    const alertaId = alertas[0].alertaId;

    // Reconhecer
    const ackRes = await fetch(`${API_URL}/alertas/${alertaId}/reconhecer`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(ackRes.ok).toBe(true);
  });

  it('cliente não pode acessar sites de outro contrato', async () => {
    // Login como Ricardo (CT-1001 — sites 0101 a 0106)
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ricardo@telenordeste.exemplo.com', senha: 'senha123' }),
    });
    const { token: ricardoToken } = await loginRes.json();

    // Tentar acessar site da Juliana (CT-1002)
    const res = await fetch(`${API_URL}/sites/SITE-0107/bancos`, {
      headers: { Authorization: `Bearer ${ricardoToken}` },
    });

    expect(res.status).toBe(403);
  });
});

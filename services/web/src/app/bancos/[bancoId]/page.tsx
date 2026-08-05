'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { apiFetch, getToken, getStoredUser } from '@/lib/api';
import { useWebSocket } from '@/lib/ws';
import { AlarmBanner } from '@/components/layout/AlarmBanner';
import { TrendChart } from '@/components/charts/TrendChart';
import { Loading } from '@/components/feedback/Loading';

interface Leitura {
  timestamp: string;
  tensaoV: number;
  temperaturaC: number;
  correnteA: number;
  estadoCarga: number;
  modo: string;
}

interface Alerta {
  alertaId: string;
  bancoId: string;
  regra: string;
  severidade: string;
  status: string;
  aberturaEm: string;
  reconhecidoPor?: string;
}

export default function BancoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const bancoId = params.bancoId as string;
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [loading, setLoading] = useState(true);
  const token = getToken();
  const user = getStoredUser();
  const { messages, connected } = useWebSocket(token);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }

    loadData();
    const interval = setInterval(loadData, 15_000);
    return () => clearInterval(interval);
  }, [token, bancoId, router]);

  // Atualizar com dados do WebSocket
  useEffect(() => {
    const newReadings = messages
      .filter((m) => m.type === 'leitura' && m.payload?.bancoId === bancoId)
      .map((m) => m.payload);

    if (newReadings.length > 0) {
      setLeituras((prev) => [...prev, ...newReadings].slice(-200));
    }
  }, [messages, bancoId]);

  async function loadData() {
    try {
      const [leiturasRes, alertasRes] = await Promise.all([
        apiFetch<{ dados: Leitura[] }>(`/bancos/${bancoId}/leituras?pagina=1`),
        apiFetch<Alerta[]>('/alertas?status=ativo'),
      ]);
      setLeituras(leiturasRes.dados.reverse()); // Mais antigos primeiro para o gráfico
      setAlertas(alertasRes.filter((a) => a.bancoId === bancoId && a.status === 'ativo'));
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setLoading(false);
    }
  }

  async function reconhecer(alertaId: string) {
    try {
      await apiFetch(`/alertas/${alertaId}/reconhecer`, { method: 'POST' });
      await loadData();
    } catch (err) {
      console.error('Erro ao reconhecer:', err);
    }
  }

  const tensaoData = leituras.map((l) => ({ timestamp: l.timestamp, value: l.tensaoV }));
  const tempData = leituras.map((l) => ({ timestamp: l.timestamp, value: l.temperaturaC }));

  const SEVERIDADE_ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2 };
  const SEVERIDADE_COLOR: Record<string, string> = {
    critica: 'border-l-isa-alarm-critical',
    alta: 'border-l-isa-alarm-high',
    media: 'border-l-isa-alarm-medium',
  };

  const bancosAlertas = alertas
    .filter((a) => a.regra)
    // Deduplicar: manter apenas o mais recente de cada regra
    .reduce<Alerta[]>((acc, a) => {
      const existing = acc.find((x) => x.regra === a.regra);
      if (!existing) {
        acc.push(a);
      } else if (new Date(a.aberturaEm) > new Date(existing.aberturaEm)) {
        const idx = acc.indexOf(existing);
        acc[idx] = a;
      }
      return acc;
    }, [])
    .sort((a, b) => (SEVERIDADE_ORDER[a.severidade] ?? 9) - (SEVERIDADE_ORDER[b.severidade] ?? 9));

  return (
    <div className="min-h-screen flex flex-col">
      <AlarmBanner criticos={{ total: 0, reconhecidos: 0 }} altos={{ total: 0, reconhecidos: 0 }} medios={{ total: 0, reconhecidos: 0 }} usuario={user?.nome || ''} connected={connected} />

      <main className="flex-1 p-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-isa-text-muted mb-4">
          <button onClick={() => router.push('/sites')} className="hover:text-isa-text-primary">
            Operação
          </button>
          <span>/</span>
          <button onClick={() => router.back()} className="hover:text-isa-text-primary">
            Site
          </button>
          <span>/</span>
          <span className="text-isa-text-primary">{bancoId}</span>
        </nav>

        <h1 className="text-lg font-semibold text-isa-text-primary mb-4">Detalhe — {bancoId}</h1>

        {loading ? (
          <Loading />
        ) : (
          <div className="space-y-6">
            {/* Gráficos de tendência */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 bg-isa-surface rounded border border-isa-border">
                <TrendChart
                  data={tensaoData}
                  lowThreshold={48}
                  unit="V"
                  color="#60A5FA"
                  title="Tensão"
                />
              </div>
              <div className="p-4 bg-isa-surface rounded border border-isa-border">
                <TrendChart
                  data={tempData}
                  highThreshold={45}
                  unit="°C"
                  color="#F97316"
                  title="Temperatura"
                />
              </div>
            </div>

            {/* Alertas ativos */}
            <div className="p-4 bg-isa-surface rounded border border-isa-border">
              <h2 className="text-sm font-semibold text-isa-text-primary mb-3">Alertas Ativos</h2>
              {bancosAlertas.length === 0 ? (
                <p className="text-xs text-isa-text-muted">Nenhum alerta ativo</p>
              ) : (
                <div className="space-y-2">
                  {bancosAlertas.map((alerta) => (
                    <div
                      key={alerta.alertaId}
                      className={`flex items-center justify-between p-2 bg-isa-panel rounded border-l-4 ${SEVERIDADE_COLOR[alerta.severidade] || 'border-l-isa-border'} ${alerta.reconhecidoPor ? 'border-dashed' : ''}`}
                    >
                      <div>
                        <span className="text-xs font-bold text-isa-text-primary uppercase">
                          {alerta.regra.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-isa-text-muted ml-2">
                          {alerta.severidade} — desde {new Date(alerta.aberturaEm).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      {!alerta.reconhecidoPor && (
                        <button
                          onClick={() => reconhecer(alerta.alertaId)}
                          className="text-xs px-2 py-1 bg-isa-state-active/20 text-isa-state-active rounded hover:bg-isa-state-active/30"
                        >
                          Reconhecer
                        </button>
                      )}
                      {alerta.reconhecidoPor && (
                        <span className="text-[10px] text-isa-text-muted">
                          ✓ {alerta.reconhecidoPor}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

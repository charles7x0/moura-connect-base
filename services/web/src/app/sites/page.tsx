'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useWebSocket } from '@/lib/ws';
import { useAuth } from '@/hooks/useAuth';
import { useSites } from '@/hooks/useSites';
import { AlarmBanner } from '@/components/layout/AlarmBanner';
import { SiteCard } from '@/components/cards/SiteCard';
import { Loading } from '@/components/feedback/Loading';
import { ErrorMessage } from '@/components/feedback/ErrorMessage';

interface AlertaSimples {
  alertaId: string;
  bancoId: string;
  regra: string;
  severidade: string;
  reconhecidoPor?: string;
  aberturaEm: string;
}

export default function SitesPage() {
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const { sites, loading, error } = useSites(token);
  const { connected } = useWebSocket(token);
  const [alertasAtivos, setAlertasAtivos] = useState<AlertaSimples[]>([]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const data = await apiFetch<AlertaSimples[]>('/alertas?status=ativo');
        setAlertasAtivos(data);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [token]);

  // Deduplicar: 1 alerta por banco+regra (manter o mais recente)
  const dedupAlertas = alertasAtivos.reduce<AlertaSimples[]>((acc, a) => {
    const key = `${a.bancoId}:${a.regra}`;
    const existing = acc.find((x) => `${x.bancoId}:${x.regra}` === key);
    if (!existing) {
      acc.push(a);
    } else if (new Date(a.aberturaEm) > new Date(existing.aberturaEm)) {
      const idx = acc.indexOf(existing);
      acc[idx] = a;
    }
    return acc;
  }, []);

  const criticos = { total: dedupAlertas.filter((a) => a.severidade === 'critica').length, reconhecidos: dedupAlertas.filter((a) => a.severidade === 'critica' && a.reconhecidoPor).length };
  const altos = { total: dedupAlertas.filter((a) => a.severidade === 'alta').length, reconhecidos: dedupAlertas.filter((a) => a.severidade === 'alta' && a.reconhecidoPor).length };
  const medios = { total: dedupAlertas.filter((a) => a.severidade === 'media').length, reconhecidos: dedupAlertas.filter((a) => a.severidade === 'media' && a.reconhecidoPor).length };

  return (
    <div className="min-h-screen flex flex-col">
      <AlarmBanner
        criticos={criticos}
        altos={altos}
        medios={medios}
        usuario={user?.nome || ''}
        connected={connected}
      />

      <main className="flex-1 p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-isa-text-primary">Overview — Sites</h1>
            <p className="text-xs text-isa-text-muted">{sites.length} sites monitorados</p>
          </div>
          <button onClick={logout} className="text-xs text-isa-text-secondary hover:text-isa-text-primary">
            Sair
          </button>
        </div>

        {error && <ErrorMessage message={error} />}

        {loading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sites.map((site) => (
              <SiteCard
                key={site.siteId}
                siteId={site.siteId}
                nome={site.nome}
                cidade={site.cidade}
                uf={site.uf}
                totalBancos={site.totalBancos}
                alertasAtivos={site.alertasAtivos}
                alertaCritico={site.alertaCritico}
                minQualityScore={site.minQualityScore}
                worstState={site.worstState as 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline' | undefined}
                onClick={() => router.push(`/sites/${site.siteId}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

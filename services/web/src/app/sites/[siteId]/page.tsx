'use client';

import { useRouter, useParams } from 'next/navigation';
import { useWebSocket } from '@/lib/ws';
import { useAuth } from '@/hooks/useAuth';
import { useBancos } from '@/hooks/useBancos';
import { AlarmBanner } from '@/components/layout/AlarmBanner';
import { BancoCard } from '@/components/cards/BancoCard';
import { Loading } from '@/components/feedback/Loading';

export default function SiteDetailPage() {
  const router = useRouter();
  const params = useParams();
  const siteId = params.siteId as string;
  const { token, user } = useAuth();
  const { bancos, loading } = useBancos(siteId, token);
  const { connected } = useWebSocket(token);

  const alertasAtivos = bancos.reduce((acc, b) => acc + b.alertasAtivos.length, 0);
  const criticos = bancos.filter((b) => b.alertasAtivos.includes('tensao_baixa')).length;

  return (
    <div className="min-h-screen flex flex-col">
      <AlarmBanner
        criticos={{ total: criticos, reconhecidos: 0 }}
        altos={{ total: alertasAtivos - criticos, reconhecidos: 0 }}
        medios={{ total: 0, reconhecidos: 0 }}
        usuario={user?.nome || ''}
        connected={connected}
      />

      <main className="flex-1 p-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-isa-text-muted mb-4">
          <button onClick={() => router.push('/sites')} className="hover:text-isa-text-primary">
            Operação
          </button>
          <span>/</span>
          <span className="text-isa-text-primary">{siteId}</span>
        </nav>

        <h1 className="text-lg font-semibold text-isa-text-primary mb-1">Bancos — {siteId}</h1>
        <p className="text-xs text-isa-text-muted mb-4">{bancos.length} bancos neste site</p>

        {loading ? (
          <Loading />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {bancos.map((banco) => (
              <BancoCard
                key={banco.bancoId}
                bancoId={banco.bancoId}
                modelo={banco.modelo}
                state={banco.state as 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline' | undefined}
                ultimaLeitura={banco.ultimaLeitura as any}
                alertasAtivos={banco.alertasAtivos}
                onClick={() => router.push(`/bancos/${banco.bancoId}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

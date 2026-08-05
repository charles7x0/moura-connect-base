'use client';

interface SeveridadeCount {
  total: number;
  reconhecidos: number;
}

interface AlarmBannerProps {
  criticos: SeveridadeCount;
  altos: SeveridadeCount;
  medios: SeveridadeCount;
  usuario: string;
  connected: boolean;
}

/**
 * Banner ISA 18.2/101 — total por severidade + quantos reconhecidos em cada.
 */
export function AlarmBanner({ criticos, altos, medios, usuario, connected }: AlarmBannerProps) {
  const total = criticos.total + altos.total + medios.total;

  return (
    <header className="flex items-center justify-between px-4 py-2 bg-isa-surface border-b border-isa-border">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-isa-text-primary">MOURA CONNECT</span>
        <div className="h-4 w-px bg-isa-border" />
        {total > 0 ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-isa-text-secondary">🔔 {total} ativo{total > 1 ? 's' : ''}</span>
            {criticos.total > 0 && (
              <span className="px-2 py-0.5 rounded bg-isa-alarm-critical text-white font-bold">
                {criticos.total} CRÍT
                {criticos.reconhecidos > 0 && <span className="font-normal ml-1 opacity-75">({criticos.reconhecidos} rec)</span>}
              </span>
            )}
            {altos.total > 0 && (
              <span className="px-2 py-0.5 rounded bg-isa-alarm-high text-black font-bold">
                {altos.total} ALTO
                {altos.reconhecidos > 0 && <span className="font-normal ml-1 opacity-75">({altos.reconhecidos} rec)</span>}
              </span>
            )}
            {medios.total > 0 && (
              <span className="px-2 py-0.5 rounded bg-isa-alarm-medium text-black font-bold">
                {medios.total} MÉD
                {medios.reconhecidos > 0 && <span className="font-normal ml-1 opacity-75">({medios.reconhecidos} rec)</span>}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-isa-text-muted">Operação normal</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-isa-text-secondary">
        <span className={`flex items-center gap-1 ${connected ? 'text-isa-state-ok' : 'text-isa-alarm-critical'}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-isa-state-ok' : 'bg-isa-alarm-critical'}`} />
          {connected ? 'Online' : 'Desconectado'}
        </span>
        <span>{usuario}</span>
        <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </header>
  );
}

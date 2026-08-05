'use client';

import { AnalogBar } from '@/components/indicators/AnalogBar';
import { QualityBadge } from '@/components/indicators/QualityBadge';
import { StateBadge } from '@/components/indicators/StateBadge';

interface BancoCardProps {
  bancoId: string;
  modelo: string;
  state?: 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline';
  ultimaLeitura: {
    tensaoV: number;
    temperaturaC: number;
    estadoCarga: number;
    modo: string;
    _quality?: { score: number; fresh: boolean; latencyMs: number };
  } | null;
  alertasAtivos: string[];
  onClick: () => void;
}

const MODO_LABELS: Record<string, { text: string; color: string }> = {
  flutuacao: { text: 'Flutuação', color: 'text-isa-process-normal' },
  descarga: { text: 'DESCARGA', color: 'text-isa-state-active font-bold' },
  recarga: { text: 'Recarga', color: 'text-isa-state-ok' },
};

const ALERTA_LABELS: Record<string, { text: string; color: string }> = {
  tensao_baixa: { text: 'TENSÃO BAIXA', color: 'bg-isa-alarm-critical text-white' },
  sobretemperatura: { text: 'SOBRETEMPERATURA', color: 'bg-isa-alarm-high text-black' },
  banco_offline: { text: 'OFFLINE', color: 'bg-isa-alarm-high text-black' },
  descarga_prolongada: { text: 'DESC. PROLONGADA', color: 'bg-isa-alarm-medium text-black' },
};

/**
 * Card de banco (L2) — ISA 101 com barras analógicas e indicadores de alarme.
 */
export function BancoCard({ bancoId, modelo, state, ultimaLeitura, alertasAtivos, onClick }: BancoCardProps) {
  const hasAlarm = alertasAtivos.length > 0;
  const hasCritical = alertasAtivos.includes('tensao_baixa');

  const borderColor = hasCritical
    ? 'border-isa-alarm-critical'
    : hasAlarm
      ? 'border-isa-alarm-high'
      : 'border-isa-border';

  const modo = ultimaLeitura?.modo || 'desconhecido';
  const modoInfo = MODO_LABELS[modo] || { text: modo, color: 'text-isa-text-muted' };

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded border-2 ${borderColor} bg-isa-surface hover:bg-isa-panel transition-colors`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-isa-text-muted">{bancoId}</span>
        <div className="flex items-center gap-2">
          <StateBadge state={state} />
          <QualityBadge score={ultimaLeitura?._quality?.score} />
          <span className={`text-xs ${modoInfo.color}`}>{modoInfo.text}</span>
        </div>
      </div>

      {ultimaLeitura ? (
        <div className="space-y-1.5">
          <AnalogBar label="V" value={ultimaLeitura.tensaoV} min={40} max={58} lowAlarm={48} unit="V" />
          <AnalogBar label="°C" value={ultimaLeitura.temperaturaC} min={15} max={60} highAlarm={45} unit="°" />
          <div className="flex items-center justify-between text-xs text-isa-text-secondary mt-1">
            <span>SoC: {(ultimaLeitura.estadoCarga * 100).toFixed(0)}%</span>
            <span className="text-isa-text-muted">{modelo}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-isa-state-offline">Sem dados</p>
      )}

      {alertasAtivos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {alertasAtivos.map((regra) => {
            const info = ALERTA_LABELS[regra] || { text: regra, color: 'bg-isa-alarm-medium text-black' };
            return (
              <span key={regra} className={`text-[10px] px-1.5 py-0.5 rounded ${info.color}`}>
                ▲ {info.text}
              </span>
            );
          })}
        </div>
      )}
    </button>
  );
}

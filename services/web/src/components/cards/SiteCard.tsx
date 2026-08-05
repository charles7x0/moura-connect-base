'use client';

import { QualityBadge } from '@/components/indicators/QualityBadge';
import { StateBadge } from '@/components/indicators/StateBadge';

interface SiteCardProps {
  siteId: string;
  nome: string;
  cidade: string;
  uf: string;
  totalBancos: number;
  alertasAtivos: number;
  alertaCritico: boolean;
  minQualityScore?: number;
  worstState?: 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline';
  onClick: () => void;
}

/**
 * Card de site no Overview (L1) — ISA 101.
 * Normal = discreto (cinza). Com alerta = destaque na severidade mais alta.
 * Quality badge mostra o pior banco (min) — operador precisa ver degradação.
 */
export function SiteCard({ siteId, nome, cidade, uf, totalBancos, alertasAtivos, alertaCritico, minQualityScore, worstState, onClick }: SiteCardProps) {
  const borderColor = alertaCritico
    ? 'border-isa-alarm-critical'
    : alertasAtivos > 0
      ? 'border-isa-alarm-high'
      : 'border-isa-border';

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded border-2 ${borderColor} bg-isa-surface hover:bg-isa-panel transition-colors`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-mono text-isa-text-muted">{siteId}</p>
          <p className="text-base text-isa-text-primary font-medium">{nome}</p>
          <p className="text-xs text-isa-text-secondary">{cidade}/{uf}</p>
        </div>
        <div className="text-right space-y-1">
          <div className="flex items-center justify-end gap-2">
            <StateBadge state={worstState} />
            <QualityBadge score={minQualityScore} />
            <span className="text-xs text-isa-text-secondary">{totalBancos} bancos</span>
          </div>
          {alertasAtivos > 0 ? (
            <p className={`text-xs font-bold ${alertaCritico ? 'text-isa-alarm-critical' : 'text-isa-alarm-high'}`}>
              ▲ {alertasAtivos} alerta{alertasAtivos > 1 ? 's' : ''}
            </p>
          ) : (
            <p className="text-xs text-isa-process-normal">● OK</p>
          )}
        </div>
      </div>
    </button>
  );
}

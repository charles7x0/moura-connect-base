'use client';

type BancoState = 'normal' | 'degradado' | 'alerta' | 'critico' | 'offline';

interface StateBadgeProps {
  state: BancoState | undefined;
}

const STATE_CONFIG: Record<BancoState, { label: string; color: string }> = {
  normal: { label: 'Normal', color: 'text-isa-process-normal' },
  degradado: { label: 'Degradado', color: 'text-isa-alarm-medium' },
  alerta: { label: 'Alerta', color: 'text-isa-alarm-high' },
  critico: { label: 'CRÍTICO', color: 'text-isa-alarm-critical font-bold' },
  offline: { label: 'OFFLINE', color: 'text-isa-state-offline font-bold' },
};

/**
 * ISA 101 State Badge — mostra o estado FSM do banco.
 * Normal = discreto, estados anormais = destaque.
 */
export function StateBadge({ state }: StateBadgeProps) {
  const s = state ?? 'normal';
  const cfg = STATE_CONFIG[s];

  return (
    <span className={`text-[10px] uppercase ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

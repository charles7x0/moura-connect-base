'use client';

interface AnalogBarProps {
  value: number;
  min: number;
  max: number;
  lowAlarm?: number;
  highAlarm?: number;
  unit: string;
  label: string;
}

/**
 * Barra analógica ISA 101 — representação visual de grandeza contínua
 * com indicadores de limite de alarme.
 */
export function AnalogBar({ value, min, max, lowAlarm, highAlarm, unit, label }: AnalogBarProps) {
  const range = max - min;
  const percentage = Math.min(100, Math.max(0, ((value - min) / range) * 100));
  const isAlarmed = (lowAlarm !== undefined && value < lowAlarm) || (highAlarm !== undefined && value > highAlarm);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-isa-text-secondary w-6 shrink-0">{label}</span>
      <div className="relative flex-1 h-3 bg-isa-panel rounded-sm overflow-hidden">
        {/* Barra de valor */}
        <div
          className={`h-full transition-all duration-500 ${isAlarmed ? 'bg-isa-alarm-critical' : 'bg-isa-process-normal'}`}
          style={{ width: `${percentage}%` }}
        />
        {/* Marcador limite inferior */}
        {lowAlarm !== undefined && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-400/70"
            style={{ left: `${((lowAlarm - min) / range) * 100}%` }}
          />
        )}
        {/* Marcador limite superior */}
        {highAlarm !== undefined && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-400/70"
            style={{ left: `${((highAlarm - min) / range) * 100}%` }}
          />
        )}
      </div>
      <span className={`text-sm font-mono w-16 text-right shrink-0 ${isAlarmed ? 'text-isa-alarm-critical font-bold' : 'text-isa-text-primary'}`}>
        {value.toFixed(1)}{unit}
      </span>
    </div>
  );
}

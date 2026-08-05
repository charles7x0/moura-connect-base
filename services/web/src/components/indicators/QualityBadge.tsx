'use client';

interface QualityBadgeProps {
  score: number | undefined;
}

/**
 * ISA 101 Quality Badge — indica confiabilidade do dado.
 * Score 80–100: bom (discreto), 50–79: degradado (âmbar), <50: ruim (vermelho).
 */
export function QualityBadge({ score }: QualityBadgeProps) {
  if (score === undefined) return null;

  let color: string;
  let label: string;

  if (score >= 80) {
    color = 'text-isa-process-normal';
    label = `Q:${score}`;
  } else if (score >= 50) {
    color = 'text-isa-alarm-high';
    label = `Q:${score}⚠`;
  } else {
    color = 'text-isa-alarm-critical';
    label = `Q:${score}✗`;
  }

  return (
    <span className={`text-[10px] font-mono ${color}`} title={`Qualidade do dado: ${score}/100`}>
      {label}
    </span>
  );
}

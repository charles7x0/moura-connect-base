'use client';

import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';

interface DataPoint {
  timestamp: string;
  value: number;
}

interface TrendChartProps {
  data: DataPoint[];
  lowThreshold?: number;
  highThreshold?: number;
  unit: string;
  color: string;
  title: string;
}

/**
 * Gráfico de tendência ISA 101 com threshold lines.
 * Sem animações decorativas — dados mudam suavemente.
 */
export function TrendChart({ data, lowThreshold, highThreshold, unit, color, title }: TrendChartProps) {
  const formattedData = data.map((d) => ({
    ...d,
    time: new Date(d.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div>
      <p className="text-xs text-isa-text-secondary mb-2">{title} ({unit})</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={formattedData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis
            dataKey="time"
            stroke="#6B7280"
            tick={{ fontSize: 10, fill: '#9E9E9E' }}
            axisLine={{ stroke: '#4A4A4A' }}
          />
          <YAxis
            stroke="#6B7280"
            tick={{ fontSize: 10, fill: '#9E9E9E' }}
            axisLine={{ stroke: '#4A4A4A' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#363636', border: '1px solid #4A4A4A', borderRadius: 4 }}
            labelStyle={{ color: '#9E9E9E' }}
            itemStyle={{ color: '#E0E0E0' }}
          />

          {/* Threshold lines — ISA 101: always visible */}
          {lowThreshold !== undefined && (
            <ReferenceLine
              y={lowThreshold}
              stroke="#DC2626"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `${lowThreshold}${unit}`, position: 'right', fontSize: 10, fill: '#DC2626' }}
            />
          )}
          {highThreshold !== undefined && (
            <ReferenceLine
              y={highThreshold}
              stroke="#DC2626"
              strokeDasharray="5 3"
              strokeWidth={1.5}
              label={{ value: `${highThreshold}${unit}`, position: 'right', fontSize: 10, fill: '#DC2626' }}
            />
          )}

          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

import { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';
import type { SeriesPoint } from '@/engine/budget';
import { monthLabel } from '@/engine/dates';
import { useTheme } from '@/theme';

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;

export interface Slice {
  value: number;
  color: string;
}

/** Rosca. O texto central é passado por quem usa (ex.: nota de saúde). */
export function Donut({ slices, size = 140, thickness = 18, center, sub }: { slices: Slice[]; size?: number; thickness?: number; center?: string; sub?: string }) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={thickness} fill="none" />
        {total > 0 &&
          slices.map((s, i) => {
            const len = (s.value / total) * c;
            const el = (
              <Circle key={i} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={thickness} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
      </G>
      {center ? (
        <SvgText x={size / 2} y={size / 2 + (sub ? 2 : 8)} textAnchor="middle" fontSize={size * 0.22} fontWeight="800" fontFamily={FONT} fill={t.text}>
          {center}
        </SvgText>
      ) : null}
      {sub ? (
        <SvgText x={size / 2} y={size / 2 + size * 0.17} textAnchor="middle" fontSize={size * 0.09} fontFamily={FONT} fill={t.muted}>
          {sub}
        </SvgText>
      ) : null}
    </Svg>
  );
}

/** Barras agrupadas: receitas x despesas por mês. */
export function BarsChart({ data, height = 150 }: { data: SeriesPoint[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents]));
  const labelH = 18;
  const plotH = height - labelH;
  const slot = width / data.length;
  const barW = Math.min(18, slot * 0.28);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Rect x={0} y={plotH} width={width} height={1} fill={t.border} />
          {data.map((d, i) => {
            const cx = slot * i + slot / 2;
            const hi = (d.incomeCents / max) * (plotH - 4);
            const he = (d.expenseCents / max) * (plotH - 4);
            return (
              <G key={d.month}>
                <Rect x={cx - barW - 1} y={plotH - hi} width={barW} height={hi} rx={4} fill={t.income} />
                <Rect x={cx + 1} y={plotH - he} width={barW} height={he} rx={4} fill={t.expense} />
                <SvgText x={cx} y={height - 3} textAnchor="middle" fontSize={11} fontFamily={FONT} fill={t.muted}>
                  {monthLabel(d.month, true).split('/')[0]}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

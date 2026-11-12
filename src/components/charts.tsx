import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import type { DayPoint, SeriesPoint } from '@/engine/budget';
import { monthLabel } from '@/engine/dates';
import { formatBRLShort } from '@/engine/money';
import { useTheme } from '@/theme';

/*
 * Gráficos em SVG puro (react-native-svg), sem biblioteca de charts: são
 * poucos elementos e o desenho é barato. As animações usam animatedProps do
 * Reanimated, que atualiza o SVG na thread de UI — a rolagem não engasga.
 */

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;
const EASE = Easing.out(Easing.cubic);

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);

export interface Slice {
  value: number;
  color: string;
}

/** Rosca. Cresce ao aparecer; o texto central é definido por quem usa. */
export function Donut({
  slices,
  size = 140,
  thickness = 18,
  center,
  sub,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
}) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 750, easing: EASE });
  }, [total, slices.length, grow]);

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = total > 0 ? (s.value / total) * circumference : 0;
    const at = offset;
    offset += len;
    return { color: s.color, len, at };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={thickness} fill="none" />
        {arcs.map((a, i) => (
          <Arc key={i} cx={size / 2} cy={size / 2} r={r} thickness={thickness} color={a.color} len={a.len} at={a.at} circumference={circumference} grow={grow} />
        ))}
      </G>
      {center ? (
        <SvgText x={size / 2} y={size / 2 + (sub ? 2 : 8)} textAnchor="middle" fontSize={size * 0.21} fontWeight="800" fontFamily={FONT} fill={t.text}>
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

function Arc({
  cx, cy, r, thickness, color, len, at, circumference, grow,
}: {
  cx: number; cy: number; r: number; thickness: number; color: string;
  len: number; at: number; circumference: number; grow: { value: number };
}) {
  const props = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0, len * grow.value - 2), circumference] as unknown as string,
    strokeDashoffset: -at * grow.value,
  }));
  return <ACircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={thickness} strokeLinecap="butt" fill="none" animatedProps={props} />;
}

/**
 * Ritmo do mês: quanto você já gastou, dia a dia, contra o ritmo que caberia
 * no orçamento. A linha cheia acima da tracejada quer dizer "gastando rápido".
 */
export function SpendingPace({
  points,
  totalDays,
  height = 170,
}: {
  points: DayPoint[];
  totalDays: number;
  height?: number;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);
  const last = points[points.length - 1];
  const ahead = !!last && last.cumulativeCents > last.paceCents;
  const lineColor = ahead ? t.over : t.ok;

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 900, easing: EASE });
  }, [points.length, draw]);

  const padX = 10;
  const padTop = 14;
  const axis = 20;
  const plotH = height - axis - padTop;
  const budget = Math.round((last?.paceCents ?? 0) * (totalDays / Math.max(1, last?.day ?? 1)));
  const maxY = Math.max(1, last?.cumulativeCents ?? 0, budget) * 1.12;

  const x = (day: number) => padX + ((day - 1) / Math.max(1, totalDays - 1)) * (width - padX * 2);
  const y = (cents: number) => padTop + plotH - (cents / maxY) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.cumulativeCents).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(last.day).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z` : '';
  // Comprimento aproximado do traçado, para animar o desenho da linha.
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(x(points[i].day) - x(points[i - 1].day), y(points[i].cumulativeCents) - y(points[i - 1].cumulativeCents));
  }
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));

  const tick = (d: number) => (
    <SvgText key={d} x={x(d)} y={height - 4} textAnchor="middle" fontSize={10} fontFamily={FONT} fill={t.muted}>
      {d}
    </SvgText>
  );

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={padX} y1={y(0)} x2={width - padX} y2={y(0)} stroke={t.border} strokeWidth={1} />
          {/* ritmo ideal: gastar o orçamento por igual até o fim do mês */}
          <Line x1={x(1)} y1={y(budget / totalDays)} x2={x(totalDays)} y2={y(budget)} stroke={t.muted} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.7} />
          <Path d={area} fill={lineColor} opacity={0.12} />
          <APath d={line} stroke={lineColor} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={length} animatedProps={lineProps} />
          <Circle cx={x(last.day)} cy={y(last.cumulativeCents)} r={4.5} fill={lineColor} stroke={t.card} strokeWidth={2} />
          {[1, Math.round(totalDays / 2), totalDays].map(tick)}
        </Svg>
      ) : null}
    </View>
  );
}

/** Receitas x despesas por mês, com o valor escrito em cima da barra. */
export function MonthlyBars({ data, height = 170 }: { data: SeriesPoint[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents]));
  const labelH = 18;
  const valueH = 14;
  const plotH = height - labelH - valueH;
  const slot = width / Math.max(1, data.length);
  const barW = Math.min(16, slot * 0.26);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line x1={0} y1={valueH + plotH} x2={width} y2={valueH + plotH} stroke={t.border} strokeWidth={1} />
          {data.map((d, i) => {
            const cx = slot * i + slot / 2;
            const hi = (d.incomeCents / max) * plotH;
            const he = (d.expenseCents / max) * plotH;
            const over = d.expenseCents > d.incomeCents && d.incomeCents > 0;
            return (
              <G key={d.month}>
                <Rect x={cx - barW - 1} y={valueH + plotH - hi} width={barW} height={hi} rx={3} fill={t.income} />
                <Rect x={cx + 1} y={valueH + plotH - he} width={barW} height={he} rx={3} fill={over ? t.over : t.expense} />
                {d.expenseCents > 0 ? (
                  <SvgText x={cx} y={valueH + plotH - Math.max(hi, he) - 4} textAnchor="middle" fontSize={9.5} fontFamily={FONT} fill={t.muted}>
                    {formatBRLShort(d.expenseCents).replace('R$ ', '')}
                  </SvgText>
                ) : null}
                <SvgText x={cx} y={height - 5} textAnchor="middle" fontSize={10.5} fontFamily={FONT} fill={t.muted}>
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

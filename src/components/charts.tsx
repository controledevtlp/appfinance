import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
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
const ARect = Animated.createAnimatedComponent(Rect);

export interface Slice {
  value: number;
  color: string;
}

/** Rosca com pontas arredondadas. Cresce ao aparecer. */
export function Donut({
  slices,
  size = 140,
  thickness = 18,
  center,
  sub,
  centerSize = 0.23,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
  centerSize?: number;
}) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 850, easing: EASE });
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
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={thickness} fill="none" opacity={0.5} />
        {arcs.map((a, i) => (
          <Arc key={i} cx={size / 2} cy={size / 2} r={r} thickness={thickness} color={a.color} len={a.len} at={a.at} circumference={circumference} grow={grow} single={arcs.length <= 2} />
        ))}
      </G>
      {center ? (
        <SvgText
          x={size / 2}
          y={size / 2 + (sub ? 1 : size * 0.08)}
          textAnchor="middle"
          fontSize={size * centerSize}
          fontWeight="800"
          fontFamily={FONT}
          fill={t.textStrong}>
          {center}
        </SvgText>
      ) : null}
      {sub ? (
        <SvgText x={size / 2} y={size / 2 + size * 0.17} textAnchor="middle" fontSize={size * 0.095} fontWeight="600" fontFamily={FONT} fill={t.muted}>
          {sub}
        </SvgText>
      ) : null}
    </Svg>
  );
}

function Arc({
  cx, cy, r, thickness, color, len, at, circumference, grow, single,
}: {
  cx: number; cy: number; r: number; thickness: number; color: string;
  len: number; at: number; circumference: number; grow: { value: number }; single: boolean;
}) {
  const gap = single ? 0 : 3;
  const props = useAnimatedProps(() => ({
    strokeDasharray: [Math.max(0, len * grow.value - gap), circumference] as unknown as string,
    strokeDashoffset: -at * grow.value,
  }));
  return (
    <ACircle
      cx={cx}
      cy={cy}
      r={r}
      stroke={color}
      strokeWidth={thickness}
      strokeLinecap={single ? 'round' : 'butt'}
      fill="none"
      animatedProps={props}
    />
  );
}

/**
 * Ritmo do mês: quanto você já gastou, dia a dia, contra o ritmo que caberia
 * no orçamento. A linha cheia acima da tracejada quer dizer "gastando rápido".
 */
export function SpendingPace({ points, totalDays, height = 180 }: { points: DayPoint[]; totalDays: number; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);
  const last = points[points.length - 1];
  const ahead = !!last && last.cumulativeCents > last.paceCents;
  const lineColor = ahead ? t.over : t.ok;

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 1000, easing: EASE });
  }, [points.length, draw]);

  const padX = 8;
  const padTop = 16;
  const axis = 22;
  const plotH = height - axis - padTop;
  const budget = Math.round((last?.paceCents ?? 0) * (totalDays / Math.max(1, last?.day ?? 1)));
  const maxY = Math.max(1, last?.cumulativeCents ?? 0, budget) * 1.14;

  const x = (day: number) => padX + ((day - 1) / Math.max(1, totalDays - 1)) * (width - padX * 2);
  const y = (cents: number) => padTop + plotH - (cents / maxY) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.cumulativeCents).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(last.day).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z` : '';
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(x(points[i].day) - x(points[i - 1].day), y(points[i].cumulativeCents) - y(points[i - 1].cumulativeCents));
  }
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.45} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Line x1={padX} y1={y(0)} x2={width - padX} y2={y(0)} stroke={t.border} strokeWidth={1} />
          {/* ritmo ideal: gastar o orçamento por igual até o fim do mês */}
          <Line x1={x(1)} y1={y(budget / totalDays)} x2={x(totalDays)} y2={y(budget)} stroke={t.muted} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.6} />
          <Path d={area} fill="url(#paceFill)" />
          <APath d={line} stroke={lineColor} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={length} animatedProps={lineProps} />
          <Circle cx={x(last.day)} cy={y(last.cumulativeCents)} r={9} fill={lineColor} opacity={0.22} />
          <Circle cx={x(last.day)} cy={y(last.cumulativeCents)} r={5} fill={lineColor} stroke={t.bg} strokeWidth={2} />
          {[1, Math.round(totalDays / 2), totalDays].map((d) => (
            <SvgText key={d} x={x(d)} y={height - 5} textAnchor="middle" fontSize={11} fontWeight="600" fontFamily={FONT} fill={t.faint}>
              {d}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Receitas x despesas por mês, com o valor escrito em cima da barra. */
export function MonthlyBars({ data, height = 190 }: { data: SeriesPoint[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const grow = useSharedValue(0);
  const max = Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents]));
  const labelH = 20;
  const valueH = 16;
  const plotH = height - labelH - valueH;
  const slot = width / Math.max(1, data.length);
  const barW = Math.min(17, slot * 0.27);

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 800, easing: EASE });
  }, [data.length, max, grow]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="barIn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.income} stopOpacity={1} />
              <Stop offset="100%" stopColor={t.income} stopOpacity={0.35} />
            </LinearGradient>
            <LinearGradient id="barOut" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.expense} stopOpacity={1} />
              <Stop offset="100%" stopColor={t.expense} stopOpacity={0.35} />
            </LinearGradient>
          </Defs>
          <Line x1={0} y1={valueH + plotH} x2={width} y2={valueH + plotH} stroke={t.border} strokeWidth={1} />
          {data.map((d, i) => {
            const cx = slot * i + slot / 2;
            const hi = (d.incomeCents / max) * plotH;
            const he = (d.expenseCents / max) * plotH;
            return (
              <G key={d.month}>
                <GrowBar x={cx - barW - 2} baseY={valueH + plotH} w={barW} h={hi} fill="url(#barIn)" grow={grow} />
                <GrowBar x={cx + 2} baseY={valueH + plotH} w={barW} h={he} fill="url(#barOut)" grow={grow} />
                {d.expenseCents > 0 ? (
                  <SvgText x={cx} y={valueH + plotH - Math.max(hi, he) - 6} textAnchor="middle" fontSize={10.5} fontWeight="700" fontFamily={FONT} fill={t.muted}>
                    {formatBRLShort(d.expenseCents).replace('R$ ', '')}
                  </SvgText>
                ) : null}
                <SvgText x={cx} y={height - 6} textAnchor="middle" fontSize={11} fontWeight="600" fontFamily={FONT} fill={t.faint}>
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

function GrowBar({ x, baseY, w, h, fill, grow }: { x: number; baseY: number; w: number; h: number; fill: string; grow: { value: number } }) {
  const props = useAnimatedProps(() => ({ y: baseY - h * grow.value, height: Math.max(0.01, h * grow.value) }));
  return <ARect x={x} width={w} rx={5} fill={fill} animatedProps={props} />;
}

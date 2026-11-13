import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { DayPoint, SeriesPoint } from '@/engine/budget';
import { monthLabel } from '@/engine/dates';
import { useTheme, type Theme } from '@/theme';

/*
 * Gráficos em SVG puro (react-native-svg), sem biblioteca de charts: são
 * poucos elementos e o desenho é barato. As animações usam animatedProps do
 * Reanimated, que atualiza o SVG na thread de UI — a rolagem não engasga.
 *
 * Regra de leitura adotada em todos: linhas de referência horizontais com o
 * valor à esquerda. Sem elas a pessoa vê a forma mas não sabe a ordem de
 * grandeza, e aí o gráfico vira enfeite.
 */

const FONT = Platform.OS === 'web' ? 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' : undefined;
const EASE = Easing.out(Easing.cubic);

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);
const ARect = Animated.createAnimatedComponent(Rect);

/** Espaço à esquerda para os valores do eixo. */
const GUTTER = 36;
const PAD_RIGHT = 10;
const AXIS_H = 22;

/** Valor curto para eixo: "7 mil", "1,2 mi", "350". */
function axisLabel(cents: number): string {
  const v = Math.abs(cents) / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1000) {
    const k = v / 1000;
    return `${(k >= 10 ? Math.round(k) : Number(k.toFixed(1))).toString().replace('.', ',')} mil`;
  }
  return String(Math.round(v));
}

/**
 * Escala "redonda": sobe o topo até um número amigável (1, 2, 2,5 ou 5 vezes
 * uma potência de 10) para as linhas caírem em valores legíveis.
 */
function niceScale(max: number, steps = 3): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0] };
  const raw = max / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const stepNorm = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = stepNorm * mag;
  const top = step * steps;
  return { top, ticks: Array.from({ length: steps + 1 }, (_, i) => i * step) };
}

/** Linhas de referência + valores à esquerda, comuns aos gráficos de área e barra. */
function Grid({ ticks, top, plotTop, plotH, width, t }: { ticks: number[]; top: number; plotTop: number; plotH: number; width: number; t: Theme }) {
  return (
    <G>
      {ticks.map((value) => {
        const y = plotTop + plotH - (value / top) * plotH;
        return (
          <G key={value}>
            <Line
              x1={GUTTER}
              y1={y}
              x2={width - PAD_RIGHT}
              y2={y}
              stroke={t.border}
              strokeWidth={1}
              strokeDasharray={value === 0 ? undefined : '3 5'}
              opacity={value === 0 ? 1 : 0.7}
            />
            <SvgText x={GUTTER - 6} y={y + 3.5} textAnchor="end" fontSize={9.5} fontWeight="600" fontFamily={FONT} fill={t.faint}>
              {axisLabel(value)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

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
  centerSize,
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

  // O texto do miolo tem de caber no buraco da rosca, senão encosta no anel.
  const hole = (r - thickness / 2) * 2;
  const fitted = center ? Math.min(centerSize ?? 0.24, (hole * 0.92) / (center.length * 0.58) / size) : 0;

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
          y={size / 2 + (sub ? size * 0.015 : size * fitted * 0.36)}
          textAnchor="middle"
          fontSize={size * fitted}
          fontWeight="800"
          fontFamily={FONT}
          fill={t.textStrong}>
          {center}
        </SvgText>
      ) : null}
      {sub ? (
        <SvgText x={size / 2} y={size / 2 + size * 0.18} textAnchor="middle" fontSize={size * 0.092} fontWeight="600" fontFamily={FONT} fill={t.muted}>
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
    <ACircle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={thickness} strokeLinecap={single ? 'round' : 'butt'} fill="none" animatedProps={props} />
  );
}

/**
 * Ritmo do mês: quanto você já gastou, dia a dia, contra o ritmo que caberia
 * no orçamento. A linha cheia acima da tracejada quer dizer "gastando rápido".
 */
export function SpendingPace({ points, totalDays, height = 196 }: { points: DayPoint[]; totalDays: number; height?: number }) {
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

  const padTop = 16;
  const plotH = height - AXIS_H - padTop;
  const budget = Math.round((last?.paceCents ?? 0) * (totalDays / Math.max(1, last?.day ?? 1)));
  const { top, ticks } = niceScale(Math.max(1, last?.cumulativeCents ?? 0, budget));

  const x = (day: number) => GUTTER + ((day - 1) / Math.max(1, totalDays - 1)) * (width - GUTTER - PAD_RIGHT);
  const y = (cents: number) => padTop + plotH - (cents / top) * plotH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.cumulativeCents).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(last.day).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z` : '';
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(x(points[i].day) - x(points[i - 1].day), y(points[i].cumulativeCents) - y(points[i - 1].cumulativeCents));
  }
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));

  // Primeiro e último rótulo encostam na borda se ficarem centrados.
  const days = [1, Math.round(totalDays / 2), totalDays];
  const anchorOf = (i: number): 'start' | 'end' | 'middle' => (i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle');

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
              <Stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>
          <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} t={t} />
          {/* ritmo ideal: gastar o orçamento por igual até o fim do mês */}
          <Line x1={x(1)} y1={y(budget / totalDays)} x2={x(totalDays)} y2={y(budget)} stroke={t.muted} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.75} />
          <Path d={area} fill="url(#paceFill)" />
          <APath d={line} stroke={lineColor} strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={length} animatedProps={lineProps} />
          <Circle cx={x(last.day)} cy={y(last.cumulativeCents)} r={9} fill={lineColor} opacity={0.2} />
          <Circle cx={x(last.day)} cy={y(last.cumulativeCents)} r={5} fill={lineColor} stroke={t.bg} strokeWidth={2} />
          {days.map((d, i) => (
            <SvgText key={d} x={x(d)} y={height - 5} textAnchor={anchorOf(i)} fontSize={10.5} fontWeight="600" fontFamily={FONT} fill={t.faint}>
              {i === days.length - 1 ? `dia ${d}` : d}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * Receitas x despesas por mês. O mês mais recente fica destacado e os demais
 * em meio-tom, para o olho achar o "agora" sem precisar ler os rótulos.
 */
export function MonthlyBars({ data, height = 200 }: { data: SeriesPoint[]; height?: number }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const grow = useSharedValue(0);
  const { top, ticks } = niceScale(Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents])));
  const padTop = 10;
  const plotH = height - AXIS_H - padTop;
  const slot = (width - GUTTER - PAD_RIGHT) / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(15, slot * 0.3));

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 800, easing: EASE });
  }, [data.length, top, grow]);

  const y = (c: number) => padTop + plotH - (c / top) * plotH;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="barIn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.income} stopOpacity={1} />
              <Stop offset="100%" stopColor={t.income} stopOpacity={0.3} />
            </LinearGradient>
            <LinearGradient id="barOut" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.expense} stopOpacity={1} />
              <Stop offset="100%" stopColor={t.expense} stopOpacity={0.3} />
            </LinearGradient>
          </Defs>
          <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} t={t} />
          {data.map((d, i) => {
            const cx = GUTTER + slot * i + slot / 2;
            const current = i === data.length - 1;
            const hi = (d.incomeCents / top) * plotH;
            const he = (d.expenseCents / top) * plotH;
            return (
              <G key={d.month} opacity={current ? 1 : 0.72}>
                {current ? (
                  <Rect x={cx - slot / 2 + 2} y={padTop - 4} width={slot - 4} height={plotH + 8} rx={8} fill={t.primary} opacity={0.07} />
                ) : null}
                <GrowBar x={cx - barW - 1.5} baseY={padTop + plotH} w={barW} h={hi} fill="url(#barIn)" grow={grow} />
                <GrowBar x={cx + 1.5} baseY={padTop + plotH} w={barW} h={he} fill="url(#barOut)" grow={grow} />
                <SvgText
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={current ? '800' : '600'}
                  fontFamily={FONT}
                  fill={current ? t.text : t.faint}>
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
  return <ARect x={x} width={w} rx={Math.min(5, w / 2)} fill={fill} animatedProps={props} />;
}

/**
 * Evolução de um investimento: a área de baixo é o que você colocou do
 * bolso, a de cima é o que os juros renderam. O que faz a pessoa entender
 * juros compostos é justamente ver a faixa de cima abrindo com o tempo.
 */
export function GrowthChart({
  points,
  height = 200,
}: {
  points: { month: number; investedCents: number; balanceCents: number }[];
  height?: number;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);
  const last = points[points.length - 1];
  const { top, ticks } = niceScale(Math.max(1, last?.balanceCents ?? 1));
  const months = Math.max(1, last?.month ?? 1);

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 950, easing: EASE });
  }, [points.length, top, draw]);

  const padTop = 12;
  const plotH = height - AXIS_H - padTop;
  const x = (m: number) => GUTTER + (m / months) * (width - GUTTER - PAD_RIGHT);
  const y = (c: number) => padTop + plotH - (c / top) * plotH;

  const line = (key: 'balanceCents' | 'investedCents') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.month).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const area = (key: 'balanceCents' | 'investedCents') =>
    `${line(key)} L${x(months).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const reveal = useAnimatedProps(() => ({ width: Math.max(0.01, (width - GUTTER - PAD_RIGHT) * draw.value) }));
  const marks = [0, Math.round(months / 2), months];
  const label = (m: number) => (m === 0 ? 'hoje' : m % 12 === 0 ? `${m / 12} ano${m / 12 > 1 ? 's' : ''}` : `${m}m`);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 1 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="growthTotal" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.income} stopOpacity={0.5} />
              <Stop offset="100%" stopColor={t.income} stopOpacity={0.04} />
            </LinearGradient>
            <LinearGradient id="growthIn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={t.primary} stopOpacity={0.45} />
              <Stop offset="100%" stopColor={t.primary} stopOpacity={0.1} />
            </LinearGradient>
            <ClipPath id="growthClip">
              <ARect x={GUTTER} y={0} height={height} animatedProps={reveal} />
            </ClipPath>
          </Defs>
          <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} t={t} />
          <G clipPath="url(#growthClip)">
            <Path d={area('balanceCents')} fill="url(#growthTotal)" />
            <Path d={area('investedCents')} fill="url(#growthIn)" />
            <Path d={line('balanceCents')} stroke={t.income} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
            <Path d={line('investedCents')} stroke={t.primary} strokeWidth={2} fill="none" strokeDasharray="5 4" />
          </G>
          <Circle cx={x(months)} cy={y(last.balanceCents)} r={4.5} fill={t.income} stroke={t.bg} strokeWidth={2} />
          {marks.map((m, i) => (
            <SvgText
              key={m}
              x={x(m)}
              y={height - 5}
              textAnchor={i === 0 ? 'start' : i === marks.length - 1 ? 'end' : 'middle'}
              fontSize={10.5}
              fontWeight="600"
              fontFamily={FONT}
              fill={t.faint}>
              {label(m)}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

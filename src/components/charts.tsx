import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { DayPoint, SeriesPoint } from '@/engine/budget';
import { monthLabel } from '@/engine/dates';
import { formatBRL, formatBRLShort } from '@/engine/money';
import { fonts, glassShadow, useTheme, type Theme } from '@/theme';
import { Txt } from './ui';

/*
 * Gráficos em SVG puro (react-native-svg), sem biblioteca de charts: são
 * poucos elementos e o desenho é barato. As animações usam animatedProps do
 * Reanimated, que atualiza o SVG na thread de UI — a rolagem não engasga.
 *
 * Três regras valem para todos:
 *  1. Linhas de referência com o valor à esquerda. Sem elas a pessoa vê a
 *     forma mas não sabe a ordem de grandeza, e o gráfico vira enfeite.
 *  2. Curva suave, mas honesta: a interpolação é monotônica, então a linha
 *     nunca "passa do ponto" inventando um pico que não existe nos dados.
 *  3. Tocou, mostrou: arrastar o dedo sobre o gráfico abre um balão com o
 *     valor exato daquele ponto.
 */

const EASE = Easing.out(Easing.cubic);

const ACircle = Animated.createAnimatedComponent(Circle);
const APath = Animated.createAnimatedComponent(Path);
const ARect = Animated.createAnimatedComponent(Rect);

/** Espaço mínimo à esquerda para os valores do eixo. */
const MIN_GUTTER = 36;

/**
 * Espaço à esquerda que os valores do eixo precisam de verdade. "300 mil"
 * é mais largo que "6 mil": com folga fixa, o rótulo maior saía pela borda.
 */
function gutterFor(ticks: number[]): number {
  const longest = Math.max(...ticks.map((v) => axisLabel(v).length));
  return Math.max(MIN_GUTTER, Math.ceil(longest * 5.7) + 12);
}
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

/** Valor para o balão: inteiro quando cabe, abreviado quando passa de 1 milhão. */
const tipMoney = (cents: number) => (Math.abs(cents) >= 100_000_000 ? formatBRLShort(cents) : formatBRL(cents));

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

interface XY {
  x: number;
  y: number;
}

/**
 * Curva suave que passa por todos os pontos sem ultrapassar nenhum
 * (interpolação cúbica monotônica, Fritsch–Carlson). Importa aqui porque os
 * dados são acumulados: uma spline comum faria a linha descer entre dois
 * dias, e gasto acumulado não desce.
 */
export function smoothPath(pts: XY[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${f(p.x)},${f(p.y)}`).join(' ');

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x || 1e-6;
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const tan: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tan[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  tan[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tan[i] = 0;
      tan[i + 1] = 0;
      continue;
    }
    const a = tan[i] / slope[i];
    const b = tan[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tan[i] = (3 / h) * a * slope[i];
      tan[i + 1] = (3 / h) * b * slope[i];
    }
  }
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3;
    d += ` C${f(pts[i].x + third)},${f(pts[i].y + tan[i] * third)} ${f(pts[i + 1].x - third)},${f(pts[i + 1].y - tan[i + 1] * third)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

/** Identificador único para degradês e recortes: no navegador os ids são globais. */
function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Linhas de referência + valores à esquerda, comuns aos gráficos de área e barra. */
function Grid({ ticks, top, plotTop, plotH, width, gutter, t }: { ticks: number[]; top: number; plotTop: number; plotH: number; width: number; gutter: number; t: Theme }) {
  return (
    <G>
      {ticks.map((value) => {
        const y = plotTop + plotH - (value / top) * plotH;
        return (
          <G key={value}>
            <Line
              x1={gutter}
              y1={y}
              x2={width - PAD_RIGHT}
              y2={y}
              stroke={t.border}
              strokeWidth={1}
              strokeDasharray={value === 0 ? undefined : '2 6'}
              opacity={value === 0 ? 1 : 0.8}
            />
            <SvgText x={gutter - 7} y={y + 3.5} textAnchor="end" fontSize={9.5} fontFamily={fonts.semi} fill={t.faint}>
              {axisLabel(value)}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}

/**
 * Comprimento "por cima" de uma curva: soma dos deslocamentos em x e em y.
 * Como a curva é monotônica, o comprimento real nunca passa disso — e é o
 * que o traço precisa para a linha começar 100% escondida e terminar 100%
 * à mostra.
 */
function dashLength(pts: XY[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
  return Math.max(1, Math.ceil(total));
}

/**
 * Linha com brilho que se desenha da esquerda para a direita: a mesma curva
 * três vezes, da mais grossa e transparente à mais fina e sólida. Dá o
 * efeito de néon sem filtro de desfoque, que é caro e não existe em todo
 * aparelho.
 *
 * A animação é pelo traço (`strokeDashoffset`), e não por recorte: recorte
 * animado (ClipPath) funciona no navegador mas não atualiza no celular, e a
 * linha ficava escondida para sempre.
 */
function GlowLine({ d, length, draw, color, width = 3 }: { d: string; length: number; draw: SharedValue<number>; color: string; width?: number }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - draw.value) }));
  const common = { d, stroke: color, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: length, animatedProps: props } as const;
  return (
    <G>
      <APath {...common} strokeWidth={width + 9} opacity={0.1} />
      <APath {...common} strokeWidth={width + 4} opacity={0.18} />
      <APath {...common} strokeWidth={width} />
    </G>
  );
}

/** Ponto que pulsa no fim da linha: "você está aqui". */
function PulseDot({ cx, cy, color, ring }: { cx: number; cy: number; color: string; ring: string }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  const halo = useAnimatedProps(() => ({ r: 5 + pulse.value * 11, opacity: 0.38 * (1 - pulse.value) }));
  return (
    <G>
      <ACircle cx={cx} cy={cy} fill={color} animatedProps={halo} />
      <Circle cx={cx} cy={cy} r={5.5} fill={color} stroke={ring} strokeWidth={2.5} />
    </G>
  );
}

/**
 * Toque sobre o gráfico. Uma camada transparente por cima do SVG recebe o
 * dedo: como ela não tem filhos, a posição do toque já vem relativa ao
 * gráfico, igual no celular e no navegador. O balão some sozinho um tempo
 * depois de soltar.
 */
function useScrub(pick: (x: number) => number | null) {
  const [index, setIndex] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const move = (x: number) => {
    if (timer.current) clearTimeout(timer.current);
    const next = pick(x);
    setIndex((prev) => (prev === next ? prev : next));
  };
  const end = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIndex(null), 2600);
  };
  const layer = (
    <View
      style={StyleSheet.absoluteFill}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={(e) => move(e.nativeEvent.locationX)}
      onResponderMove={(e) => move(e.nativeEvent.locationX)}
      onResponderRelease={end}
      onResponderTerminate={end}
    />
  );
  return { index, layer };
}

const TIP_W = 176;

/**
 * Balão com os valores do ponto tocado. Fica à esquerda do dedo: os gráficos
 * de linha daqui são acumulados (só sobem), então o canto de cima à esquerda
 * está sempre vazio. Quando o toque é perto da borda e não sobra espaço à
 * esquerda, o balão sobe para cima do gráfico em vez de cobrir a linha.
 */
function Balloon({ x, width, height, plotTop, title, rows }: { x: number; width: number; height: number; plotTop: number; title: string; rows: { label: string; value: string; color?: string }[] }) {
  const t = useTheme();
  const fitsLeft = x - TIP_W - 10 >= 0;
  const left = fitsLeft ? x - TIP_W - 10 : Math.max(0, Math.min(width - TIP_W, x - TIP_W / 2));
  const vertical = fitsLeft ? { top: 0 } : { bottom: height - plotTop + 4 };
  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', ...vertical, left, width: TIP_W, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 3, backgroundColor: t.tooltipBg },
        glassShadow(t, 0.6),
      ]}>
      <Txt color={t.tooltipMuted} style={{ fontSize: 10.5, lineHeight: 14, fontWeight: '700' }}>{title}</Txt>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {r.color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: r.color }} /> : null}
          <Txt color={t.tooltipMuted} style={{ fontSize: 11, lineHeight: 15, flex: 1 }} numberOfLines={1}>{r.label}</Txt>
          <Txt color={t.tooltipText} style={{ fontSize: 11.5, lineHeight: 15, fontWeight: '800' }}>{r.value}</Txt>
        </View>
      ))}
    </View>
  );
}

/** Linha vertical + ponto marcando o lugar tocado. */
function Crosshair({ x, y, top, bottom, color, t }: { x: number; y: number; top: number; bottom: number; color: string; t: Theme }) {
  return (
    <G>
      <Line x1={x} y1={top} x2={x} y2={bottom} stroke={t.text} strokeWidth={1} strokeDasharray="3 4" opacity={0.45} />
      <Circle cx={x} cy={y} r={9} fill={color} opacity={0.22} />
      <Circle cx={x} cy={y} r={5} fill={color} stroke={t.bg} strokeWidth={2} />
    </G>
  );
}

// ------------------------------------------------------------------- rosca

export interface Slice {
  value: number;
  color: string;
}

/** Rosca. As fatias entram em sequência, e o miolo é texto de verdade (mesma fonte do app). */
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
  /** Mantido por compatibilidade; o tamanho do miolo agora é calculado. */
  centerSize?: number;
}) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((a, s) => a + s.value, 0);
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 950, easing: EASE });
  }, [total, slices.length, grow]);

  const arcs = slices.reduce<{ color: string; len: number; at: number }[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    const len = total > 0 ? (s.value / total) * circumference : 0;
    return [...acc, { color: s.color, len, at: prev ? prev.at + prev.len : 0 }];
  }, []);

  // O texto do miolo tem de caber no buraco da rosca, senão encosta no anel.
  const hole = (r - thickness / 2) * 2;
  const centerFont = center ? Math.min(size * 0.2, (hole * 0.86) / (center.length * 0.6)) : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={thickness} fill="none" opacity={0.45} />
          {arcs.map((a, i) => (
            <Arc key={i} cx={size / 2} cy={size / 2} r={r} thickness={thickness} color={a.color} len={a.len} at={a.at} circumference={circumference} grow={grow} single={arcs.length <= 2} />
          ))}
        </G>
        {/* anel fino por dentro: separa o miolo do anel colorido */}
        <Circle cx={size / 2} cy={size / 2} r={r - thickness / 2 - 4} stroke={t.border} strokeWidth={1} fill="none" opacity={0.7} />
      </Svg>
      {center ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Txt color={t.textStrong} style={{ fontSize: centerFont, lineHeight: centerFont * 1.2, fontWeight: '800', letterSpacing: -0.5 }}>{center}</Txt>
          {sub ? <Txt variant="small" style={{ fontSize: Math.max(9.5, size * 0.085), lineHeight: size * 0.12, fontWeight: '600' }}>{sub}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}

function Arc({
  cx, cy, r, thickness, color, len, at, circumference, grow, single,
}: {
  cx: number; cy: number; r: number; thickness: number; color: string;
  len: number; at: number; circumference: number; grow: SharedValue<number>; single: boolean;
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

// ------------------------------------------------------------------ anéis

/**
 * Anel de progresso. Passou de 100%? A sobra vira uma segunda volta mais
 * escura por cima, para ficar claro que não é "cheio", é "estourado".
 */
export function Ring({
  ratio,
  color,
  overColor,
  size = 76,
  thickness = 9,
  delay = 0,
  children,
}: {
  ratio: number;
  color: string;
  overColor?: string;
  size?: number;
  thickness?: number;
  delay?: number;
  children?: ReactNode;
}) {
  const t = useTheme();
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const main = Math.max(0, Math.min(1, ratio));
  const extra = overColor ? Math.max(0, Math.min(1, ratio - 1)) : 0;
  const grow = useSharedValue(0);
  useEffect(() => {
    grow.value = 0;
    grow.value = withDelay(delay, withTiming(1, { duration: 900, easing: EASE }));
  }, [ratio, delay, grow]);

  const mainProps = useAnimatedProps(() => ({ strokeDasharray: [circumference * main * grow.value, circumference] as unknown as string }));
  const extraProps = useAnimatedProps(() => ({ strokeDasharray: [circumference * extra * grow.value, circumference] as unknown as string }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={thickness} fill="none" opacity={0.6} />
          <ACircle cx={size / 2} cy={size / 2} r={r} stroke={extra > 0 && overColor ? overColor : color} strokeWidth={thickness} strokeLinecap="round" fill="none" opacity={extra > 0 ? 0.45 : 1} animatedProps={mainProps} />
          {extra > 0 && overColor ? (
            <ACircle cx={size / 2} cy={size / 2} r={r} stroke={overColor} strokeWidth={thickness} strokeLinecap="round" fill="none" animatedProps={extraProps} />
          ) : null}
        </G>
      </Svg>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>{children}</View>
    </View>
  );
}

// ----------------------------------------------------------------- medidor

const GAUGE_START = 150;
const GAUGE_SWEEP = 240;

/**
 * Medidor em arco da nota de saúde, de 0 a 100. O arco tem um degradê fixo
 * do vermelho ao verde, e o que cresce é o trecho preenchido: assim a cor na
 * ponta já diz em que faixa a nota caiu.
 */
export function Gauge({ score, size = 210, thickness = 15, children }: { score: number; size?: number; thickness?: number; children?: ReactNode }) {
  const t = useTheme();
  const gid = useSvgId('gauge');
  const r = (size - thickness) / 2 - 3;
  const cx = size / 2;
  const cy = r + thickness / 2 + 3;
  const height = cy + r * Math.sin((30 * Math.PI) / 180) + thickness / 2 + 4;
  const length = (GAUGE_SWEEP / 360) * 2 * Math.PI * r;
  const target = Math.max(0, Math.min(1, score / 100));
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.value = 0;
    grow.value = withDelay(120, withTiming(target, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [target, grow]);

  const at = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const a = at(GAUGE_START);
  const b = at(GAUGE_START + GAUGE_SWEEP);
  const d = `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${r},${r} 0 1 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;

  const fill = useAnimatedProps(() => ({ strokeDasharray: [Math.max(0.01, length * grow.value), length * 2] as unknown as string }));
  const knob = useAnimatedProps(() => {
    const rad = ((GAUGE_START + GAUGE_SWEEP * grow.value) * Math.PI) / 180;
    return { cx: cx + r * Math.cos(rad), cy: cy + r * Math.sin(rad) };
  });
  const tipColor = target < 0.5 ? t.gauge[0] : target < 0.7 ? t.gauge[1] : t.gauge[2];

  return (
    <View style={{ width: size, height }}>
      <Svg width={size} height={height}>
        <Defs>
          <LinearGradient id={gid} x1={a.x} y1="0" x2={b.x} y2="0" gradientUnits="userSpaceOnUse">
            <Stop offset="0%" stopColor={t.gauge[0]} />
            <Stop offset="50%" stopColor={t.gauge[1]} />
            <Stop offset="100%" stopColor={t.gauge[2]} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke={t.border} strokeWidth={thickness} strokeLinecap="round" fill="none" />
        {/* marcas de 0, 25, 50, 75 e 100 por dentro do arco */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => {
          const rad = ((GAUGE_START + GAUGE_SWEEP * p) * Math.PI) / 180;
          const r1 = r - thickness / 2 - 5;
          const r2 = r1 - 5;
          return <Line key={p} x1={cx + r1 * Math.cos(rad)} y1={cy + r1 * Math.sin(rad)} x2={cx + r2 * Math.cos(rad)} y2={cy + r2 * Math.sin(rad)} stroke={t.faint} strokeWidth={1.5} strokeLinecap="round" />;
        })}
        <APath d={d} stroke={`url(#${gid})`} strokeWidth={thickness + 8} strokeLinecap="round" fill="none" opacity={0.16} animatedProps={fill} />
        <APath d={d} stroke={`url(#${gid})`} strokeWidth={thickness} strokeLinecap="round" fill="none" animatedProps={fill} />
        <ACircle r={thickness / 2 + 3} fill={t.bg} stroke={tipColor} strokeWidth={3.5} animatedProps={knob} />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: cy - r * 0.52, alignItems: 'center' }}>{children}</View>
    </View>
  );
}

// ------------------------------------------------------------ ritmo do mês

/**
 * Ritmo do mês: quanto você já gastou, dia a dia, contra o ritmo que caberia
 * no orçamento. A linha cheia acima da tracejada quer dizer "gastando rápido".
 *
 * Com `projectedCents`, a linha continua pontilhada de hoje até o último dia:
 * é onde o mês vai parar se nada mudar. A previsão vem do motor (custo fixo
 * que ainda vai vencer + gasto variável no ritmo atual), não de uma régua
 * esticada sobre a linha — esticar contaria o aluguel de novo todo dia.
 */
export function SpendingPace({
  points,
  totalDays,
  projectedCents,
  height = 216,
}: {
  points: DayPoint[];
  totalDays: number;
  projectedCents?: number | null;
  height?: number;
}) {
  const t = useTheme();
  const fillId = useSvgId('paceFill');
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);
  const last = points[points.length - 1];
  const ahead = !!last && last.cumulativeCents > last.paceCents;
  const lineColor = ahead ? t.over : t.ok;

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 1100, easing: EASE });
  }, [points.length, width, draw]);

  const padTop = 22;
  const plotH = height - AXIS_H - padTop;
  const budget = Math.round((last?.paceCents ?? 0) * (totalDays / Math.max(1, last?.day ?? 1)));
  // Só existe previsão se ainda falta mês pela frente; e ela nunca fica abaixo do que já foi gasto.
  const forecast =
    last && projectedCents != null && last.day < totalDays ? Math.max(projectedCents, last.cumulativeCents) : null;
  const forecastColor = forecast !== null && forecast > budget ? t.over : t.ok;
  const { top, ticks } = niceScale(Math.max(1, last?.cumulativeCents ?? 0, budget, forecast ?? 0));
  const gutter = gutterFor(ticks);
  const plotW = Math.max(1, width - gutter - PAD_RIGHT);

  const x = (day: number) => gutter + ((day - 1) / Math.max(1, totalDays - 1)) * plotW;
  const y = (cents: number) => padTop + plotH - (cents / top) * plotH;

  const xy = points.map((p) => ({ x: x(p.day), y: y(p.cumulativeCents) }));
  const line = smoothPath(xy);
  const length = dashLength(xy);
  const area = points.length ? `${line} L${x(last.day).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z` : '';

  const scrub = useScrub((px) => {
    if (!points.length) return null;
    const day = Math.round(((px - gutter) / plotW) * Math.max(1, totalDays - 1)) + 1;
    return Math.max(0, Math.min(points.length - 1, day - 1));
  });
  const hit = scrub.index !== null ? points[scrub.index] : null;

  // Primeiro e último rótulo encostam na borda se ficarem centrados.
  const days = [1, Math.round(totalDays / 2), totalDays];
  const anchorOf = (i: number): 'start' | 'end' | 'middle' => (i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle');

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 0 ? (
        <Animated.View entering={FadeIn.duration(350)} style={{ flex: 1 }}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={lineColor} stopOpacity={0.4} />
                <Stop offset="70%" stopColor={lineColor} stopOpacity={0.08} />
                <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} gutter={gutter} t={t} />
            {/* ritmo ideal: gastar o orçamento por igual até o fim do mês */}
            <Line x1={x(1)} y1={y(budget / totalDays)} x2={x(totalDays)} y2={y(budget)} stroke={t.muted} strokeWidth={1.5} strokeDasharray="6 5" opacity={0.75} />
            <Path d={area} fill={`url(#${fillId})`} />
            {forecast !== null ? (
              <G>
                {/* previsão: de hoje até o último dia, pontilhada */}
                <Line
                  x1={x(last.day)}
                  y1={y(last.cumulativeCents)}
                  x2={x(totalDays)}
                  y2={y(forecast)}
                  stroke={forecastColor}
                  strokeWidth={2.5}
                  strokeDasharray="1 7"
                  strokeLinecap="round"
                  opacity={0.9}
                />
                <Circle cx={x(totalDays)} cy={y(forecast)} r={5} fill={t.bg} stroke={forecastColor} strokeWidth={2.5} />
                <SvgText x={x(totalDays) - 9} y={y(forecast) - 9} textAnchor="end" fontSize={10.5} fontFamily={fonts.bold} fill={forecastColor}>
                  {`vai dar ${axisLabel(forecast)}`}
                </SvgText>
              </G>
            ) : null}
            <GlowLine d={line} length={length} draw={draw} color={lineColor} />
            {hit ? (
              <Crosshair x={x(hit.day)} y={y(hit.cumulativeCents)} top={padTop} bottom={padTop + plotH} color={lineColor} t={t} />
            ) : (
              <PulseDot cx={x(last.day)} cy={y(last.cumulativeCents)} color={lineColor} ring={t.bg} />
            )}
            {days.map((d, i) => (
              <SvgText key={d} x={x(d)} y={height - 5} textAnchor={anchorOf(i)} fontSize={10.5} fontFamily={fonts.semi} fill={t.faint}>
                {i === days.length - 1 ? `dia ${d}` : d}
              </SvgText>
            ))}
          </Svg>
          {scrub.layer}
          {hit ? (
            <Balloon
              x={x(hit.day)}
              width={width}
              height={height}
              plotTop={padTop}
              title={`Até o dia ${hit.day}`}
              rows={[
                { label: 'Gasto', value: tipMoney(hit.cumulativeCents), color: lineColor },
                { label: 'Ritmo', value: tipMoney(hit.paceCents), color: t.muted },
              ]}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------ entrou × saiu

/**
 * Receitas x despesas por mês. Um mês fica destacado e os demais em
 * meio-tom; tocar em outro mês troca o destaque (quem usa decide o que
 * mostrar com o mês escolhido, via `onSelect`).
 */
export function MonthlyBars({
  data,
  height = 196,
  selected,
  onSelect,
}: {
  data: SeriesPoint[];
  height?: number;
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  const t = useTheme();
  const inId = useSvgId('barIn');
  const outId = useSvgId('barOut');
  const [width, setWidth] = useState(0);
  const grow = useSharedValue(0);
  const { top, ticks } = niceScale(Math.max(1, ...data.flatMap((d) => [d.incomeCents, d.expenseCents])));
  const gutter = gutterFor(ticks);
  const padTop = 10;
  const plotH = height - AXIS_H - padTop;
  const slot = (width - gutter - PAD_RIGHT) / Math.max(1, data.length);
  const barW = Math.max(6, Math.min(16, slot * 0.3));
  const active = selected ?? data.length - 1;

  useEffect(() => {
    grow.value = 0;
    grow.value = withTiming(1, { duration: 850, easing: EASE });
  }, [data.length, top, grow]);

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={inId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={t.income} stopOpacity={1} />
                <Stop offset="100%" stopColor={t.income} stopOpacity={0.35} />
              </LinearGradient>
              <LinearGradient id={outId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={t.expense} stopOpacity={1} />
                <Stop offset="100%" stopColor={t.expense} stopOpacity={0.35} />
              </LinearGradient>
            </Defs>
            <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} gutter={gutter} t={t} />
            {data.map((d, i) => {
              const cx = gutter + slot * i + slot / 2;
              const current = i === active;
              const hi = (d.incomeCents / top) * plotH;
              const he = (d.expenseCents / top) * plotH;
              return (
                <G key={d.month} opacity={current ? 1 : 0.5}>
                  {current ? (
                    <Rect x={cx - slot / 2 + 2} y={padTop - 6} width={slot - 4} height={plotH + AXIS_H + 4} rx={10} fill={t.primary} opacity={0.1} />
                  ) : null}
                  <GrowBar x={cx - barW - 1.5} baseY={padTop + plotH} w={barW} h={hi} fill={`url(#${inId})`} grow={grow} />
                  <GrowBar x={cx + 1.5} baseY={padTop + plotH} w={barW} h={he} fill={`url(#${outId})`} grow={grow} />
                  <SvgText x={cx} y={height - 6} textAnchor="middle" fontSize={10.5} fontFamily={current ? fonts.black : fonts.semi} fill={current ? t.text : t.faint}>
                    {monthLabel(d.month, true).split('/')[0]}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
          {onSelect ? (
            <View
              style={StyleSheet.absoluteFill}
              onStartShouldSetResponder={() => true}
              onResponderRelease={(e) => {
                const i = Math.floor((e.nativeEvent.locationX - gutter) / slot);
                onSelect(Math.max(0, Math.min(data.length - 1, i)));
              }}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

function GrowBar({ x, baseY, w, h, fill, grow }: { x: number; baseY: number; w: number; h: number; fill: string; grow: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ y: baseY - h * grow.value, height: Math.max(0.01, h * grow.value) }));
  return <ARect x={x} width={w} rx={Math.min(6, w / 2)} fill={fill} animatedProps={props} />;
}

// --------------------------------------------------------------- evolução

/**
 * Evolução de um investimento: a área de baixo é o que você colocou do
 * bolso, a de cima é o que os juros renderam. O que faz a pessoa entender
 * juros compostos é justamente ver a faixa de cima abrindo com o tempo.
 */
export function GrowthChart({
  points,
  height = 214,
}: {
  points: { month: number; investedCents: number; balanceCents: number }[];
  height?: number;
}) {
  const t = useTheme();
  const totalId = useSvgId('growthTotal');
  const inId = useSvgId('growthIn');
  const [width, setWidth] = useState(0);
  const draw = useSharedValue(0);
  const last = points[points.length - 1];
  const { top, ticks } = niceScale(Math.max(1, last?.balanceCents ?? 1));
  const gutter = gutterFor(ticks);
  const months = Math.max(1, last?.month ?? 1);

  useEffect(() => {
    draw.value = 0;
    draw.value = withTiming(1, { duration: 1000, easing: EASE });
  }, [points.length, top, width, draw]);

  const padTop = 14;
  const plotH = height - AXIS_H - padTop;
  const plotW = Math.max(1, width - gutter - PAD_RIGHT);
  const x = (m: number) => gutter + (m / months) * plotW;
  const y = (c: number) => padTop + plotH - (c / top) * plotH;

  const xyOf = (key: 'balanceCents' | 'investedCents') => points.map((p) => ({ x: x(p.month), y: y(p[key]) }));
  const line = (key: 'balanceCents' | 'investedCents') => smoothPath(xyOf(key));
  const area = (key: 'balanceCents' | 'investedCents') =>
    `${line(key)} L${x(months).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;

  const marks = [0, Math.round(months / 2), months];
  const label = (m: number) => (m === 0 ? 'hoje' : m % 12 === 0 ? `${m / 12} ano${m / 12 > 1 ? 's' : ''}` : `${m}m`);
  const longLabel = (m: number) => {
    if (m === 0) return 'Hoje';
    const years = Math.floor(m / 12);
    const rest = m % 12;
    const parts = [years ? `${years} ano${years > 1 ? 's' : ''}` : '', rest ? `${rest} ${rest > 1 ? 'meses' : 'mês'}` : ''].filter(Boolean);
    return `Em ${parts.join(' e ')}`;
  };

  const scrub = useScrub((px) => {
    if (points.length < 2) return null;
    const m = ((px - gutter) / plotW) * months;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].month - m) < Math.abs(points[best].month - m)) best = i;
    return best;
  });
  const hit = scrub.index !== null ? points[scrub.index] : null;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && points.length > 1 ? (
        <Animated.View entering={FadeIn.duration(350)} style={{ flex: 1 }}>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={totalId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={t.income} stopOpacity={0.5} />
                <Stop offset="100%" stopColor={t.income} stopOpacity={0.03} />
              </LinearGradient>
              <LinearGradient id={inId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={t.primary} stopOpacity={0.5} />
                <Stop offset="100%" stopColor={t.primary} stopOpacity={0.1} />
              </LinearGradient>
            </Defs>
            <Grid ticks={ticks} top={top} plotTop={padTop} plotH={plotH} width={width} gutter={gutter} t={t} />
            <Path d={area('balanceCents')} fill={`url(#${totalId})`} />
            <Path d={area('investedCents')} fill={`url(#${inId})`} />
            <Path d={line('investedCents')} stroke={t.primary} strokeWidth={2} fill="none" strokeDasharray="5 4" />
            <GlowLine d={line('balanceCents')} length={dashLength(xyOf('balanceCents'))} draw={draw} color={t.income} width={2.8} />
            {hit ? (
              <>
                <Crosshair x={x(hit.month)} y={y(hit.balanceCents)} top={padTop} bottom={padTop + plotH} color={t.income} t={t} />
                <Circle cx={x(hit.month)} cy={y(hit.investedCents)} r={4} fill={t.primary} stroke={t.bg} strokeWidth={2} />
              </>
            ) : (
              <PulseDot cx={x(months)} cy={y(last.balanceCents)} color={t.income} ring={t.bg} />
            )}
            {marks.map((m, i) => (
              <SvgText key={m} x={x(m)} y={height - 5} textAnchor={i === 0 ? 'start' : i === marks.length - 1 ? 'end' : 'middle'} fontSize={10.5} fontFamily={fonts.semi} fill={t.faint}>
                {label(m)}
              </SvgText>
            ))}
          </Svg>
          {scrub.layer}
          {hit ? (
            <Balloon
              x={x(hit.month)}
              width={width}
              height={height}
              plotTop={padTop}
              title={longLabel(hit.month)}
              rows={[
                { label: 'Total', value: tipMoney(hit.balanceCents), color: t.income },
                { label: 'Colocou', value: tipMoney(hit.investedCents), color: t.primary },
                { label: 'Juros', value: tipMoney(hit.balanceCents - hit.investedCents) },
              ]}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

// -------------------------------------------------------------- minigráfico

/** Linha miúda de tendência, sem eixo: só a forma. Vai dentro de cartões. */
export function Sparkline({ values, color, width = 104, height = 40 }: { values: number[]; color: string; width?: number; height?: number }) {
  const fillId = useSvgId('spark');
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 5;
  const pts = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  }));
  const line = smoothPath(pts);
  const end = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line} L${end.x.toFixed(1)},${height} L${pts[0].x.toFixed(1)},${height} Z`} fill={`url(#${fillId})`} />
      <Path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={end.x} cy={end.y} r={3.2} fill={color} />
    </Svg>
  );
}

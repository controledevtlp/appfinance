import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { radius, useTheme } from '@/theme';

/*
 * Todas as animações daqui rodam na thread de UI (Reanimated), não na thread
 * de JavaScript: elas não travam a rolagem nem a digitação, e continuam lisas
 * enquanto o app recalcula o orçamento. Nada aqui anima quadro a quadro em JS.
 * O Reanimated também respeita "reduzir movimento" do sistema automaticamente.
 */

const DUR = 420;
const EASE = Easing.out(Easing.cubic);

/** Entrada suave de um bloco. `index` escalona a entrada dos cartões da tela. */
export function Appear({
  children,
  index = 0,
  style,
}: {
  children: ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      // Animação declarativa: acontece uma vez, na montagem, sem estado em JS.
      entering={FadeInDown.delay(Math.min(index, 8) * 45)
        .duration(DUR)
        .easing(EASE)}
      layout={LinearTransition.duration(220)}
      style={style}>
      {children}
    </Animated.View>
  );
}

/** Conteúdo que aparece/some (ex.: o plano dentro de uma dica). */
export function Reveal({ children }: { children: ReactNode }) {
  return <Animated.View entering={FadeIn.duration(180)}>{children}</Animated.View>;
}

/** Container que anima a própria altura quando o conteúdo muda. */
export function Morph({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View layout={LinearTransition.duration(240).easing(EASE)} style={style}>
      {children}
    </Animated.View>
  );
}

/*
 * Chaves que posicionam o elemento no pai. Elas precisam ficar no contêiner
 * externo (o que anima), senão uma largura em porcentagem é calculada contra
 * um pai que se ajusta ao conteúdo e a grade colapsa.
 */
const LAYOUT_KEYS = [
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'position', 'top', 'bottom', 'left', 'right',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
] as const;

/** Toque com resposta tátil: afunda levemente ao pressionar. */
export function Press({
  children,
  style,
  scaleTo = 0.975,
  ...props
}: PressableProps & { children: ReactNode; style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    if ((LAYOUT_KEYS as readonly string[]).includes(k)) outer[k] = v;
    else inner[k] = v;
  }
  // O botão preenche o contêiner, para que fundo e borda acompanhem o tamanho.
  if (outer.width !== undefined) inner.width = '100%';
  if (outer.height !== undefined) inner.height = '100%';

  return (
    <Animated.View style={[outer as ViewStyle, animated]}>
      <Pressable
        {...props}
        onPressIn={(e) => {
          scale.value = withTiming(scaleTo, { duration: 90 });
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 18, stiffness: 260 });
          props.onPressOut?.(e);
        }}
        style={inner as ViewStyle}>
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Barra de progresso que cresce até o valor. `markerAt` desenha o traço do
 * ideal (1 = o limite da categoria). Barras acima de 100% reescalam para que
 * o traço do ideal continue visível.
 */
export function Bar({
  ratio,
  color,
  markerAt,
  height = 8,
  delay = 0,
}: {
  ratio: number;
  color: string;
  markerAt?: number;
  height?: number;
  delay?: number;
}) {
  const t = useTheme();
  const scale = Math.max(1, ratio, markerAt ?? 0);
  const target = Math.min(1, Math.max(0, ratio / scale));
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(target, { duration: 700, easing: EASE }));
  }, [target, delay, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Animated.View style={{ height, backgroundColor: t.border, borderRadius: height }}>
      <Animated.View style={[{ height, backgroundColor: color, borderRadius: height }, fill]} />
      {markerAt !== undefined ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: `${Math.min(100, (markerAt / scale) * 100)}%`,
            top: -3,
            width: 2,
            height: height + 6,
            borderRadius: 1,
            backgroundColor: t.text,
            opacity: 0.5,
          }}
        />
      ) : null}
    </Animated.View>
  );
}

/** Pílula que destaca um número com fundo suave. */
export function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
      {children}
    </Animated.View>
  );
}

export { Animated };

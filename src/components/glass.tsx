import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { glassShadow, radius, useTheme } from '@/theme';

/*
 * Peças do visual de vidro.
 *
 * O fundo é um degradê com brilhos coloridos difusos desenhados em SVG
 * (gradiente radial). Isso dá o "borrão" bonito sem custo de desfoque real:
 * é um elemento só, desenhado uma vez, e não pesa na rolagem.
 */

/*
 * Quem já tem fundo desenhado por cima (o grupo de abas desenha uma vez só)
 * avisa pelos filhos, para a tela não empilhar um segundo degradê. Dois
 * fundos iguais em cima do outro fazem a troca de aba "piscar".
 */
const HasBackdrop = createContext(false);

export function BackdropProvider({ children }: { children: ReactNode }) {
  return (
    <HasBackdrop.Provider value={true}>
      <Backdrop />
      {children}
    </HasBackdrop.Provider>
  );
}

export const useHasBackdrop = () => useContext(HasBackdrop);

/** Fundo da tela: degradê + brilhos. Fica atrás de tudo. */
export function Backdrop() {
  const t = useTheme();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[t.bgFrom, t.bgTo]} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          {t.glow.map(([color], i) => (
            <RadialGradient key={i} id={`glow${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={color} stopOpacity={0.36} />
              <Stop offset="55%" stopColor={color} stopOpacity={0.11} />
              <Stop offset="100%" stopColor={color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {t.glow.map(([, x, y, r], i) => (
          <Ellipse key={i} cx={`${x}%`} cy={`${y}%`} rx={`${r}%`} ry={`${r * 0.8}%`} fill={`url(#glow${i})`} />
        ))}
        <Rect width="100%" height="100%" fill="transparent" />
      </Svg>
    </View>
  );
}

/**
 * Cartão de vidro: camada translúcida, borda clara e um brilho no topo.
 * Sem desfoque de verdade — o fundo já é suave, então a leitura é a mesma e
 * a rolagem continua lisa mesmo com muitos cartões na tela.
 */
export function Glass({
  children,
  style,
  strength = 1,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: number;
  /** Cor de destaque para o cartão (usado no cartão principal). */
  tone?: [string, string];
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: t.cardBorder,
          backgroundColor: tone ? undefined : t.card,
          overflow: 'hidden',
        },
        glassShadow(t, strength),
        style,
      ]}>
      {tone ? <LinearGradient colors={tone} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {/* Cartão de destaque ganha dois discos translúcidos no canto: dão
          profundidade ao degradê sem custar nada (são duas Views). */}
      {tone ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={{ position: 'absolute', right: -70, top: -90, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          <View style={{ position: 'absolute', right: -20, top: -120, width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ position: 'absolute', left: -60, bottom: -110, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,0,0,0.08)' }} />
        </View>
      ) : null}
      {/* brilho de vidro na borda de cima */}
      <LinearGradient
        colors={[t.cardShine, 'transparent']}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 60 }}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

/** Desfoque de verdade: usado só na barra de navegação, que é um elemento só. */
export function GlassBar({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <BlurView intensity={40} tint={t.blurTint} experimentalBlurMethod="dimezisBlurView" style={[{ overflow: 'hidden' }, style]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.tabBar }]} />
      {children}
    </BlurView>
  );
}

/** Pílula com degradê, para destaques e botões principais. */
export function GradientPill({
  children,
  style,
  colors,
  radius: r = radius.pill,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: [string, string];
  radius?: number;
}) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={colors ?? [t.primaryFrom, t.primaryTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: r, overflow: 'hidden' }, style]}>
      {children}
    </LinearGradient>
  );
}

import { useColorScheme, type TextStyle } from 'react-native';

/*
 * Visual "glassmorphism" em verde-sálvia sobre carvão.
 *
 * O acento é um verde acinzentado e calmo, usado em pontos — pílula ativa,
 * quadradinho de ícone, cartão de saldo —, não espalhado pela tela inteira.
 * Os brilhos do fundo são discretos de propósito: a referência é quase lisa,
 * e o que dá profundidade é o degradê dos cartões, não o fundo.
 *
 * O truque de desempenho: em vez de desfocar cada cartão (caro, principalmente
 * no Android), o fundo já é suave — brilhos em degradê radial via SVG — e os
 * cartões são só uma camada translúcida com uma borda clara de 1px. A leitura
 * é de vidro, e o custo é de uma View comum. Desfoque de verdade fica só na
 * barra de navegação, que é um elemento só.
 */

const light = {
  /** Cor sólida de fallback (atrás do degradê, e onde um sólido é necessário). */
  bg: '#F2F5F2',
  // Fundo: degradê de cima para baixo, mais os brilhos de `glow`.
  bgFrom: '#F4F7F4',
  bgTo: '#E8EFE9',
  /** Brilhos difusos do fundo: [cor, x%, y%, raio%]. Discretos de propósito. */
  glow: [
    ['#7FB399', 12, 6, 58],
    ['#A9CDB8', 92, 30, 48],
    ['#C9DDD0', 75, 90, 52],
  ] as [string, number, number, number][],

  // Vidro
  card: 'rgba(255,255,255,0.84)',
  cardBorder: 'rgba(255,255,255,0.95)',
  cardShine: 'rgba(255,255,255,0.6)',
  shadow: '#1B2A22',
  shadowOpacity: 0.09,

  text: '#16241D',
  textStrong: '#0C1711',
  muted: '#5E6E66',
  faint: 'rgba(22,36,29,0.42)',
  border: 'rgba(22,36,29,0.1)',
  fieldBg: 'rgba(255,255,255,0.7)',

  primary: '#2F6B52',
  primaryFrom: '#3C7A5E',
  primaryTo: '#63A382',
  primaryText: '#FFFFFF',
  soft: 'rgba(47,107,82,0.12)',
  /** Quadradinho de ícone: preenchimento sálvia com ícone escuro. */
  badgeBg: '#CBE2D5',
  badgeIcon: '#204436',
  /** Degradê do cartão em destaque (saldo). */
  heroFrom: '#2C5A46',
  heroTo: '#74AE8E',
  heroText: '#FFFFFF',

  income: '#1E7A52',
  expense: '#C2563F',
  ok: '#1E7A52',
  warning: '#95671C',
  over: '#C2563F',
  info: '#2A6E8A',

  necessidades: '#2F6B52',
  desejos: '#95671C',
  poupanca: '#2A6E8A',
  chart: ['#2F6B52', '#C98A4B', '#3F8FA8', '#B06A77', '#7E9455', '#7C8A83'],
  tabBar: 'rgba(255,255,255,0.74)',
  blurTint: 'light' as 'light' | 'dark',
  /** Faixa que protege a barra de status quando o conteúdo rola por baixo. */
  scrim: 'rgba(244,247,244,0.96)',
  /** Balão de valor que aparece ao tocar num gráfico. */
  tooltipBg: '#16241D',
  tooltipText: '#FFFFFF',
  tooltipMuted: 'rgba(255,255,255,0.66)',
  /** Degradê do medidor de saúde: do ruim ao bom. */
  gauge: ['#C2563F', '#C98A2B', '#2F8F63'] as [string, string, string],
};

const dark: typeof light = {
  bg: '#0D100E',
  bgFrom: '#0D100E',
  bgTo: '#141A17',
  // Quase nenhum brilho: a referência é calma, não é um fundo colorido.
  glow: [
    ['#5E8F74', 14, 4, 60],
    ['#2E6B55', 94, 34, 46],
    ['#1F4738', 72, 94, 55],
  ],

  card: 'rgba(255,255,255,0.055)',
  cardBorder: 'rgba(255,255,255,0.1)',
  cardShine: 'rgba(168,205,181,0.08)',
  shadow: '#000000',
  shadowOpacity: 0.5,

  text: '#E4EBE6',
  textStrong: '#FFFFFF',
  muted: '#8E9A93',
  faint: 'rgba(228,235,230,0.4)',
  border: 'rgba(255,255,255,0.1)',
  fieldBg: 'rgba(255,255,255,0.05)',

  primary: '#A3CDB5',
  primaryFrom: '#9CC7AD',
  primaryTo: '#C2DCCC',
  primaryText: '#10201A',
  soft: 'rgba(163,205,181,0.14)',
  badgeBg: '#A3CDB5',
  badgeIcon: '#14271E',
  heroFrom: '#22332B',
  heroTo: '#5C8D74',
  heroText: '#FFFFFF',

  income: '#5FD39B',
  expense: '#E8836F',
  ok: '#5FD39B',
  warning: '#E0B470',
  over: '#E8836F',
  info: '#7FB8CF',

  necessidades: '#A3CDB5',
  desejos: '#E0B470',
  poupanca: '#7FB8CF',
  chart: ['#A3CDB5', '#E0B06F', '#7FB8CF', '#D5909B', '#A9BC84', '#8E9A93'],
  tabBar: 'rgba(16,21,18,0.74)',
  blurTint: 'dark',
  scrim: 'rgba(13,16,14,0.96)',
  tooltipBg: '#EEF4F0',
  tooltipText: '#0F1A15',
  tooltipMuted: 'rgba(15,26,21,0.62)',
  gauge: ['#E8836F', '#E0B470', '#5FD39B'],
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 10, md: 16, lg: 24, xl: 30, pill: 999 };

/** Sombra suave, igual nas duas plataformas. */
export const glassShadow = (t: Theme, strength = 1) => ({
  shadowColor: t.shadow,
  shadowOpacity: t.shadowOpacity * strength,
  shadowRadius: 22 * strength,
  shadowOffset: { width: 0, height: 10 * strength },
  elevation: 8 * strength,
});

/*
 * Tipografia: Plus Jakarta Sans, carregada no layout raiz.
 *
 * Cada peso é um arquivo de fonte próprio. Por isso o peso entra pelo nome da
 * família, e `fontWeight` vai sempre como 'normal': pedir negrito em cima de
 * um arquivo que já é negrito faz o Android (e o navegador) engrossar a letra
 * de novo, e o texto fica borrado.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  black: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Família certa para um peso ("700", 700, "bold"...). */
export function fontFamilyFor(weight?: TextStyle['fontWeight']): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : Number(weight);
  if (w >= 800) return fonts.black;
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semi;
  if (w >= 500) return fonts.medium;
  return fonts.regular;
}

/** Estilo de fonte pronto para espalhar num `style`: `{...font('700')}`. */
export function font(weight?: TextStyle['fontWeight']): TextStyle {
  return { fontFamily: fontFamilyFor(weight), fontWeight: 'normal' };
}

/** Troca `fontWeight` por família em um estilo qualquer já achatado. */
export function withFont<T extends TextStyle>(style: T): T {
  if (style.fontFamily) return style;
  return { ...style, ...font(style.fontWeight) };
}

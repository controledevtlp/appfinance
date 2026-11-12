import { useColorScheme } from 'react-native';

/*
 * Visual "glassmorphism": fundo com brilhos coloridos difusos e cartões de
 * vidro translúcido por cima.
 *
 * O truque de desempenho: em vez de desfocar cada cartão (caro, principalmente
 * no Android), o fundo já é suave — brilhos em degradê radial via SVG — e os
 * cartões são só uma camada translúcida com uma borda clara de 1px. A leitura
 * é de vidro, e o custo é de uma View comum. Desfoque de verdade fica só na
 * barra de navegação, que é um elemento só.
 */

const light = {
  // Fundo: degradê de cima para baixo, mais os brilhos de `glow`.
  /** Cor sólida de fallback (atrás do degradê, e onde um sólido é necessário). */
  bg: '#F1F0FA',
  bgFrom: '#F4F3FB',
  bgTo: '#E9EEFB',
  /** Brilhos difusos do fundo: [cor, x%, y%, raio%]. */
  glow: [
    ['#8B7DFF', 12, 8, 62],
    ['#4FC9D6', 92, 26, 50],
    ['#FF8FB1', 78, 88, 55],
  ] as [string, number, number, number][],

  // Vidro
  card: 'rgba(255,255,255,0.78)',
  cardBorder: 'rgba(255,255,255,0.9)',
  cardShine: 'rgba(255,255,255,0.55)',
  shadow: '#2A2458',
  shadowOpacity: 0.1,

  text: '#1A1733',
  textStrong: '#120F28',
  muted: '#67638A',
  faint: 'rgba(26,23,51,0.45)',
  border: 'rgba(26,23,51,0.1)',
  fieldBg: 'rgba(255,255,255,0.65)',

  primary: '#6246EA',
  primaryFrom: '#7C5CFF',
  primaryTo: '#B86BFF',
  primaryText: '#FFFFFF',
  soft: 'rgba(98,70,234,0.12)',

  income: '#0E8F63',
  expense: '#D92D55',
  ok: '#0E8F63',
  warning: '#B4690E',
  over: '#D92D55',
  info: '#1565C7',

  necessidades: '#6246EA',
  desejos: '#E08A1E',
  poupanca: '#108FB5',
  chart: ['#6246EA', '#E8833A', '#17A398', '#D6457F', '#2E8BD0', '#8B87A8'],
  tabBar: 'rgba(255,255,255,0.72)',
  blurTint: 'light' as 'light' | 'dark',
};

const dark: typeof light = {
  bg: '#0A0918',
  bgFrom: '#0A0918',
  bgTo: '#120F2B',
  glow: [
    ['#7C5CFF', 10, 6, 70],
    ['#2BD9C7', 95, 30, 55],
    ['#FF4F9A', 80, 92, 60],
  ],

  card: 'rgba(255,255,255,0.07)',
  cardBorder: 'rgba(255,255,255,0.14)',
  cardShine: 'rgba(255,255,255,0.10)',
  shadow: '#000000',
  shadowOpacity: 0.45,

  text: '#ECEAFB',
  textStrong: '#FFFFFF',
  muted: '#A6A1C7',
  faint: 'rgba(236,234,251,0.45)',
  border: 'rgba(255,255,255,0.12)',
  fieldBg: 'rgba(255,255,255,0.06)',

  primary: '#A78BFA',
  primaryFrom: '#8B6CFF',
  primaryTo: '#C77DFF',
  primaryText: '#120F28',
  soft: 'rgba(167,139,250,0.18)',

  income: '#34E3A4',
  expense: '#FF6B8A',
  ok: '#34E3A4',
  warning: '#FFC75A',
  over: '#FF6B8A',
  info: '#66C2FF',

  necessidades: '#A78BFA',
  desejos: '#FFC75A',
  poupanca: '#66C2FF',
  chart: ['#A78BFA', '#FFB36B', '#2BD9C7', '#FF7BB0', '#66C2FF', '#A9A5C4'],
  tabBar: 'rgba(18,15,43,0.72)',
  blurTint: 'dark',
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

import { useColorScheme } from 'react-native';

/*
 * Paleta índigo sobre neutro levemente arroxeado.
 *
 * Por que não branco puro nem preto puro: o contraste máximo cansa a vista em
 * uso longo. O fundo claro é um cinza-lavanda de baixa saturação e o escuro é
 * um carvão arroxeado, não preto — fica mais confortável e dá profundidade.
 * O índigo carrega a interface; verde e vermelho ficam reservados para
 * entrada e saída de dinheiro, onde a cor precisa significar alguma coisa.
 */

const light = {
  bg: '#F5F4FA',
  card: '#FFFFFF',
  text: '#1E1B2E',
  muted: '#6C6880',
  border: '#E6E3F0',
  primary: '#5A4FD6',
  primaryText: '#FFFFFF',
  soft: '#ECE9FB',
  income: '#0B7A52',
  expense: '#D12E4C',
  ok: '#0B7A52',
  warning: '#B45309',
  over: '#D12E4C',
  info: '#0369A1',
  necessidades: '#5A4FD6',
  desejos: '#D97706',
  poupanca: '#0E8FBF',
  /** Cores das fatias de gráfico, na ordem de uso. */
  chart: ['#5A4FD6', '#E8833A', '#1C9AA8', '#D1497E', '#7BA23F', '#8E8AA6'],
};

const dark: typeof light = {
  bg: '#13121C',
  card: '#1D1B2B',
  text: '#EAE7F5',
  muted: '#9D98B8',
  border: '#2F2C44',
  primary: '#9B8CFF',
  primaryText: '#1A1730',
  soft: '#272340',
  income: '#3DD598',
  expense: '#FF7A90',
  ok: '#3DD598',
  warning: '#F5B041',
  over: '#FF7A90',
  info: '#5FB8E8',
  necessidades: '#9B8CFF',
  desejos: '#F5B041',
  poupanca: '#5FB8E8',
  chart: ['#9B8CFF', '#F5A96B', '#4FC9D6', '#F07BAD', '#A8D16B', '#A9A5C4'],
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

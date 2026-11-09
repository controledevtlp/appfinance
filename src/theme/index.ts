import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F6F5',
  card: '#FFFFFF',
  text: '#0F1F1C',
  muted: '#5B6B67',
  border: '#E1E7E5',
  primary: '#0F766E',
  primaryText: '#FFFFFF',
  soft: '#E6F2F0',
  income: '#15803D',
  expense: '#B91C1C',
  ok: '#16A34A',
  warning: '#D97706',
  over: '#DC2626',
  info: '#2563EB',
  necessidades: '#0F766E',
  desejos: '#D97706',
  poupanca: '#2563EB',
};

const dark: typeof light = {
  bg: '#0B1412',
  card: '#14211E',
  text: '#E8F1EF',
  muted: '#93A8A3',
  border: '#24362F',
  primary: '#2DD4BF',
  primaryText: '#04201C',
  soft: '#17302B',
  income: '#4ADE80',
  expense: '#F87171',
  ok: '#4ADE80',
  warning: '#FBBF24',
  over: '#F87171',
  info: '#60A5FA',
  necessidades: '#2DD4BF',
  desejos: '#FBBF24',
  poupanca: '#60A5FA',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

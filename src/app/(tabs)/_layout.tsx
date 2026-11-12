import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassBar, GradientPill } from '@/components/glass';
import { Press } from '@/components/motion';
import { Txt, tap, type IconName } from '@/components/ui';
import { glassShadow, radius, useTheme } from '@/theme';

const TABS: { name: string; label: string; icon: IconName; active: IconName }[] = [
  { name: 'index', label: 'Painel', icon: 'pie-chart-outline', active: 'pie-chart' },
  { name: 'lancamentos', label: 'Gastos', icon: 'list-outline', active: 'list' },
  { name: 'orcamento', label: 'Limites', icon: 'wallet-outline', active: 'wallet' },
  { name: 'dicas', label: 'Dicas', icon: 'bulb-outline', active: 'bulb' },
  { name: 'ajustes', label: 'Ajustes', icon: 'settings-outline', active: 'settings' },
];

/**
 * Barra de navegação de vidro, flutuando sobre o conteúdo. A aba ativa ganha
 * uma pílula com degradê. É o único lugar com desfoque de verdade no app:
 * é um elemento só, então não pesa.
 */
/*
 * O contrato da barra no Expo Router: ele entrega `navigateToTab(routeKey)`
 * e os `insets`, não um objeto de navegação. Declaramos só o que usamos para
 * não depender de um pacote a mais.
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigateToTab: (routeKey: string) => void;
  insets?: { bottom: number };
}

function TabBar({ state, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
  const safe = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? safe.bottom;
  return (
    <View style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(bottomInset, 10) }} pointerEvents="box-none">
      <GlassBar style={[{ borderRadius: radius.pill, borderWidth: 1, borderColor: t.cardBorder }, glassShadow(t, 1.2)]}>
        <View style={{ flexDirection: 'row', padding: 7 }}>
          {state.routes.map((route, index) => {
            const meta = TABS.find((x) => x.name === route.name);
            if (!meta) return null;
            const focused = state.index === index;
            const onPress = () => {
              tap();
              navigateToTab(route.key);
            };
            const body = (
              <View style={{ alignItems: 'center', gap: 3, paddingVertical: 9, paddingHorizontal: 4 }}>
                <Ionicons name={focused ? meta.active : meta.icon} size={21} color={focused ? t.primaryText : t.muted} />
                <Txt variant="small" style={{ fontSize: 10.5, fontWeight: focused ? '800' : '600', color: focused ? t.primaryText : t.muted }}>
                  {meta.label}
                </Txt>
              </View>
            );
            return (
              <Press
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={meta.label}
                scaleTo={0.9}
                style={{ flex: 1 }}>
                {focused ? <GradientPill radius={radius.pill}>{body}</GradientPill> : body}
              </Press>
            );
          })}
        </View>
      </GlassBar>
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
      screenOptions={{
        headerTransparent: true,
        headerTintColor: t.textStrong,
        headerTitleStyle: { fontWeight: '800', fontSize: 19 },
        headerShadowVisible: false,
        headerStyle: { backgroundColor: 'transparent' },
        sceneStyle: { backgroundColor: 'transparent' },
        ...(Platform.OS === 'web' ? { headerShown: false } : {}),
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (name: IconName, focusedName: IconName) =>
  function TabIcon({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={focused ? focusedName : name} size={size} color={color as string} />;
  };

export default function TabLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Painel', tabBarIcon: icon('pie-chart-outline', 'pie-chart') }} />
      <Tabs.Screen name="lancamentos" options={{ title: 'Lançamentos', tabBarIcon: icon('list-outline', 'list') }} />
      <Tabs.Screen name="orcamento" options={{ title: 'Orçamento', tabBarIcon: icon('wallet-outline', 'wallet') }} />
      <Tabs.Screen name="dicas" options={{ title: 'Dicas', tabBarIcon: icon('bulb-outline', 'bulb') }} />
      <Tabs.Screen name="ajustes" options={{ title: 'Ajustes', tabBarIcon: icon('settings-outline', 'settings') }} />
    </Tabs>
  );
}

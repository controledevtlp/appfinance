import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackdropProvider, GlassBar, GradientPill } from '@/components/glass';
import { Press } from '@/components/motion';
import { tap, type IconName } from '@/components/ui';
import { glassShadow, radius, useTheme } from '@/theme';

const TABS: { name: string; label: string; icon: IconName; active: IconName }[] = [
  { name: 'index', label: 'Painel', icon: 'pie-chart-outline', active: 'pie-chart' },
  { name: 'lancamentos', label: 'Gastos', icon: 'list-outline', active: 'list' },
  { name: 'orcamento', label: 'Limites', icon: 'wallet-outline', active: 'wallet' },
  { name: 'dicas', label: 'Dicas', icon: 'bulb-outline', active: 'bulb' },
  { name: 'investir', label: 'Investir', icon: 'trending-up-outline', active: 'trending-up' },
  { name: 'ajustes', label: 'Ajustes', icon: 'settings-outline', active: 'settings' },
];

const PAD = 7;

/**
 * Um item da barra. A cor do ícone e do rótulo acompanha a pílula enquanto
 * ela desliza: se trocasse de uma vez, o texto ficaria escuro sobre fundo
 * escuro no meio do caminho, que era o que parecia travado.
 */
function TabItem({
  meta,
  index,
  slide,
  onPress,
  focused,
}: {
  meta: { label: string; icon: IconName; active: IconName };
  index: number;
  slide: SharedValue<number>;
  onPress: () => void;
  focused: boolean;
}) {
  const t = useTheme();
  // Distância da pílula até este item: 0 = ela chegou, 1 = está longe.
  const near = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(slide.value - index)) }));
  const far = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.abs(slide.value - index)) }));
  const labelColor = useAnimatedStyle(() => ({
    color: interpolateColor(Math.min(1, Math.abs(slide.value - index)), [0, 1], [t.primaryText, t.muted]),
  }));

  return (
    <Press
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={meta.label}
      scaleTo={0.92}
      style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 3, paddingVertical: 9, paddingHorizontal: 4 }}>
        {/* Dois ícones sobrepostos trocando de opacidade: animar a cor do
            ícone direto não funciona em todas as plataformas. */}
        <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center' }, far]}>
            <Ionicons name={meta.icon} size={21} color={t.muted} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center' }, near]}>
            <Ionicons name={meta.active} size={21} color={t.primaryText} />
          </Animated.View>
        </View>
        <Animated.Text style={[{ fontSize: 10.5, lineHeight: 15, fontWeight: focused ? '800' : '600' }, labelColor]}>
          {meta.label}
        </Animated.Text>
      </View>
    </Press>
  );
}

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

/**
 * Barra de vidro flutuante. A pílula do destaque é um elemento só, que
 * desliza até a aba tocada — em vez de sumir de um lugar e aparecer no
 * outro, que era o que dava a impressão de travado.
 */
function TabBar({ state, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
  const safe = useSafeAreaInsets();
  const bottomInset = insets?.bottom ?? safe.bottom;
  const [width, setWidth] = useState(0);

  const tabs = state.routes.map((r) => ({ route: r, meta: TABS.find((x) => x.name === r.name) })).filter((x) => x.meta);
  const slot = width > 0 ? (width - PAD * 2) / Math.max(1, tabs.length) : 0;
  const slide = useSharedValue(state.index);
  useEffect(() => {
    slide.value = withSpring(state.index, { damping: 18, stiffness: 180, mass: 0.6 });
  }, [state.index, slide]);

  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: slide.value * slot }] }));

  return (
    <View style={{ position: 'absolute', left: 14, right: 14, bottom: Math.max(bottomInset, 10) }} pointerEvents="box-none">
      <GlassBar style={[{ borderRadius: radius.pill, borderWidth: 1, borderColor: t.cardBorder }, glassShadow(t, 1.2)]}>
        <View style={{ flexDirection: 'row', padding: PAD }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {slot > 0 ? (
            <Animated.View style={[{ position: 'absolute', left: PAD, top: PAD, bottom: PAD, width: slot }, pill]}>
              <GradientPill radius={radius.pill} style={{ flex: 1 }}>
                <View style={{ flex: 1 }} />
              </GradientPill>
            </Animated.View>
          ) : null}

          {tabs.map(({ route, meta }, index) => (
            <TabItem
              key={route.key}
              meta={meta!}
              index={index}
              slide={slide}
              focused={state.index === index}
              onPress={() => {
                tap();
                navigateToTab(route.key);
              }}
            />
          ))}
        </View>
      </GlassBar>
    </View>
  );
}

export default function TabLayout() {
  const t = useTheme();
  return (
    // O fundo é desenhado uma vez só, aqui: fica parado enquanto o conteúdo
    // desliza, em vez de um degradê novo entrar junto com cada tela.
    <BackdropProvider>
      <Tabs
        tabBar={(props) => <TabBar {...(props as unknown as TabBarProps)} />}
        // As telas ficam montadas: assim os cartões não repetem a animação de
        // entrada toda vez que você volta para a aba.
        detachInactiveScreens={false}
        screenOptions={{
          // Sem isto a troca de aba é um corte seco: o padrão é 'none'.
          animation: 'shift',
          transitionSpec: { animation: 'timing', config: { duration: 220 } },
          headerTransparent: true,
          headerTintColor: t.textStrong,
          headerTitleStyle: { fontWeight: '800', fontSize: 19 },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          sceneStyle: { backgroundColor: 'transparent' },
        }}>
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
        ))}
      </Tabs>
    </BackdropProvider>
  );
}

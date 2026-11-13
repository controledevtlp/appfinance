import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { Backdrop } from '@/components/glass';
import { Button, Card, Txt } from '@/components/ui';
import { AppProvider, useApp } from '@/data/AppContext';
import { fonts, useTheme } from '@/theme';

function Gate() {
  const t = useTheme();
  const { ready, mode, session, error, signOut } = useApp();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Backdrop />
        <ActivityIndicator size="large" color={t.primary} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Backdrop />
        <Card>
          <Txt variant="h2">Algo deu errado</Txt>
          <Txt variant="muted">{error}</Txt>
          <Txt variant="small">Se for a primeira vez com o Supabase, confirme que o arquivo supabase/schema.sql foi executado no SQL Editor.</Txt>
          {mode === 'cloud' && session ? <Button title="Sair" variant="ghost" onPress={signOut} /> : null}
        </Card>
      </View>
    );
  }

  const needsLogin = mode === 'cloud' && !session;
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerTintColor: t.textStrong,
          headerTitleStyle: { fontFamily: fonts.black, fontSize: 18 },
          headerBackTitleStyle: { fontFamily: fonts.semi },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: 'transparent' },
          contentStyle: { backgroundColor: t.bg },
        }}>
        <Stack.Protected guard={needsLogin}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!needsLogin}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="transacao" options={{ presentation: 'modal', title: 'Lançamento' }} />
          <Stack.Screen name="importar" options={{ title: 'Importar extrato' }} />
          <Stack.Screen name="renda" options={{ title: 'Minha renda' }} />
          <Stack.Screen name="detalhe" options={{ title: 'Detalhe' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const t = useTheme();
  // A fonte do app. Enquanto ela não chega, a tela fica só com o fundo: melhor
  // do que mostrar tudo na fonte do sistema e trocar com o app já aberto. Se o
  // carregamento falhar, o app abre assim mesmo, com a fonte do aparelho.
  const [loaded, failed] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!loaded && !failed) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}

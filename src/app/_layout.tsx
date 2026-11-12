import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { Backdrop } from '@/components/glass';
import { Button, Card, Txt } from '@/components/ui';
import { AppProvider, useApp } from '@/data/AppContext';
import { useTheme } from '@/theme';

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
          headerTitleStyle: { fontWeight: '800', fontSize: 18 },
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
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}

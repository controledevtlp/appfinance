import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Button, Card, Chip, Field, Icon, Txt } from '@/components/ui';
import { supabase } from '@/data/supabase';
import { useTheme } from '@/theme';

export default function Login() {
  const t = useTheme();
  const [mode, setMode] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const submit = async () => {
    if (!supabase) return;
    if (!email.includes('@') || password.length < 6) {
      setMessage({ text: 'Informe um e-mail válido e uma senha de pelo menos 6 caracteres.', ok: false });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      if (mode === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setMessage({ text: error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message, ok: false });
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) setMessage({ text: error.message, ok: false });
        else if (!data.session) setMessage({ text: 'Conta criada! Confirme o e-mail que enviamos e depois entre.', ok: true });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wallet" size={32} color={t.primaryText} />
          </View>
          <Txt variant="title">Finanças Claras</Txt>
          <Txt variant="muted" style={{ textAlign: 'center' }}>Entenda para onde vai o seu dinheiro e quanto dá para economizar.</Txt>
        </View>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Entrar" selected={mode === 'entrar'} onPress={() => setMode('entrar')} />
            <Chip label="Criar conta" selected={mode === 'criar'} onPress={() => setMode('criar')} />
          </View>
          <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="voce@email.com" />
          <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="mínimo 6 caracteres" onSubmitEditing={submit} />
          {message ? <Txt variant="muted" color={message.ok ? t.ok : t.over}>{message.text}</Txt> : null}
          <Button title={mode === 'entrar' ? 'Entrar' : 'Criar conta'} onPress={submit} loading={busy} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

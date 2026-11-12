import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Appear } from '@/components/motion';
import { Button, Card, Field, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { confirmDialog, notify } from '@/lib/dialog';
import { formatBRL, parseMoneyToCents } from '@/engine/money';
import type { NotificationPrefs } from '@/engine/types';
import { useTheme } from '@/theme';

const toInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '');

export default function Ajustes() {
  const t = useTheme();
  const { settings, saveSettings, mode, session, signOut, loadDemo, clearAll, transactions } = useApp();
  const [income, setIncome] = useState(toInput(settings.monthlyIncomeCents));
  const [reserve, setReserve] = useState(toInput(settings.emergencyBalanceCents));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setIncome(toInput(settings.monthlyIncomeCents));
    setReserve(toInput(settings.emergencyBalanceCents));
  }, [settings.monthlyIncomeCents, settings.emergencyBalanceCents]);

  const fail = (e: Error) => notify('Erro', e.message);

  const saveValues = async () => {
    const i = income.trim() ? parseMoneyToCents(income) : 0;
    const r = reserve.trim() ? parseMoneyToCents(reserve) : 0;
    if (i === null || r === null || i < 0 || r < 0) {
      notify('Valor inválido', 'Use apenas números, por exemplo 6500,00.');
      return;
    }
    setBusy(true);
    try {
      await saveSettings({ ...settings, monthlyIncomeCents: i, emergencyBalanceCents: r });
      notify('Salvo', 'Seus cálculos foram atualizados.');
    } catch (e) {
      fail(e as Error);
    } finally {
      setBusy(false);
    }
  };

  const setPref = (key: keyof NotificationPrefs, v: boolean) =>
    saveSettings({ ...settings, notifications: { ...settings.notifications, [key]: v } }).catch(fail);

  const confirm = (title: string, message: string, action: () => Promise<void>, destructive = false) =>
    confirmDialog(title, message, () => {
      action().catch(fail);
    }, { destructive });

  const Row = ({ label, hint, k }: { label: string; hint: string; k: keyof NotificationPrefs }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: '600' }}>{label}</Txt>
        <Txt variant="small">{hint}</Txt>
      </View>
      <Switch value={settings.notifications[k]} onValueChange={(v) => setPref(k, v)} trackColor={{ true: t.primary, false: t.border }} />
    </View>
  );

  return (
    <Screen>
      <Appear index={0}>
      <Card>
        <Txt variant="h2">A base de tudo</Txt>
        <Button title="Detalhar o que eu ganho" icon="cash-outline" variant="ghost" onPress={() => router.push('/renda')} />
        <Field label="Renda líquida mensal (R$)" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="ex.: 6500,00" hint="O que cai na sua conta depois dos descontos. É daqui que sai o limite de cada categoria." />
        <Field label="Reserva de emergência atual (R$)" value={reserve} onChangeText={setReserve} keyboardType="decimal-pad" placeholder="ex.: 9000,00" hint={`Meta: 6 meses de custos essenciais. Hoje: ${formatBRL(settings.emergencyBalanceCents)}.`} />
        <Button title="Salvar" onPress={saveValues} loading={busy} />
      </Card>
      </Appear>

      <Card>
        <Txt variant="h2">Notificações</Txt>
        <Row label="Aviso de limite" hint="Eu te cutuco quando uma categoria chega em 80% ou estoura." k="budgetAlerts" />
        <Row label="Resumo da semana" hint="Todo domingo, às 19h." k="weeklySummary" />
        <Row label="Lembrete do dia" hint="Todo dia às 20h30, pra você não esquecer de lançar." k="dailyReminder" />
      </Card>

      <Card>
        <Txt variant="h2">Extrato do banco</Txt>
        <Txt variant="muted">Baixa o extrato no app do seu banco (CSV, OFX ou PDF) e joga aqui. Se já tiver importado antes, eu não duplico.</Txt>
        <Button title="Importar extrato" icon="cloud-upload-outline" onPress={() => router.push('/importar')} />
      </Card>

      <Card>
        <Txt variant="h2">Sua conta e seus dados</Txt>
        {mode === 'cloud' ? (
          <>
            <Txt variant="muted">Conectado como {session?.user.email}. Seus dados ficam salvos na nuvem e acompanham você em qualquer aparelho.</Txt>
            <Button title="Sair da conta" variant="ghost" onPress={signOut} />
          </>
        ) : (
          <Txt variant="muted">Modo local: os dados ficam somente neste aparelho. Configure o Supabase (veja o README) para salvar na nuvem.</Txt>
        )}
        <Button
          title="Carregar dados de exemplo"
          variant="ghost"
          icon="sparkles-outline"
          onPress={() => confirm('Carregar dados de exemplo?', transactions.length ? 'Isso APAGA os lançamentos atuais e coloca dados fictícios no lugar.' : 'Cria 4 meses de lançamentos fictícios.', loadDemo, transactions.length > 0)}
        />
        <Button
          title="Apagar todos os dados"
          variant="danger"
          icon="trash-outline"
          onPress={() => confirm('Apagar tudo?', 'Todos os lançamentos e ajustes serão removidos. Não dá para desfazer.', clearAll, true)}
        />
      </Card>

      <Txt variant="small" style={{ textAlign: 'center' }}>Finanças Claras · o que tem aqui é conselho de amigo, não de consultor financeiro. Decisão grande, confere com um profissional.</Txt>
    </Screen>
  );
}

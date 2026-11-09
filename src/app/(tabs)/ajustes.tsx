import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
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
      <Card>
        <Txt variant="h2">Sua base de cálculo</Txt>
        <Field label="Renda líquida mensal (R$)" value={income} onChangeText={setIncome} keyboardType="decimal-pad" placeholder="ex.: 6500,00" hint="O que cai na conta depois dos descontos. Define o ideal de cada categoria." />
        <Field label="Reserva de emergência atual (R$)" value={reserve} onChangeText={setReserve} keyboardType="decimal-pad" placeholder="ex.: 9000,00" hint={`Meta: 6 meses de custos essenciais. Hoje: ${formatBRL(settings.emergencyBalanceCents)}.`} />
        <Button title="Salvar" onPress={saveValues} loading={busy} />
      </Card>

      <Card>
        <Txt variant="h2">Notificações</Txt>
        <Row label="Alertas de orçamento" hint="Avisa quando uma categoria chega a 80% ou estoura o limite." k="budgetAlerts" />
        <Row label="Resumo semanal" hint="Domingo às 19h." k="weeklySummary" />
        <Row label="Lembrete diário" hint="Todo dia às 20h30, para registrar os gastos." k="dailyReminder" />
      </Card>

      <Card>
        <Txt variant="h2">Extrato do banco</Txt>
        <Txt variant="muted">Importe o arquivo CSV ou OFX baixado no app ou internet banking do seu banco. Lançamentos repetidos são ignorados.</Txt>
        <Button title="Importar extrato" icon="cloud-upload-outline" onPress={() => router.push('/importar')} />
      </Card>

      <Card>
        <Txt variant="h2">Conta e dados</Txt>
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

      <Txt variant="small" style={{ textAlign: 'center' }}>Finanças Claras · as dicas são orientações gerais e não substituem um consultor financeiro.</Txt>
    </Screen>
  );
}

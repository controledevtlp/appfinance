import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { Appear, Press } from '@/components/motion';
import { Button, Card, Chip, Icon, MoneyField, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { EXPENSE_CATEGORIES, getCategory, INCOME_CATEGORIES } from '@/engine/categories';
import { categorize } from '@/engine/categorizer';
import { formatDateBR, parseDateToISO, todayISO, toISO } from '@/engine/dates';
import { parseMoneyToCents } from '@/engine/money';
import { countSameName, displayName, withAlias } from '@/engine/naming';
import type { TxType } from '@/engine/types';
import { confirmDialog, notify } from '@/lib/dialog';
import { radius, useTheme } from '@/theme';

export default function Transacao() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { transactions, settings, saveSettings, addTransactions, updateTransaction, removeTransaction } = useApp();
  const existing = useMemo(() => transactions.find((x) => x.id === id), [transactions, id]);

  const [type, setType] = useState<TxType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [name, setName] = useState(existing ? displayName(existing.description, settings.aliases) : '');
  const [applyToAll, setApplyToAll] = useState(false);
  const [date, setDate] = useState(formatDateBR(existing?.date ?? todayISO()));
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? 'outros');
  const [recurring, setRecurring] = useState(existing?.recurring ?? false);
  const [touchedCategory, setTouchedCategory] = useState(!!existing);
  const [busy, setBusy] = useState(false);

  const list = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const sameName = existing ? countSameName(transactions, existing.description) : 0;
  const renamed = !!existing && name.trim() !== existing.description.trim();

  const changeType = (next: TxType) => {
    setType(next);
    setTouchedCategory(false);
    setCategoryId(next === 'income' ? 'salario' : categorize(name, 'expense'));
  };

  const onName = (text: string) => {
    setName(text);
    if (!touchedCategory) setCategoryId(categorize(text, type));
  };

  const setDay = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    setDate(formatDateBR(toISO(d)));
  };

  const save = async () => {
    const cents = parseMoneyToCents(amount);
    const iso = parseDateToISO(date);
    if (cents === null || cents === 0) return notify('Valor inválido', 'Informe um valor maior que zero, como 45,90.');
    if (!iso) return notify('Data inválida', 'Use o formato dia/mês/ano, como 09/11/2026.');
    setBusy(true);
    try {
      const label = name.trim() || getCategory(categoryId).name;
      if (existing) {
        // Renomear um lançamento importado pode valer para todos os iguais.
        if (applyToAll && renamed) {
          await saveSettings({ ...settings, aliases: withAlias(settings.aliases, existing.description, label) });
          await updateTransaction({ ...existing, amountCents: Math.abs(cents), date: iso, type, categoryId, recurring });
        } else {
          await updateTransaction({ ...existing, description: label, amountCents: Math.abs(cents), date: iso, type, categoryId, recurring });
        }
      } else {
        await addTransactions([
          { date: iso, description: label, amountCents: Math.abs(cents), type, categoryId, source: 'manual', externalId: null, recurring },
        ]);
      }
      router.back();
    } catch (e) {
      notify('Erro ao salvar', (e as Error).message);
      setBusy(false);
    }
  };

  const remove = () =>
    confirmDialog(
      'Excluir lançamento?',
      'Não dá para desfazer.',
      async () => {
        try {
          await removeTransaction(existing!.id);
          router.back();
        } catch (e) {
          notify('Erro', (e as Error).message);
        }
      },
      { destructive: true, confirmText: 'Excluir' },
    );

  return (
    <Screen padBottom={48}>
      <Stack.Screen options={{ title: existing ? 'Editar lançamento' : 'Novo lançamento' }} />

      <Appear index={0}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Despesa" icon="arrow-down" selected={type === 'expense'} color={t.expense} onPress={() => changeType('expense')} />
            <Chip label="Receita" icon="arrow-up" selected={type === 'income'} color={t.income} onPress={() => changeType('income')} />
          </View>
          <MoneyField label="Valor" value={amount} onChangeText={setAmount} autoFocus={!existing} big />
        </Card>
      </Appear>

      <Appear index={1}>
        <Card>
          <Txt variant="h2">Dê um nome</Txt>
          <TextInput
            value={name}
            onChangeText={onName}
            placeholder={type === 'income' ? 'ex.: Salário de novembro' : 'ex.: Mercado da semana'}
            placeholderTextColor={t.muted}
            style={{ borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, color: t.text, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
          />
          {existing && renamed && sameName > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>Usar este nome nos {sameName} lançamentos iguais</Txt>
                <Txt variant="small">Vale também para os próximos meses que você importar.</Txt>
              </View>
              <Switch value={applyToAll} onValueChange={setApplyToAll} trackColor={{ true: t.primary, false: t.border }} />
            </View>
          ) : null}
          {existing && existing.source === 'import' ? (
            <Txt variant="small">No extrato veio como “{existing.description}”.</Txt>
          ) : null}
        </Card>
      </Appear>

      <Appear index={2}>
        <Card>
          <Txt variant="h2">Categoria</Txt>
          {!touchedCategory && name ? <Txt variant="small">Sugerida pelo nome. Toque para trocar.</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8 }}>
            {list.map((c) => {
              const on = c.id === categoryId;
              return (
                <Press
                  key={c.id}
                  onPress={() => {
                    setCategoryId(c.id);
                    setTouchedCategory(true);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c.name}
                  style={{
                    // Três por linha, com altura fixa para a grade não ficar escalonada.
                    width: '31.3%',
                    height: 94,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    paddingHorizontal: 4,
                    borderRadius: radius.md,
                    borderWidth: on ? 2 : 1,
                    borderColor: on ? t.primary : t.border,
                    backgroundColor: on ? t.soft : 'transparent',
                  }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: on ? t.primary : t.soft,
                    }}>
                    <Icon name={c.icon} size={21} color={on ? t.primaryText : t.primary} />
                  </View>
                  <Txt variant="small" numberOfLines={2} style={{ textAlign: 'center', fontWeight: on ? '700' : '400', color: on ? t.text : t.muted }}>
                    {c.short}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </Card>
      </Appear>

      <Appear index={3}>
        <Card>
          <Txt variant="h2">Quando</Txt>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="dd/mm/aaaa"
            placeholderTextColor={t.muted}
            keyboardType="numbers-and-punctuation"
            inputMode="numeric"
            style={{ borderWidth: 1, borderColor: t.border, backgroundColor: t.bg, color: t.text, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Hoje" onPress={() => setDay(0)} />
            <Chip label="Ontem" onPress={() => setDay(-1)} />
            <Chip label="Anteontem" onPress={() => setDay(-2)} />
          </View>
          {type === 'expense' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>Se repete todo mês</Txt>
                <Txt variant="small">Aluguel, assinatura, parcela. Entra na projeção como conta fixa.</Txt>
              </View>
              <Switch value={recurring} onValueChange={setRecurring} trackColor={{ true: t.primary, false: t.border }} />
            </View>
          ) : null}
        </Card>
      </Appear>

      <Button title={existing ? 'Salvar alterações' : 'Adicionar'} onPress={save} loading={busy} />
      {existing ? <Button title="Excluir lançamento" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

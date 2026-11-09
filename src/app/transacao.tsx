import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, CategoryBadge, CategoryPicker, Chip, Field, Screen, Txt, useToggle } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { confirmDialog, notify } from '@/lib/dialog';
import { getCategory } from '@/engine/categories';
import { categorize } from '@/engine/categorizer';
import { formatDateBR, parseDateToISO, todayISO, toISO } from '@/engine/dates';
import { parseMoneyToCents } from '@/engine/money';
import type { TxType } from '@/engine/types';
import { radius, useTheme } from '@/theme';

export default function Transacao() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { transactions, addTransactions, updateTransaction, removeTransaction } = useApp();
  const existing = useMemo(() => transactions.find((x) => x.id === id), [transactions, id]);

  const [type, setType] = useState<TxType>(existing?.type ?? 'expense');
  const [amount, setAmount] = useState(existing ? (existing.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [date, setDate] = useState(formatDateBR(existing?.date ?? todayISO()));
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? 'outros');
  const [touchedCategory, setTouchedCategory] = useState(!!existing);
  const [busy, setBusy] = useState(false);
  const picker = useToggle();

  const changeType = (next: TxType) => {
    setType(next);
    setTouchedCategory(false);
    setCategoryId(next === 'income' ? 'salario' : categorize(description, 'expense'));
  };

  const onDescription = (text: string) => {
    setDescription(text);
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
      const payload = { date: iso, description: description.trim() || getCategory(categoryId).name, amountCents: Math.abs(cents), type, categoryId };
      if (existing) await updateTransaction({ ...existing, ...payload });
      else await addTransactions([{ ...payload, source: 'manual', externalId: null }]);
      router.back();
    } catch (e) {
      notify('Erro ao salvar', (e as Error).message);
      setBusy(false);
    }
  };

  const remove = () =>
    confirmDialog('Excluir lançamento?', 'Não dá para desfazer.', async () => {
      try {
        await removeTransaction(existing!.id);
        router.back();
      } catch (e) {
        notify('Erro', (e as Error).message);
      }
    }, { destructive: true, confirmText: 'Excluir' });

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Editar lançamento' : 'Novo lançamento' }} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Despesa" icon="arrow-down" selected={type === 'expense'} color={t.expense} onPress={() => changeType('expense')} />
        <Chip label="Receita" icon="arrow-up" selected={type === 'income'} color={t.income} onPress={() => changeType('income')} />
      </View>
      <Field label="Valor (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" autoFocus={!existing} />
      <Field label="Descrição" value={description} onChangeText={onDescription} placeholder={type === 'income' ? 'ex.: Salário' : 'ex.: iFood, Mercado, Uber'} />
      <Field label="Data" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" placeholder="dd/mm/aaaa" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Chip label="Hoje" onPress={() => setDay(0)} />
        <Chip label="Ontem" onPress={() => setDay(-1)} />
      </View>

      <View style={{ gap: 6 }}>
        <Txt variant="muted">Categoria{!touchedCategory && description ? ' (sugerida automaticamente)' : ''}</Txt>
        <Pressable onPress={picker.open} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 10, backgroundColor: t.card }}>
          <CategoryBadge categoryId={categoryId} size={36} />
          <Txt style={{ flex: 1 }}>{getCategory(categoryId).name}</Txt>
          <Txt variant="muted" color={t.primary}>Trocar</Txt>
        </Pressable>
      </View>
      <CategoryPicker visible={picker.on} type={type} value={categoryId} onSelect={(c) => { setCategoryId(c); setTouchedCategory(true); }} onClose={picker.close} />

      <Button title={existing ? 'Salvar alterações' : 'Adicionar'} onPress={save} loading={busy} style={{ marginTop: 8 }} />
      {existing ? <Button title="Excluir lançamento" variant="danger" onPress={remove} /> : null}
    </Screen>
  );
}

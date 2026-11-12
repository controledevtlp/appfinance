import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, TextInput, View } from 'react-native';
import { Backdrop, useHasBackdrop } from '@/components/glass';
import { Press } from '@/components/motion';
import { CategoryBadge, Chip, Icon, MonthSwitcher, Txt, tap } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { getCategory } from '@/engine/categories';
import { normalize } from '@/engine/categorizer';
import { nameOf } from '@/engine/naming';
import { dayLabel, monthKey } from '@/engine/dates';
import { formatBRL } from '@/engine/money';
import type { Transaction } from '@/engine/types';
import { glassShadow, radius, useTheme } from '@/theme';
import { GradientPill } from '@/components/glass';

type Filter = 'all' | 'expense' | 'income';

export default function Lancamentos() {
  const t = useTheme();
  const { transactions, month, setMonth, settings } = useApp();
  const hasBackdrop = useHasBackdrop();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = normalize(query);
    const list = transactions
      .filter((x) => monthKey(x.date) === month)
      .filter((x) => filter === 'all' || x.type === filter)
      .filter((x) => !q || normalize(nameOf(x, settings)).includes(q) || normalize(getCategory(x.categoryId).name).includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const byDay = new Map<string, Transaction[]>();
    for (const x of list) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
    return [...byDay.entries()].map(([date, data]) => ({ title: dayLabel(date), data }));
  }, [transactions, month, filter, query, settings]);

  return (
    <View style={{ flex: 1 }}>
      {hasBackdrop ? null : <Backdrop />}
      <View style={{ padding: 16, gap: 10, paddingTop: 70 }}>
        <MonthSwitcher month={month} onChange={setMonth} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.fieldBg, borderRadius: radius.pill, borderWidth: 1, borderColor: t.border, paddingHorizontal: 14 }}>
          <Icon name="search" size={18} color={t.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Procurar um gasto ou categoria" placeholderTextColor={t.muted} style={{ flex: 1, paddingVertical: 10, color: t.text, fontSize: 15 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Todos" selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label="Despesas" selected={filter === 'expense'} onPress={() => setFilter('expense')} />
          <Chip label="Receitas" selected={filter === 'income'} onPress={() => setFilter('income')} />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<Txt variant="muted" style={{ textAlign: 'center', marginTop: 40 }}>Nada lançado nesse mês ainda.</Txt>}
        renderSectionHeader={({ section }) => <Txt variant="small" style={{ marginTop: 14, marginBottom: 6, textTransform: 'capitalize' }}>{section.title}</Txt>}
        renderItem={({ item, index, section }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/transacao', params: { id: item.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, padding: 13, borderWidth: 1, borderColor: t.border, borderTopLeftRadius: index === 0 ? radius.lg : 0, borderTopRightRadius: index === 0 ? radius.lg : 0, borderBottomLeftRadius: index === section.data.length - 1 ? radius.lg : 0, borderBottomRightRadius: index === section.data.length - 1 ? radius.lg : 0, marginTop: -1 }}>
            <CategoryBadge categoryId={item.categoryId} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{nameOf(item, settings)}</Txt>
              <Txt variant="small">{getCategory(item.categoryId).name}{item.source === 'import' ? ' · importado' : ''}</Txt>
            </View>
            <Txt style={{ fontWeight: '700' }} color={item.categoryId === 'transferencia' ? t.muted : item.type === 'income' ? t.income : t.expense}>
              {item.type === 'income' ? '+' : '-'}{formatBRL(item.amountCents)}
            </Txt>
          </Pressable>
        )}
      />

      <Press
        accessibilityRole="button"
        accessibilityLabel="Adicionar lançamento"
        onPress={() => {
          tap();
          router.push('/transacao');
        }}
        style={{ position: 'absolute', right: 20, bottom: 104, borderRadius: 32 }}>
        <GradientPill radius={32} style={[{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }, glassShadow(t, 1.2)]}>
          <Icon name="add" size={30} color={t.primaryText} />
        </GradientPill>
      </Press>
    </View>
  );
}

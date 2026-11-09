import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, TextInput, View } from 'react-native';
import { CategoryBadge, Chip, Icon, MonthSwitcher, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { getCategory } from '@/engine/categories';
import { normalize } from '@/engine/categorizer';
import { dayLabel, monthKey } from '@/engine/dates';
import { formatBRL } from '@/engine/money';
import type { Transaction } from '@/engine/types';
import { radius, useTheme } from '@/theme';

type Filter = 'all' | 'expense' | 'income';

export default function Lancamentos() {
  const t = useTheme();
  const { transactions, month, setMonth } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = normalize(query);
    const list = transactions
      .filter((x) => monthKey(x.date) === month)
      .filter((x) => filter === 'all' || x.type === filter)
      .filter((x) => !q || normalize(x.description).includes(q) || normalize(getCategory(x.categoryId).name).includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const byDay = new Map<string, Transaction[]>();
    for (const x of list) byDay.set(x.date, [...(byDay.get(x.date) ?? []), x]);
    return [...byDay.entries()].map(([date, data]) => ({ title: dayLabel(date), data }));
  }, [transactions, month, filter, query]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: 16, gap: 10 }}>
        <MonthSwitcher month={month} onChange={setMonth} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, paddingHorizontal: 12 }}>
          <Icon name="search" size={18} color={t.muted} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Buscar lançamento ou categoria" placeholderTextColor={t.muted} style={{ flex: 1, paddingVertical: 10, color: t.text, fontSize: 15 }} />
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={<Txt variant="muted" style={{ textAlign: 'center', marginTop: 40 }}>Nenhum lançamento neste mês.</Txt>}
        renderSectionHeader={({ section }) => <Txt variant="small" style={{ marginTop: 14, marginBottom: 6, textTransform: 'capitalize' }}>{section.title}</Txt>}
        renderItem={({ item, index, section }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/transacao', params: { id: item.id } })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.card, padding: 12, borderWidth: 1, borderColor: t.border, borderTopLeftRadius: index === 0 ? radius.md : 0, borderTopRightRadius: index === 0 ? radius.md : 0, borderBottomLeftRadius: index === section.data.length - 1 ? radius.md : 0, borderBottomRightRadius: index === section.data.length - 1 ? radius.md : 0, marginTop: -1 }}>
            <CategoryBadge categoryId={item.categoryId} />
            <View style={{ flex: 1 }}>
              <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{item.description}</Txt>
              <Txt variant="small">{getCategory(item.categoryId).name}{item.source === 'import' ? ' · importado' : ''}</Txt>
            </View>
            <Txt style={{ fontWeight: '700' }} color={item.categoryId === 'transferencia' ? t.muted : item.type === 'income' ? t.income : t.expense}>
              {item.type === 'income' ? '+' : '-'}{formatBRL(item.amountCents)}
            </Txt>
          </Pressable>
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar lançamento"
        onPress={() => router.push('/transacao')}
        style={{ position: 'absolute', right: 20, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } }}>
        <Icon name="add" size={30} color={t.primaryText} />
      </Pressable>
    </View>
  );
}

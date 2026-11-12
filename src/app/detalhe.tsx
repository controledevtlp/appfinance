import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Donut } from '@/components/charts';
import { Appear, Bar, Press } from '@/components/motion';
import { Card, CategoryBadge, Empty, Icon, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { FOOD_CATEGORIES, getCategory, GROUP_LABEL } from '@/engine/categories';
import { formatDateBR, monthKey, monthLabel } from '@/engine/dates';
import { formatBRL } from '@/engine/money';
import { nameOf } from '@/engine/naming';
import type { Group, Transaction } from '@/engine/types';
import { useTheme } from '@/theme';

export type DrillKind = 'income' | 'expense' | 'invested' | 'recurring' | 'food' | 'balance';

const KIND_TITLE: Record<DrillKind, string> = {
  income: 'Receitas do mês',
  expense: 'Despesas do mês',
  invested: 'Investido no mês',
  recurring: 'Gastos constantes',
  food: 'Mercado e alimentação fora',
  balance: 'Tudo do mês',
};

/**
 * Tela de detalhe: mostra exatamente os lançamentos que formam o número em
 * que a pessoa tocou, com o mesmo filtro usado no cálculo. Serve para o
 * painel, o orçamento e as dicas.
 */
export default function Detalhe() {
  const t = useTheme();
  const { transactions, settings, summary, month } = useApp();
  const params = useLocalSearchParams<{ kind?: DrillKind; categoryId?: string; group?: Group }>();
  const { kind, categoryId, group } = params;

  const title = categoryId
    ? getCategory(categoryId).name
    : group
      ? GROUP_LABEL[group]
      : KIND_TITLE[(kind ?? 'expense') as DrillKind];

  const list = useMemo(() => {
    const food = FOOD_CATEGORIES as readonly string[];
    const inMonth = transactions.filter((x) => monthKey(x.date) === month);
    const keep = (x: Transaction) => {
      if (categoryId) return x.categoryId === categoryId;
      if (group) return getCategory(x.categoryId).group === group && x.type === 'expense';
      switch (kind) {
        case 'income':
          return x.type === 'income' && x.categoryId !== 'transferencia';
        case 'invested':
          return x.type === 'expense' && getCategory(x.categoryId).group === 'poupanca';
        case 'recurring':
          return x.type === 'expense' && x.recurring === true;
        case 'food':
          return x.type === 'expense' && food.includes(x.categoryId);
        case 'balance':
          return x.categoryId !== 'transferencia';
        default:
          return (
            x.type === 'expense' &&
            x.categoryId !== 'transferencia' &&
            getCategory(x.categoryId).group !== 'poupanca'
          );
      }
    };
    return inMonth.filter(keep).sort((a, b) => b.amountCents - a.amountCents);
  }, [transactions, month, kind, categoryId, group]);

  const total = list.reduce((a, x) => a + (x.type === 'income' ? x.amountCents : -x.amountCents), 0);
  const gross = list.reduce((a, x) => a + x.amountCents, 0);
  const usage = categoryId ? summary.categories.find((c) => c.category.id === categoryId) : undefined;

  // Quando o detalhe é de um grupo ou de um tipo, a composição por categoria ajuda a ler.
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of list) map.set(x.categoryId, (map.get(x.categoryId) ?? 0) + x.amountCents);
    return [...map.entries()]
      .map(([id, cents], i) => ({ id, cents, color: t.chart[i % t.chart.length] }))
      .sort((a, b) => b.cents - a.cents);
  }, [list, t.chart]);

  return (
    <Screen>
      <Stack.Screen options={{ title }} />

      <Appear index={0}>
        <Card>
          <Txt variant="muted">{title} · {monthLabel(month)}</Txt>
          <Txt variant="big" color={kind === 'income' ? t.income : total < 0 ? t.expense : t.text}>
            {formatBRL(kind === 'balance' ? total : gross)}
          </Txt>
          <Txt variant="small">
            {list.length} {list.length === 1 ? 'lançamento' : 'lançamentos'}
            {list.length > 1 ? ` · média de ${formatBRL(Math.round(gross / list.length))}` : ''}
          </Txt>
          {usage ? (
            <>
              <Bar ratio={usage.ratio} markerAt={1} color={usage.status === 'over' ? t.over : usage.status === 'warning' ? t.warning : t.ok} />
              <Txt variant="small">
                {usage.status === 'over'
                  ? `Passou ${formatBRL(usage.spentCents - usage.limitCents)} do ideal de ${formatBRL(usage.limitCents)}.`
                  : `Dentro do ideal: teto de ${formatBRL(usage.limitCents)}.`}
              </Txt>
            </>
          ) : null}
        </Card>
      </Appear>

      {byCategory.length > 1 ? (
        <Appear index={1}>
          <Card>
            <Txt variant="h2">Por categoria</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Donut size={110} thickness={16} slices={byCategory.map((c) => ({ value: c.cents, color: c.color }))} />
              <View style={{ flex: 1, gap: 8 }}>
                {byCategory.slice(0, 6).map((c) => (
                  <Press key={c.id} onPress={() => router.push({ pathname: '/detalhe', params: { categoryId: c.id } })}>
                    <View style={{ gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.color }} />
                        <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{getCategory(c.id).name}</Txt>
                        <Txt variant="small" style={{ fontWeight: '700' }}>{formatBRL(c.cents)}</Txt>
                      </View>
                      <Bar ratio={c.cents / Math.max(1, gross)} color={c.color} height={4} />
                    </View>
                  </Press>
                ))}
              </View>
            </View>
          </Card>
        </Appear>
      ) : null}

      {list.length === 0 ? (
        <Appear index={2}>
          <Empty icon="search-outline" title="Nada aqui" text={`Nenhum lançamento de ${title.toLowerCase()} em ${monthLabel(month)}.`} />
        </Appear>
      ) : (
        <Appear index={2}>
          <Card>
            <Txt variant="h2">Do maior para o menor</Txt>
            <Txt variant="small">Toque para abrir, renomear ou mudar a categoria.</Txt>
            {list.map((x) => (
              <Press key={x.id} onPress={() => router.push({ pathname: '/transacao', params: { id: x.id } })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
                  <CategoryBadge categoryId={x.categoryId} size={34} />
                  <View style={{ flex: 1 }}>
                    <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{nameOf(x, settings)}</Txt>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="small">{formatDateBR(x.date)} · {getCategory(x.categoryId).name}</Txt>
                      {x.recurring ? <Icon name="repeat" size={12} color={t.primary} /> : null}
                    </View>
                  </View>
                  <Txt style={{ fontWeight: '700' }} color={x.type === 'income' ? t.income : t.expense}>
                    {x.type === 'income' ? '+' : '-'}{formatBRL(x.amountCents)}
                  </Txt>
                </View>
              </Press>
            ))}
          </Card>
        </Appear>
      )}
    </Screen>
  );
}

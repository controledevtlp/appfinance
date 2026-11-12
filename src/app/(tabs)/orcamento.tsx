import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Appear, Bar, Press } from '@/components/motion';
import { Button, Card, CategoryBadge, Field, Icon, MonthSwitcher, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { mealBenefitStatus } from '@/engine/budget';
import { GROUP_LABEL } from '@/engine/categories';
import { formatBRL, parseMoneyToCents } from '@/engine/money';
import type { CategoryUsage } from '@/engine/types';
import { radius, useTheme } from '@/theme';

const GROUPS = ['necessidades', 'desejos', 'poupanca'] as const;

export default function Orcamento() {
  const t = useTheme();
  const { summary, month, setMonth, settings, saveSettings, emergency, transactions } = useApp();
  const benefit = mealBenefitStatus(transactions, month, settings);
  const [editing, setEditing] = useState<CategoryUsage | null>(null);
  const [value, setValue] = useState('');

  const open = (u: CategoryUsage) => {
    setEditing(u);
    setValue((u.limitCents / 100).toFixed(2).replace('.', ','));
  };

  const persist = async (overrides: Record<string, number>) => {
    await saveSettings({ ...settings, budgetOverrides: overrides });
    setEditing(null);
  };

  const statusColor = (u: CategoryUsage) => (u.status === 'over' ? t.over : u.status === 'warning' ? t.warning : u.category.group === 'poupanca' ? t.poupanca : t.ok);

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={setMonth} />

      <Appear index={0}>
      <Card>
        <Txt variant="muted">Renda usada nos cálculos</Txt>
        <Txt variant="title">{formatBRL(summary.baseIncomeCents)}</Txt>
        <Txt variant="small">
          {settings.monthlyIncomeCents > 0
            ? 'Renda líquida informada em Minha renda.'
            : 'Usando as receitas lançadas no mês. Informe sua renda fixa para ter limites estáveis.'}
          {settings.mealBenefitCents > 0
            ? ` Mais ${formatBRL(settings.mealBenefitCents)} de cartão alimentação, que eleva o teto de mercado e alimentação fora.`
            : ''}
        </Txt>
        <Button title="Alterar renda" icon="cash-outline" variant="ghost" onPress={() => router.push('/renda')} />
      </Card>
      </Appear>

      {benefit.limitCents > 0 ? (
        <Appear index={1}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h2">Cartão alimentação</Txt>
              <Txt variant="muted">{formatBRL(benefit.remainingCents)} disponível</Txt>
            </View>
            <Press onPress={() => router.push({ pathname: '/detalhe', params: { kind: 'food' } })} accessibilityLabel="Ver gastos de alimentação">
              <Bar ratio={benefit.progress} color={benefit.progress >= 1 ? t.warning : t.primary} height={10} />
            </Press>
            <Txt variant="small">
              {formatBRL(benefit.spentCents)} de {formatBRL(benefit.limitCents)} usados em mercado e alimentação fora.
              {benefit.spentCents > benefit.limitCents
                ? ` Passou ${formatBRL(benefit.spentCents - benefit.limitCents)} do benefício — essa parte saiu do seu bolso.`
                : ''}
            </Txt>
          </Card>
        </Appear>
      ) : null}

      {GROUPS.map((g, gi) => {
        const group = summary.groups.find((x) => x.group === g)!;
        const cats = summary.categories.filter((c) => c.category.group === g);
        return (
          <Appear key={g} index={gi + 2}>
          <Card>
            <View style={{ gap: 2 }}>
              <Txt variant="h2">{GROUP_LABEL[g]} · {group.idealPct}%</Txt>
              <Txt variant="small">{formatBRL(group.spentCents)} de {formatBRL(group.idealCents)}</Txt>
            </View>
            {cats.map((u, i) => (
              <Press
                key={u.category.id}
                onPress={() => router.push({ pathname: '/detalhe', params: { categoryId: u.category.id } })}
                accessibilityRole="button"
                accessibilityLabel={`Ver gastos de ${u.category.name}`}
                style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <CategoryBadge categoryId={u.category.id} size={32} />
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '600' }} numberOfLines={1}>{u.category.name}</Txt>
                    <Txt variant="small">
                      {formatBRL(u.spentCents)} de {formatBRL(u.limitCents)}
                      {settings.budgetOverrides[u.category.id] !== undefined ? ' · personalizado' : ''}
                    </Txt>
                  </View>
                  <Txt variant="muted" color={statusColor(u)} style={{ fontWeight: '700' }}>{u.limitCents > 0 || u.spentCents > 0 ? `${Math.round(u.ratio * 100)}%` : '—'}</Txt>
                  <Press onPress={() => open(u)} hitSlop={10} accessibilityLabel={`Editar limite de ${u.category.name}`}>
                    <Icon name="create-outline" size={18} color={t.muted} />
                  </Press>
                </View>
                <Bar ratio={u.ratio} color={statusColor(u)} markerAt={1} height={6} delay={gi * 60 + i * 40} />
              </Press>
            ))}
          </Card>
          </Appear>
        );
      })}

      <Appear index={5}>
      <Card>
        <Txt variant="h2">Reserva de emergência</Txt>
        <Txt variant="muted">Custos essenciais: {formatBRL(emergency.essentialCents)}/mês (média dos últimos meses). Meta de 6 meses: {formatBRL(emergency.targetCents)}.</Txt>
        <Bar ratio={emergency.progress} color={t.poupanca} height={10} />
        <Txt variant="small">Você tem {formatBRL(emergency.balanceCents)} ({emergency.monthsCovered.toFixed(1).replace('.', ',')} meses). Guardando {formatBRL(emergency.suggestedMonthlyCents)} por mês, a meta sai em 12 meses.</Txt>
        <Button title="Atualizar valor guardado" variant="ghost" onPress={() => router.push('/ajustes')} />
      </Card>
      </Appear>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={() => setEditing(null)}>
          <Pressable style={{ backgroundColor: t.card, borderRadius: radius.lg, padding: 20, gap: 14 }} onPress={() => {}}>
            <Txt variant="h2">Limite de {editing?.category.name}</Txt>
            <Txt variant="muted">Ideal sugerido: {editing ? formatBRL(Math.round((summary.baseIncomeCents * editing.category.idealPct) / 100)) : ''} ({editing?.category.idealPct}% da renda).</Txt>
            <Field label="Limite mensal (R$)" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
            <Button
              title="Salvar limite"
              onPress={() => {
                const cents = parseMoneyToCents(value);
                if (cents === null || cents < 0 || !editing) return;
                void persist({ ...settings.budgetOverrides, [editing.category.id]: cents });
              }}
            />
            <Button
              title="Restaurar ideal"
              variant="ghost"
              onPress={() => {
                if (!editing) return;
                const { [editing.category.id]: _removed, ...rest } = settings.budgetOverrides;
                void persist(rest);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

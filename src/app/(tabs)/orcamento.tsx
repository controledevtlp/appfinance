import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Appear, Bar, Press } from '@/components/motion';
import { Button, Card, CardTitle, CategoryBadge, Field, Icon, MonthSwitcher, Screen, ScreenHeader, Txt } from '@/components/ui';
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
      <ScreenHeader eyebrow="Quanto cabe em cada coisa" title="Limites" />
      <MonthSwitcher month={month} onChange={setMonth} />

      <Appear index={0}>
      <Card>
        <Txt variant="label">O que eu uso de base</Txt>
        <Txt variant="big">{formatBRL(summary.baseIncomeCents)}</Txt>
        <Txt variant="small">
          {settings.monthlyIncomeCents > 0
            ? 'É o que você me contou em "Minha renda".'
            : 'Tô usando o que entrou esse mês. Se me contar sua renda fixa, os limites ficam mais certos.'}
          {settings.mealBenefitCents > 0
            ? ` Mais ${formatBRL(settings.mealBenefitCents)} de cartão alimentação, que eleva o teto de mercado e alimentação fora.`
            : ''}
        </Txt>
        <Button title="Mudar minha renda" icon="cash-outline" variant="ghost" onPress={() => router.push('/renda')} />
      </Card>
      </Appear>

      {benefit.limitCents > 0 ? (
        <Appear index={1}>
          <Card>
            <CardTitle label="Benefício" title="Cartão alimentação" right={<Txt variant="muted" style={{ fontWeight: '700' }}>sobra {formatBRL(benefit.remainingCents)}</Txt>} />
            <Press onPress={() => router.push({ pathname: '/detalhe', params: { kind: 'food' } })} accessibilityLabel="Ver gastos de alimentação">
              <Bar ratio={benefit.progress} color={benefit.progress >= 1 ? t.warning : t.primary} height={10} />
            </Press>
            <Txt variant="small">
              Você já usou {formatBRL(benefit.spentCents)} de {formatBRL(benefit.limitCents)} em mercado e comida fora.
              {benefit.spentCents > benefit.limitCents
                ? ` Passou ${formatBRL(benefit.spentCents - benefit.limitCents)} do cartão, então essa parte saiu do seu bolso.`
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
            <CardTitle
              label={`${g === 'poupanca' ? 'Meta' : 'Teto'} de ${group.idealPct}% da renda`}
              title={GROUP_LABEL[g]}
              hint={`${formatBRL(group.spentCents)} de ${formatBRL(group.idealCents)}`}
              right={
                <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: `${g !== 'poupanca' && group.spentCents > group.idealCents ? t.over : t.ok}26` }}>
                  <Txt color={g !== 'poupanca' && group.spentCents > group.idealCents ? t.over : t.ok} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800' }}>{group.actualPct.toFixed(0)}%</Txt>
                </View>
              }
            />
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
                    <Txt style={{ fontWeight: '600' }} numberOfLines={2}>{u.category.name}</Txt>
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
        <CardTitle label="Colchão" title="Reserva de emergência" />
        <Txt variant="muted">Seu custo pra viver é {formatBRL(emergency.essentialCents)}/mês (média dos últimos meses). Pra 6 meses, a meta é {formatBRL(emergency.targetCents)}.</Txt>
        <Bar ratio={emergency.progress} color={t.poupanca} height={10} />
        <Txt variant="small">Você tem {formatBRL(emergency.balanceCents)}, o que dá {emergency.monthsCovered.toFixed(1).replace('.', ',')} mês. Separando {formatBRL(emergency.suggestedMonthlyCents)} por mês, em um ano você chega lá.</Txt>
        <Button title="Atualizar quanto eu tenho guardado" variant="ghost" onPress={() => router.push('/ajustes')} />
      </Card>
      </Appear>

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }} onPress={() => setEditing(null)}>
          <Pressable style={{ backgroundColor: t.bg, borderRadius: radius.lg, borderWidth: 1, borderColor: t.cardBorder, padding: 20, gap: 14 }} onPress={() => {}}>
            <Txt variant="h2">Limite de {editing?.category.name}</Txt>
            <Txt variant="muted">Eu sugiro {editing ? formatBRL(Math.round((summary.baseIncomeCents * editing.category.idealPct) / 100)) : ''}, que é {editing?.category.idealPct}% da sua renda. Mas o limite é seu: bota o que fizer sentido.</Txt>
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
              title="Voltar pro que eu sugiro"
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

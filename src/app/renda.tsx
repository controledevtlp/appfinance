import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, TextInput, View } from 'react-native';
import { Appear, Bar, Press } from '@/components/motion';
import { Button, Card, Chip, Icon, MoneyField, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { currentMonthKey, monthLabel, todayISO } from '@/engine/dates';
import { formatBRL, parseMoneyToCents } from '@/engine/money';
import type { IncomeSource } from '@/engine/types';
import { notify } from '@/lib/dialog';
import { radius, useTheme } from '@/theme';

interface Draft extends IncomeSource {
  /** Texto cru do campo, para não atrapalhar quem está digitando. */
  raw: string;
  categoryId: string;
}

const PRESETS = [
  { label: 'Salário', icon: 'cash', categoryId: 'salario' },
  { label: 'Freelance', icon: 'laptop', categoryId: 'renda_extra' },
  { label: 'Aluguel recebido', icon: 'home', categoryId: 'outras_receitas' },
  { label: 'Benefício', icon: 'gift', categoryId: 'outras_receitas' },
  { label: 'Pensão', icon: 'people', categoryId: 'outras_receitas' },
  { label: 'Outro', icon: 'add-circle', categoryId: 'outras_receitas' },
];

let seq = 0;
const newId = () => `src-${Date.now().toString(36)}-${seq++}`;

export default function Renda() {
  const t = useTheme();
  const { settings, saveSettings, addTransactions, transactions, month } = useApp();

  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const saved = settings.incomeSources;
    if (saved.length) return saved.map((s) => ({ ...s, raw: (s.cents / 100).toFixed(2).replace('.', ','), categoryId: 'salario' }));
    const total = settings.monthlyIncomeCents;
    return [{ id: newId(), label: 'Salário', cents: total, raw: total ? (total / 100).toFixed(2).replace('.', ',') : '', categoryId: 'salario' }];
  });
  const [benefit, setBenefit] = useState(() =>
    settings.mealBenefitCents ? (settings.mealBenefitCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [alsoPost, setAlsoPost] = useState(false);
  const [busy, setBusy] = useState(false);

  const target = currentMonthKey();
  const alreadyHasIncome = useMemo(
    () => transactions.some((x) => x.type === 'income' && x.date.slice(0, 7) === target),
    [transactions, target],
  );

  const totalCents = drafts.reduce((a, d) => a + (parseMoneyToCents(d.raw) ?? 0), 0);
  const benefitCents = Math.max(0, parseMoneyToCents(benefit) ?? 0);
  const split = {
    necessidades: Math.round(totalCents * 0.5),
    desejos: Math.round(totalCents * 0.3),
    poupanca: Math.round(totalCents * 0.2),
  };

  const update = (id: string, patch: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setDrafts((d) => (d.length > 1 ? d.filter((x) => x.id !== id) : d));
  const addSource = (p: (typeof PRESETS)[number]) =>
    setDrafts((d) => [...d, { id: newId(), label: p.label, cents: 0, raw: '', categoryId: p.categoryId }]);

  const save = async () => {
    if (totalCents <= 0) {
      notify('Falta o valor', 'Preenche pelo menos uma entrada com valor maior que zero.');
      return;
    }
    setBusy(true);
    try {
      const sources: IncomeSource[] = drafts
        .map((d) => ({ id: d.id, label: d.label.trim() || 'Renda', cents: parseMoneyToCents(d.raw) ?? 0 }))
        .filter((s) => s.cents > 0);
      await saveSettings({ ...settings, monthlyIncomeCents: totalCents, incomeSources: sources, mealBenefitCents: benefitCents });

      if (alsoPost) {
        const withCategory = new Map(drafts.map((d) => [d.id, d.categoryId]));
        await addTransactions(
          sources.map((s) => ({
            date: todayISO(),
            description: s.label,
            amountCents: s.cents,
            type: 'income' as const,
            categoryId: withCategory.get(s.id) ?? 'outras_receitas',
            source: 'manual' as const,
            externalId: null,
          })),
        );
      }
      notify(
        'Beleza, anotado!',
        benefitCents > 0
          ? `Vou calcular tudo em cima de ${formatBRL(totalCents)}, mais ${formatBRL(benefitCents)} do cartão alimentação.`
          : `Agora os limites saem todos em cima de ${formatBRL(totalCents)}.`,
        () => router.back(),
      );
    } catch (e) {
      notify('Erro ao salvar', (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Appear index={0}>
          <Card style={{ backgroundColor: t.primary, borderColor: t.primary }}>
            <Txt variant="muted" color={t.primaryText}>O que você recebe por mês</Txt>
            <Txt variant="big" color={t.primaryText}>{formatBRL(totalCents)}</Txt>
            <Txt variant="small" color={t.primaryText}>
              É o que cai na conta depois dos descontos. Soma tudo que entra certinho todo mês.
            </Txt>
          </Card>
        </Appear>

        <Appear index={1}>
          <Card>
            <Txt variant="h2">De onde vem essa grana</Txt>
            {drafts.map((d, i) => (
              <View key={d.id} style={{ gap: 8, paddingTop: i ? 10 : 0, borderTopWidth: i ? 1 : 0, borderColor: t.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={d.label}
                    onChangeText={(v) => update(d.id, { label: v })}
                    placeholder="Nome (ex.: Salário)"
                    placeholderTextColor={t.muted}
                    style={{ flex: 1, color: t.text, fontSize: 15, fontWeight: '600', paddingVertical: 6 }}
                  />
                  {drafts.length > 1 ? (
                    <Press onPress={() => remove(d.id)} hitSlop={10} accessibilityLabel={`Remover ${d.label}`}>
                      <Icon name="close-circle" color={t.muted} size={22} />
                    </Press>
                  ) : null}
                </View>
                <MoneyField value={d.raw} onChangeText={(v) => update(d.id, { raw: v })} autoFocus={i === 0 && !d.raw} />
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
              {PRESETS.map((p) => (
                <Chip key={p.label} label={p.label} icon={p.icon} onPress={() => addSource(p)} />
              ))}
            </View>
            <Txt variant="small">Toca pra somar outra entrada.</Txt>
          </Card>
        </Appear>

        <Appear index={2}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt variant="h2">Benefícios da empresa</Txt>
                <Txt variant="small">Esse dinheiro é preso: não dá pra pagar aluguel nem investir com ele.</Txt>
              </View>
              <Icon name="fast-food" color={t.primary} size={22} />
            </View>
            <MoneyField
              label="Cartão alimentação / refeição (limite mensal)"
              value={benefit}
              onChangeText={setBenefit}
              hint="O que a empresa deposita por mês. Serve pra mercado, lanche e restaurante."
            />
            {benefitCents > 0 ? (
              <View style={{ backgroundColor: t.soft, borderRadius: radius.md, padding: 12, gap: 4 }}>
                <Txt variant="small" style={{ fontWeight: '700' }}>COMO ISSO ENTRA NA CONTA</Txt>
                <Txt variant="small">
                  Esses {formatBRL(benefitCents)} não entram na renda livre, porque você não paga aluguel nem investe com eles.
                  O que eles fazem é aumentar o teto de mercado e comida fora, e contar no quanto sobrou no fim do mês.
                </Txt>
              </View>
            ) : null}
          </Card>
        </Appear>

        {totalCents > 0 ? (
          <Appear index={3}>
            <Card>
              <Txt variant="h2">O que dá pra gastar com isso</Txt>
              <Txt variant="small">É a divisão 50/30/20 na sua renda, mudando enquanto você digita.</Txt>
              <SplitRow label="Necessidades" hint="moradia, mercado, transporte, saúde" cents={split.necessidades} pct={50} color={t.necessidades} delay={0} />
              <SplitRow label="Desejos" hint="delivery, lazer, compras, assinaturas" cents={split.desejos} pct={30} color={t.desejos} delay={80} />
              <SplitRow label="Poupança" hint="reserva de emergência e investimentos" cents={split.poupanca} pct={20} color={t.poupanca} delay={160} />
            </Card>
          </Appear>
        ) : null}

        <Appear index={4}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>Lançar como receita de {monthLabel(target)}</Txt>
                <Txt variant="small">
                  {alreadyHasIncome
                    ? 'Cuidado: você já tem entradas lançadas esse mês, isso vai somar de novo.'
                    : 'Cria as entradas no mês, pra o saldo fechar direitinho.'}
                </Txt>
              </View>
              <Switch value={alsoPost} onValueChange={setAlsoPost} trackColor={{ true: t.primary, false: t.border }} />
            </View>
          </Card>
        </Appear>

        <Button title="Salvar renda" onPress={save} loading={busy} />
        {month !== target ? (
          <Txt variant="small" style={{ textAlign: 'center' }}>
            O que você colocar aqui vale de referência pra todos os meses.
          </Txt>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SplitRow({ label, hint, cents, pct, color, delay }: { label: string; hint: string; cents: number; pct: number; color: string; delay: number }) {
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Txt style={{ fontWeight: '600' }}>{label} <Txt variant="muted">{pct}%</Txt></Txt>
        <Txt style={{ fontWeight: '700' }} color={color}>{formatBRL(cents)}</Txt>
      </View>
      <Bar ratio={pct / 50} color={color} height={6} delay={delay} />
      <Txt variant="small">{hint}</Txt>
    </View>
  );
}

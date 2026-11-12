import { router } from 'expo-router';
import { View } from 'react-native';
import { Donut, MonthlyBars, SpendingPace } from '@/components/charts';
import { Appear, Bar, Press } from '@/components/motion';
import { Button, Card, Empty, Icon, MonthSwitcher, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { currentMonthKey, daysInMonth } from '@/engine/dates';
import { formatBRL } from '@/engine/money';
import { confirmDialog, notify } from '@/lib/dialog';
import { useTheme } from '@/theme';

const PALETTE = ['#0F766E', '#D97706', '#2563EB', '#9333EA', '#DB2777', '#64748B'];

export default function Painel() {
  const t = useTheme();
  const {
    month, setMonth, summary, tips, health, series, transactions,
    loadDemo, settings, emergency, pace, budgetCents, recurringCents,
  } = useApp();

  const hasData = transactions.length > 0;
  const isCurrent = month === currentMonthKey();
  const groupColor = { necessidades: t.necessidades, desejos: t.desejos, poupanca: t.poupanca } as const;

  const top = (() => {
    const sorted = summary.categories
      .filter((c) => c.spentCents > 0 && c.category.group !== 'poupanca')
      .sort((a, b) => b.spentCents - a.spentCents);
    const head = sorted.slice(0, 5).map((c, i) => ({ name: c.category.name, value: c.spentCents, color: PALETTE[i] }));
    const rest = sorted.slice(5).reduce((a, c) => a + c.spentCents, 0);
    return rest > 0 ? [...head, { name: 'Outras', value: rest, color: PALETTE[5] }] : head;
  })();

  const healthColor = !health ? t.muted : health.score >= 70 ? t.ok : health.score >= 50 ? t.warning : t.over;
  const topTips = tips.filter((x) => x.severity !== 'positivo').slice(0, 3);
  const last = pace[pace.length - 1];
  const paceDiff = last ? last.cumulativeCents - last.paceCents : 0;

  const tryDemo = () =>
    confirmDialog(
      'Carregar dados de exemplo?',
      'Vamos criar 4 meses de lançamentos fictícios para você conhecer o app. Dá para apagar depois em Ajustes.',
      () => void loadDemo().catch((e: Error) => notify('Erro', e.message)),
      { confirmText: 'Carregar' },
    );

  if (!hasData) {
    return (
      <Screen>
        <Appear>
          <Empty icon="rocket-outline" title="Vamos começar" text="Comece informando quanto você recebe por mês. Leva 30 segundos e já libera todos os cálculos.">
            <View style={{ gap: 8, alignSelf: 'stretch' }}>
              <Button title="Informar minha renda" icon="cash-outline" onPress={() => router.push('/renda')} />
              <Button title="Importar extrato (CSV/OFX)" icon="cloud-upload-outline" variant="ghost" onPress={() => router.push('/importar')} />
              <Button title="Adicionar lançamento" icon="add" variant="ghost" onPress={() => router.push('/transacao')} />
              <Button title="Ver com dados de exemplo" icon="sparkles-outline" variant="ghost" onPress={tryDemo} />
            </View>
          </Empty>
        </Appear>
      </Screen>
    );
  }

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={setMonth} />

      <Appear index={0}>
        <Card>
          <Txt variant="muted">Sobrou no mês</Txt>
          <Txt variant="big" color={summary.balanceCents >= 0 ? t.income : t.expense}>{formatBRL(summary.balanceCents)}</Txt>
          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
            <Stat label="Receitas" value={formatBRL(summary.incomeCents)} color={t.income} />
            <Stat label="Despesas" value={formatBRL(summary.expenseCents)} color={t.expense} />
            <Stat label="Investido" value={formatBRL(summary.investedCents)} color={t.poupanca} />
          </View>
        </Card>
      </Appear>

      {summary.baseIncomeCents === 0 ? (
        <Appear index={1}>
          <Card>
            <Txt variant="h2">Falta informar sua renda</Txt>
            <Txt variant="muted">Sem ela não dá para calcular quanto é saudável gastar em cada categoria.</Txt>
            <Button title="Informar minha renda" icon="cash-outline" onPress={() => router.push('/renda')} />
          </Card>
        </Appear>
      ) : null}

      {isCurrent && budgetCents > 0 && pace.length > 1 ? (
        <Appear index={1}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Txt variant="h2">Ritmo do mês</Txt>
                <Txt variant="small">Linha cheia: o quanto você já gastou. Tracejada: o ritmo que cabe no orçamento.</Txt>
              </View>
              <Icon name={paceDiff > 0 ? 'trending-up' : 'trending-down'} color={paceDiff > 0 ? t.over : t.ok} size={22} />
            </View>
            <SpendingPace points={pace} totalDays={daysInMonth(month)} />
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
              <Stat label={`Gasto até o dia ${last.day}`} value={formatBRL(last.cumulativeCents)} color={t.text} />
              <Stat label="Ritmo ideal" value={formatBRL(last.paceCents)} color={t.muted} />
            </View>
            <Txt variant="muted" color={paceDiff > 0 ? t.over : t.ok}>
              {paceDiff > 0
                ? `Você está ${formatBRL(paceDiff)} à frente do ritmo. Segurando os gastos variáveis dá para voltar à linha.`
                : `Você está ${formatBRL(-paceDiff)} abaixo do ritmo. Esse é o caminho.`}
            </Txt>
            {summary.projectedExpenseCents !== null ? (
              <Txt variant="small">Mantendo assim, o mês fecha em {formatBRL(summary.projectedExpenseCents)} de gastos.</Txt>
            ) : null}
          </Card>
        </Appear>
      ) : null}

      {health ? (
        <Appear index={2}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Donut size={96} thickness={12} slices={[{ value: health.score, color: healthColor }, { value: 100 - health.score, color: 'transparent' }]} center={String(health.score)} />
              <View style={{ flex: 1 }}>
                <Txt variant="muted">Saúde financeira</Txt>
                <Txt variant="title" color={healthColor}>{health.label}</Txt>
                <Txt variant="small">{isCurrent ? 'Parcial: o mês ainda não fechou, então a nota tende a ser otimista.' : 'Nota de 0 a 100 somando 4 critérios.'}</Txt>
              </View>
            </View>
            {health.parts.map((p, i) => (
              <View key={p.label} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt variant="muted">{p.label}</Txt>
                  <Txt variant="muted">{p.points}/{p.max}</Txt>
                </View>
                <Bar ratio={p.points / p.max} color={healthColor} height={6} delay={120 + i * 70} />
                <Txt variant="small">{p.detail}</Txt>
              </View>
            ))}
          </Card>
        </Appear>
      ) : null}

      <Appear index={3}>
        <Card>
          <Txt variant="h2">Regra 50/30/20</Txt>
          <Txt variant="small">Quanto da sua renda foi para cada grupo. O traço marca o ideal.</Txt>
          {summary.groups.map((g, i) => {
            const ratio = g.idealCents > 0 ? g.spentCents / g.idealCents : 0;
            const bad = g.group !== 'poupanca' && ratio > 1;
            return (
              <View key={g.group} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt style={{ fontWeight: '600' }}>{g.label} <Txt variant="muted">(ideal {g.idealPct}%)</Txt></Txt>
                  <Txt variant="muted" color={bad ? t.over : undefined}>{g.actualPct.toFixed(0)}% da renda</Txt>
                </View>
                <Bar ratio={ratio} markerAt={1} color={bad ? t.over : groupColor[g.group]} delay={i * 90} />
                <Txt variant="small">{formatBRL(g.spentCents)} de {formatBRL(g.idealCents)}{g.group === 'poupanca' ? ' (meta)' : ' (teto)'}</Txt>
              </View>
            );
          })}
        </Card>
      </Appear>

      {top.length > 0 ? (
        <Appear index={4}>
          <Card>
            <Txt variant="h2">Para onde vai o dinheiro</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Donut size={120} thickness={18} slices={top} center={formatBRL(summary.expenseCents).replace('R$ ', '')} sub="gastos" />
              <View style={{ flex: 1, gap: 8 }}>
                {top.map((s, i) => {
                  const share = s.value / Math.max(1, summary.expenseCents);
                  return (
                    <View key={s.name} style={{ gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                        <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{s.name}</Txt>
                        <Txt variant="small" style={{ fontWeight: '700' }}>{Math.round(share * 100)}%</Txt>
                      </View>
                      <Bar ratio={share} color={s.color} height={4} delay={200 + i * 60} />
                    </View>
                  );
                })}
              </View>
            </View>
          </Card>
        </Appear>
      ) : null}

      <Appear index={5}>
        <Card>
          <Txt variant="h2">Últimos 6 meses</Txt>
          <Txt variant="small">Barra verde: o que entrou. Vermelha: o que saiu.</Txt>
          <MonthlyBars data={series} />
        </Card>
      </Appear>

      {recurringCents > 0 ? (
        <Appear index={6}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h2">Gastos constantes</Txt>
              <Txt variant="muted">{summary.baseIncomeCents > 0 ? `${Math.round((recurringCents / summary.baseIncomeCents) * 100)}% da renda` : ''}</Txt>
            </View>
            <Txt variant="big" color={t.text}>{formatBRL(recurringCents)}</Txt>
            <Bar ratio={summary.baseIncomeCents > 0 ? recurringCents / summary.baseIncomeCents : 0} color={t.necessidades} markerAt={0.5} />
            <Txt variant="small">É o que sai todo mês independentemente do que você faça. Abaixo de 50% da renda, o orçamento respira.</Txt>
          </Card>
        </Appear>
      ) : null}

      <Appear index={7}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="h2">Reserva de emergência</Txt>
            <Txt variant="muted">{emergency.monthsCovered.toFixed(1).replace('.', ',')} de 6 meses</Txt>
          </View>
          <Bar ratio={emergency.progress} color={t.poupanca} height={10} delay={120} />
          <Txt variant="small">{formatBRL(settings.emergencyBalanceCents)} guardados · meta {formatBRL(emergency.targetCents)}</Txt>
        </Card>
      </Appear>

      {topTips.length > 0 ? (
        <Appear index={8}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h2">Dicas para você</Txt>
              <Press onPress={() => router.push('/dicas')} hitSlop={8}>
                <Txt variant="muted" color={t.primary} style={{ fontWeight: '700' }}>Ver todas</Txt>
              </Press>
            </View>
            {topTips.map((tip) => (
              <View key={tip.id} style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name={tip.severity === 'alerta' ? 'alert-circle' : tip.severity === 'atencao' ? 'warning' : 'information-circle'} color={tip.severity === 'alerta' ? t.over : tip.severity === 'atencao' ? t.warning : t.info} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>{tip.title}</Txt>
                  {tip.savingsCents > 0 ? <Txt variant="small">Economia possível: {formatBRL(tip.savingsCents)}/mês</Txt> : null}
                </View>
              </View>
            ))}
          </Card>
        </Appear>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View>
      <Txt variant="small">{label}</Txt>
      <Txt style={{ fontWeight: '700' }} color={color}>{value}</Txt>
    </View>
  );
}

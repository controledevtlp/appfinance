import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { BarsChart, Donut } from '@/components/charts';
import { Button, Card, Empty, Icon, MonthSwitcher, Progress, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { confirmDialog, notify } from '@/lib/dialog';
import { currentMonthKey } from '@/engine/dates';
import { formatBRL } from '@/engine/money';
import { useTheme } from '@/theme';

const PALETTE = ['#0F766E', '#D97706', '#2563EB', '#9333EA', '#DB2777', '#64748B'];

export default function Painel() {
  const t = useTheme();
  const { month, setMonth, summary, tips, health, series, transactions, loadDemo, settings, emergency } = useApp();

  const hasData = transactions.length > 0;
  const groupColor = { necessidades: t.necessidades, desejos: t.desejos, poupanca: t.poupanca } as const;

  const spendingSlices = (() => {
    const sorted = summary.categories.filter((c) => c.spentCents > 0 && c.category.group !== 'poupanca').sort((a, b) => b.spentCents - a.spentCents);
    const top = sorted.slice(0, 5).map((c, i) => ({ name: c.category.name, value: c.spentCents, color: PALETTE[i] }));
    const rest = sorted.slice(5).reduce((a, c) => a + c.spentCents, 0);
    return rest > 0 ? [...top, { name: 'Outras', value: rest, color: PALETTE[5] }] : top;
  })();

  const healthColor = !health ? t.muted : health.score >= 70 ? t.ok : health.score >= 50 ? t.warning : t.over;
  const topTips = tips.filter((x) => x.severity !== 'positivo').slice(0, 3);

  const tryDemo = () =>
    confirmDialog('Carregar dados de exemplo?', 'Vamos criar 4 meses de lançamentos fictícios para você conhecer o app. Você pode apagá-los depois em Ajustes.', () => {
      loadDemo().catch((e: Error) => notify('Erro', e.message));
    }, { confirmText: 'Carregar' });

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={setMonth} />

      {!hasData ? (
        <Empty icon="rocket-outline" title="Vamos começar" text="Adicione seus lançamentos, importe o extrato do banco ou veja o app com dados de exemplo.">
          <View style={{ gap: 8, alignSelf: 'stretch' }}>
            <Button title="Importar extrato (CSV/OFX)" icon="cloud-upload-outline" onPress={() => router.push('/importar')} />
            <Button title="Adicionar lançamento" icon="add" variant="ghost" onPress={() => router.push('/transacao')} />
            <Button title="Ver com dados de exemplo" icon="sparkles-outline" variant="ghost" onPress={tryDemo} />
          </View>
        </Empty>
      ) : (
        <>
          <Card>
            <Txt variant="muted">Sobrou no mês</Txt>
            <Txt variant="big" color={summary.balanceCents >= 0 ? t.income : t.expense}>{formatBRL(summary.balanceCents)}</Txt>
            <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
              <Stat label="Receitas" value={formatBRL(summary.incomeCents)} color={t.income} />
              <Stat label="Despesas" value={formatBRL(summary.expenseCents)} color={t.expense} />
              <Stat label="Investido" value={formatBRL(summary.investedCents)} color={t.poupanca} />
            </View>
            {summary.projectedExpenseCents !== null ? (
              <Txt variant="small">No ritmo atual, os gastos devem fechar o mês em {formatBRL(summary.projectedExpenseCents)}.</Txt>
            ) : null}
          </Card>

          {summary.baseIncomeCents === 0 ? (
            <Card>
              <Txt variant="h2">Informe sua renda</Txt>
              <Txt variant="muted">Sem a renda líquida não dá para calcular quanto gastar em cada categoria.</Txt>
              <Button title="Definir renda em Ajustes" variant="ghost" onPress={() => router.push('/ajustes')} />
            </Card>
          ) : null}

          {health ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Donut size={96} thickness={12} slices={[{ value: health.score, color: healthColor }, { value: 100 - health.score, color: 'transparent' }]} center={String(health.score)} />
                <View style={{ flex: 1 }}>
                  <Txt variant="muted">Saúde financeira</Txt>
                  <Txt variant="title" color={healthColor}>{health.label}</Txt>
                  <Txt variant="small">{month === currentMonthKey() ? 'Parcial: o mês ainda não fechou, então a nota tende a ser otimista.' : 'Nota de 0 a 100 calculada com 4 critérios.'}</Txt>
                </View>
              </View>
              {health.parts.map((p) => (
                <View key={p.label} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt variant="muted">{p.label}</Txt>
                    <Txt variant="muted">{p.points}/{p.max}</Txt>
                  </View>
                  <Progress ratio={p.points / p.max} color={healthColor} height={6} />
                  <Txt variant="small">{p.detail}</Txt>
                </View>
              ))}
            </Card>
          ) : null}

          <Card>
            <Txt variant="h2">Regra 50/30/20</Txt>
            <Txt variant="small">A barra mostra quanto da sua renda foi para cada grupo; o traço marca o ideal.</Txt>
            {summary.groups.map((g) => {
              const ratio = g.idealCents > 0 ? g.spentCents / g.idealCents : 0;
              const bad = g.group !== 'poupanca' && ratio > 1;
              return (
                <View key={g.group} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Txt style={{ fontWeight: '600' }}>{g.label} <Txt variant="muted">(ideal {g.idealPct}%)</Txt></Txt>
                    <Txt variant="muted">{g.actualPct.toFixed(0)}% da renda</Txt>
                  </View>
                  <Progress ratio={ratio} markerAt={1} color={bad ? t.over : groupColor[g.group]} />
                  <Txt variant="small">{formatBRL(g.spentCents)} de {formatBRL(g.idealCents)}{g.group === 'poupanca' ? ' (meta)' : ' (teto)'}</Txt>
                </View>
              );
            })}
          </Card>

          {spendingSlices.length > 0 ? (
            <Card>
              <Txt variant="h2">Para onde vai o dinheiro</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                <Donut size={130} thickness={20} slices={spendingSlices} center={formatBRL(summary.expenseCents).replace('R$ ', '')} sub="gastos" />
                <View style={{ flex: 1, gap: 6 }}>
                  {spendingSlices.map((s) => (
                    <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
                      <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{s.name}</Txt>
                      <Txt variant="small">{Math.round((s.value / Math.max(1, summary.expenseCents)) * 100)}%</Txt>
                    </View>
                  ))}
                </View>
              </View>
            </Card>
          ) : null}

          <Card>
            <Txt variant="h2">Últimos 6 meses</Txt>
            <BarsChart data={series} />
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Legend color={t.income} label="Receitas" />
              <Legend color={t.expense} label="Despesas" />
            </View>
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h2">Reserva de emergência</Txt>
              <Txt variant="muted">{emergency.monthsCovered.toFixed(1).replace('.', ',')} de 6 meses</Txt>
            </View>
            <Progress ratio={emergency.progress} color={t.poupanca} />
            <Txt variant="small">{formatBRL(settings.emergencyBalanceCents)} guardados · meta {formatBRL(emergency.targetCents)}</Txt>
          </Card>

          {topTips.length > 0 ? (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt variant="h2">Dicas para você</Txt>
                <Pressable onPress={() => router.push('/dicas')} hitSlop={8}>
                  <Txt variant="muted" color={t.primary} style={{ fontWeight: '700' }}>Ver todas</Txt>
                </Pressable>
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
          ) : null}
        </>
      )}
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

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Txt variant="small">{label}</Txt>
    </View>
  );
}

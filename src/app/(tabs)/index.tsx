import { router } from 'expo-router';
import { View } from 'react-native';
import { Donut, MonthlyBars, SpendingPace } from '@/components/charts';
import { Appear, Bar, MoneyTicker, Press } from '@/components/motion';
import { Button, Card, CardTitle, Empty, Icon, MonthSwitcher, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { currentMonthKey, daysInMonth } from '@/engine/dates';
import { formatBRL, formatBRLShort } from '@/engine/money';
import { confirmDialog, notify } from '@/lib/dialog';
import { useTheme } from '@/theme';

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
    const head = sorted.slice(0, 5).map((c, i) => ({ name: c.category.name, value: c.spentCents, color: t.chart[i], categoryId: c.category.id }));
    const rest = sorted.slice(5).reduce((a, c) => a + c.spentCents, 0);
    return rest > 0 ? [...head, { name: 'Outras', value: rest, color: t.chart[5], categoryId: undefined }] : head;
  })();

  const healthColor = !health ? t.muted : health.score >= 70 ? t.ok : health.score >= 50 ? t.warning : t.over;
  const topTips = tips.filter((x) => x.severity !== 'positivo').slice(0, 3);
  const last = pace[pace.length - 1];
  const paceDiff = last ? last.cumulativeCents - last.paceCents : 0;

  const tryDemo = () =>
    confirmDialog(
      'Quer ver com dados de mentira?',
      'Vou criar 4 meses de lançamentos fictícios só pra você passear pelo app. Depois é só apagar em Ajustes.',
      () => void loadDemo().catch((e: Error) => notify('Erro', e.message)),
      { confirmText: 'Carregar' },
    );

  if (!hasData) {
    return (
      <Screen>
        <Appear>
          <Empty icon="rocket-outline" title="Bora começar" text="Me conta quanto você recebe por mês. Leva 30 segundos e já destrava tudo aqui dentro.">
            <View style={{ gap: 8, alignSelf: 'stretch' }}>
              <Button title="Quanto eu ganho por mês" icon="cash-outline" onPress={() => router.push('/renda')} />
              <Button title="Importar extrato (CSV/OFX)" icon="cloud-upload-outline" variant="ghost" onPress={() => router.push('/importar')} />
              <Button title="Adicionar lançamento" icon="add" variant="ghost" onPress={() => router.push('/transacao')} />
              <Button title="Só dar uma olhada antes" icon="sparkles-outline" variant="ghost" onPress={tryDemo} />
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
        <Card tone={[t.heroFrom, t.heroTo]} strength={1.3}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="label" color={t.heroText} style={{ opacity: 0.8 }}>Sobrou no mês</Txt>
            <Icon name={summary.balanceCents >= 0 ? 'trending-up' : 'trending-down'} size={18} color={t.heroText} />
          </View>
          <MoneyTicker cents={summary.balanceCents} style={{ fontSize: 40, lineHeight: 48, fontWeight: '800', letterSpacing: -1.4, color: t.heroText }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
            <HeroStat label="Entrou" value={formatBRL(summary.incomeCents).replace('R$ ', '')} drill={{ kind: 'income' }} />
            <HeroStat label="Saiu" value={formatBRL(summary.expenseCents).replace('R$ ', '')} drill={{ kind: 'expense' }} />
            <HeroStat label="Guardado" value={formatBRL(summary.investedCents).replace('R$ ', '')} drill={{ kind: 'invested' }} />
          </View>
        </Card>
      </Appear>

      {summary.baseIncomeCents === 0 ? (
        <Appear index={1}>
          <Card>
            <Txt variant="h2">Falta me contar quanto você ganha</Txt>
            <Txt variant="muted">Sem isso eu não consigo dizer quanto dá pra gastar em cada coisa.</Txt>
            <Button title="Quanto eu ganho por mês" icon="cash-outline" onPress={() => router.push('/renda')} />
          </Card>
        </Appear>
      ) : null}

      {isCurrent && budgetCents > 0 && pace.length > 1 ? (
        <Appear index={1}>
          <Card>
            <CardTitle
              label="Ritmo do mês"
              title="Você tá indo rápido?"
              hint="A linha cheia é o que você já gastou. A tracejada é o ritmo que cabe no seu mês."
              right={<Icon name={paceDiff > 0 ? 'trending-up' : 'trending-down'} color={paceDiff > 0 ? t.over : t.ok} size={22} />}
            />
            <SpendingPace points={pace} totalDays={daysInMonth(month)} />
            <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap' }}>
              <Stat label={`Gasto até o dia ${last.day}`} value={formatBRL(last.cumulativeCents)} color={t.text} drill={{ kind: 'expense' }} />
              <Stat label="Ritmo ideal" value={formatBRL(last.paceCents)} color={t.muted} />
            </View>
            <Txt variant="muted" color={paceDiff > 0 ? t.over : t.ok}>
              {paceDiff > 0
                ? `Você tá ${formatBRL(paceDiff)} na frente do ritmo. Segurando um pouco os gastos variáveis dá pra voltar pra linha.`
                : `Você tá ${formatBRL(-paceDiff)} abaixo do ritmo. É isso aí, continua assim.`}
            </Txt>
            {summary.projectedExpenseCents !== null ? (
              <Txt variant="small">Mantendo esse ritmo, o mês fecha em {formatBRL(summary.projectedExpenseCents)} de gasto.</Txt>
            ) : null}
          </Card>
        </Appear>
      ) : null}

      {health ? (
        <Appear index={2}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Donut size={104} thickness={11} centerSize={0.3} slices={[{ value: health.score, color: healthColor }, { value: 100 - health.score, color: 'transparent' }]} center={String(health.score)} />
              <View style={{ flex: 1, gap: 3 }}>
                <Txt variant="label">Como tá sua grana</Txt>
                <Txt variant="title" color={healthColor} style={{ fontSize: 24, lineHeight: 30 }}>{health.label}</Txt>
                <Txt variant="small">{isCurrent ? 'Nota parcial: o mês ainda não acabou, então ela tende a ser otimista.' : 'Nota de 0 a 100, somando 4 critérios.'}</Txt>
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
          <CardTitle label="A regra 50/30/20" title="Pra onde sua renda foi" hint="O risquinho em cada barra marca o ideal." />
          {summary.groups.map((g, i) => {
            const ratio = g.idealCents > 0 ? g.spentCents / g.idealCents : 0;
            const bad = g.group !== 'poupanca' && ratio > 1;
            return (
              <Press key={g.group} onPress={() => router.push({ pathname: '/detalhe', params: { group: g.group } })} style={{ gap: 6 }} accessibilityLabel={`Ver gastos de ${g.label}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt style={{ fontWeight: '600' }}>{g.label} <Txt variant="muted">(ideal {g.idealPct}%)</Txt></Txt>
                  <Txt variant="muted" color={bad ? t.over : undefined}>{g.actualPct.toFixed(0)}% da renda</Txt>
                </View>
                <Bar ratio={ratio} markerAt={1} color={bad ? t.over : groupColor[g.group]} delay={i * 90} />
                <Txt variant="small">{formatBRL(g.spentCents)} de {formatBRL(g.idealCents)}{g.group === 'poupanca' ? ' (meta)' : ' (teto)'}</Txt>
              </Press>
            );
          })}
        </Card>
      </Appear>

      {top.length > 0 ? (
        <Appear index={4}>
          <Card>
            <CardTitle label="Top 5" title="Onde a grana foi parar" />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Donut size={122} thickness={17} centerSize={0.2} slices={top} center={formatBRLShort(summary.expenseCents).replace('R$ ', '')} sub="gastos" />
              <View style={{ flex: 1, gap: 8 }}>
                {top.map((s, i) => {
                  const share = s.value / Math.max(1, summary.expenseCents);
                  return (
                    <Press
                      key={s.name}
                      disabled={!s.categoryId}
                      onPress={() => s.categoryId && router.push({ pathname: '/detalhe', params: { categoryId: s.categoryId } })}
                      style={{ gap: 3 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
                        <Txt variant="small" style={{ flex: 1 }} numberOfLines={1}>{s.name}</Txt>
                        <Txt variant="small" style={{ fontWeight: '700' }}>{Math.round(share * 100)}%</Txt>
                      </View>
                      <Bar ratio={share} color={s.color} height={4} delay={200 + i * 60} />
                    </Press>
                  );
                })}
              </View>
            </View>
          </Card>
        </Appear>
      ) : null}

      <Appear index={5}>
        <Card>
          <CardTitle label="Últimos 6 meses" title="Entrou × saiu" />
          <MonthlyBars data={series} />
        </Card>
      </Appear>

      {recurringCents > 0 ? (
        <Appear index={6}>
          <Press onPress={() => router.push({ pathname: '/detalhe', params: { kind: 'recurring' } })}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="h2">Gastos constantes</Txt>
              <Txt variant="muted">{summary.baseIncomeCents > 0 ? `${Math.round((recurringCents / summary.baseIncomeCents) * 100)}% da renda` : ''}</Txt>
            </View>
            <MoneyTicker cents={recurringCents} style={{ fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -0.8, color: t.textStrong }} />
            <Bar ratio={summary.baseIncomeCents > 0 ? recurringCents / summary.baseIncomeCents : 0} color={t.necessidades} markerAt={0.5} />
            <Txt variant="small">É o que sai todo mês, faça chuva ou faça sol. Abaixo de 50% da renda, o orçamento respira.</Txt>
          </Card>
          </Press>
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
              <Txt variant="h2">Umas dicas pra você</Txt>
              <Press onPress={() => router.push('/dicas')} hitSlop={8}>
                <Txt variant="muted" color={t.primary} style={{ fontWeight: '700' }}>Ver todas</Txt>
              </Press>
            </View>
            {topTips.map((tip) => (
              <Press
                key={tip.id}
                disabled={!tip.categoryId}
                onPress={() => tip.categoryId && router.push({ pathname: '/detalhe', params: { categoryId: tip.categoryId } })}
                style={{ flexDirection: 'row', gap: 10 }}>
                <Icon name={tip.severity === 'alerta' ? 'alert-circle' : tip.severity === 'atencao' ? 'warning' : 'information-circle'} color={tip.severity === 'alerta' ? t.over : tip.severity === 'atencao' ? t.warning : t.info} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>{tip.title}</Txt>
                  {tip.savingsCents > 0 ? <Txt variant="small">Dá pra guardar {formatBRL(tip.savingsCents)}/mês</Txt> : null}
                </View>
              </Press>
            ))}
          </Card>
        </Appear>
      ) : null}
    </Screen>
  );
}

/** Mini cartão dentro do cartão principal, com fundo translúcido. */
function HeroStat({ label, value, drill }: { label: string; value: string; drill: Record<string, string> }) {
  const t = useTheme();
  return (
    <Press
      onPress={() => router.push({ pathname: '/detalhe', params: drill })}
      accessibilityLabel={`Ver ${label}`}
      style={{ flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
      <View style={{ padding: 10, gap: 2 }}>
        <Txt variant="small" color={t.heroText} style={{ opacity: 0.75, fontSize: 11 }}>{label}</Txt>
        <Txt color={t.heroText} style={{ fontWeight: '800', fontSize: 15, letterSpacing: -0.3 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {value}
        </Txt>
      </View>
    </Press>
  );
}

/** Número solto do painel. Com `drill`, tocar abre a lista que formou o valor. */
function Stat({ label, value, color, drill }: { label: string; value: string; color: string; drill?: Record<string, string> }) {
  const t = useTheme();
  const body = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Txt variant="label" style={{ fontSize: 10 }}>{label}</Txt>
        {drill ? <Icon name="chevron-forward" size={11} color={t.muted} /> : null}
      </View>
      <Txt style={{ fontWeight: '800', fontSize: 17, letterSpacing: -0.4 }} color={color}>{value}</Txt>
    </View>
  );
  if (!drill) return body;
  return (
    <Press onPress={() => router.push({ pathname: '/detalhe', params: drill })} accessibilityLabel={`Ver ${label}`}>
      {body}
    </Press>
  );
}

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Donut, Gauge, MonthlyBars, Ring, Sparkline, SpendingPace } from '@/components/charts';
import { GradientPill } from '@/components/glass';
import { Appear, Bar, MoneyTicker, Press } from '@/components/motion';
import { Button, Card, CardTitle, DeltaChip, Empty, fitFontSize, Icon, MonthSwitcher, Screen, ScreenHeader, Txt, tap } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { samePeriodChange } from '@/engine/budget';
import { currentMonthKey, daysInMonth, monthLabel } from '@/engine/dates';
import { formatBRL, formatBRLShort } from '@/engine/money';
import { greeting, verdict, type Mood } from '@/engine/voice';
import { confirmDialog, notify } from '@/lib/dialog';
import { radius, useTheme } from '@/theme';

const MOOD_ICON: Record<Mood, string> = {
  pessimo: 'flame',
  ruim: 'alert-circle',
  atencao: 'warning',
  bom: 'thumbs-up',
  otimo: 'trophy',
};

export default function Painel() {
  const t = useTheme();
  const { width: screenW } = useWindowDimensions();
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
    // Nome curto: "Financiamento do carro/moto" não cabe na legenda de um celular.
    const head = sorted.slice(0, 5).map((c, i) => ({ name: c.category.short, value: c.spentCents, color: t.chart[i], categoryId: c.category.id }));
    const rest = sorted.slice(5).reduce((a, c) => a + c.spentCents, 0);
    return rest > 0 ? [...head, { name: 'Outras', value: rest, color: t.chart[5], categoryId: undefined }] : head;
  })();

  const healthColor = !health ? t.muted : health.score >= 70 ? t.ok : health.score >= 50 ? t.warning : t.over;
  const topTips = tips.filter((x) => x.severity !== 'positivo').slice(0, 3);
  const last = pace[pace.length - 1];
  const paceDiff = last ? last.cumulativeCents - last.paceCents : 0;

  const change = useMemo(() => samePeriodChange(transactions, month), [transactions, month]);
  const say = useMemo(
    () => verdict({ summary, paceDiffCents: paceDiff, paceCents: last?.paceCents ?? 0, isCurrent: isCurrent && budgetCents > 0 }),
    [summary, paceDiff, last?.paceCents, isCurrent, budgetCents],
  );
  const moodColor = !say ? t.muted : say.mood === 'pessimo' || say.mood === 'ruim' ? t.over : say.mood === 'atencao' ? t.warning : t.ok;

  // Mês em destaque no gráfico de barras. Volta para o último quando o mês da tela muda.
  // A escolha vale só para o mês em que foi feita, então não precisa de efeito para "resetar".
  const [picked, setPicked] = useState<{ month: string; index: number } | null>(null);
  const barIndex = picked && picked.month === month ? Math.min(picked.index, series.length - 1) : series.length - 1;
  const bar = series[barIndex];

  // O saldo tem de caber numa linha em qualquer celular: a fonte encolhe com o tamanho do número.
  const balanceText = formatBRL(summary.balanceCents);
  const heroSize = Math.min(38, (screenW - 68) / (balanceText.length * 0.58));

  const tryDemo = () =>
    confirmDialog(
      'Quer ver com dados de mentira?',
      'Vou criar 4 meses de lançamentos fictícios só pra você passear pelo app. Depois é só apagar em Ajustes.',
      () => void loadDemo().catch((e: Error) => notify('Erro', e.message)),
      { confirmText: 'Carregar' },
    );

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <GradientPill radius={16} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="leaf" size={22} color={t.primaryText} />
      </GradientPill>
      <View style={{ flex: 1 }}>
        <ScreenHeader eyebrow={`${greeting()}! Bora ver a grana`} title="Seu painel" />
      </View>
    </View>
  );

  if (!hasData) {
    return (
      <Screen>
        {header}
        <Appear>
          <Empty icon="rocket-outline" title="Bora começar" text="Me conta quanto você recebe por mês. Leva 30 segundos e já destrava tudo aqui dentro.">
            <View style={{ gap: 8, alignSelf: 'stretch' }}>
              <Button title="Quanto eu ganho por mês" icon="cash-outline" onPress={() => router.push('/renda')} />
              <Button title="Importar extrato (CSV/OFX/PDF)" icon="cloud-upload-outline" variant="ghost" onPress={() => router.push('/importar')} />
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
      {header}
      <MonthSwitcher month={month} onChange={setMonth} />

      <Appear index={0}>
        <Card tone={[t.heroFrom, t.heroTo]} strength={1.3}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="label" color={t.heroText} style={{ opacity: 0.85 }}>Sobrou no mês</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Icon name={summary.balanceCents >= 0 ? 'trending-up' : 'trending-down'} size={13} color={t.heroText} />
              <Txt color={t.heroText} style={{ fontSize: 11, lineHeight: 16, fontWeight: '700' }}>{summary.balanceCents >= 0 ? 'no azul' : 'no vermelho'}</Txt>
            </View>
          </View>
          <MoneyTicker cents={summary.balanceCents} style={{ fontSize: heroSize, lineHeight: heroSize * 1.22, fontWeight: '800', letterSpacing: -1.2, color: t.heroText }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, gap: 4 }}>
              {change.pct !== null ? (
                <>
                  <View style={{ flexDirection: 'row' }}>
                    <DeltaChip pct={change.pct} goodWhenDown onHero />
                  </View>
                  <Txt variant="small" color={t.heroText} style={{ opacity: 0.85 }}>
                    {Math.abs(change.pct) < 0.5
                      ? 'Gasto igual ao do mesmo período do mês passado.'
                      : `de gasto a ${change.pct > 0 ? 'mais' : 'menos'} que no mesmo período do mês passado.`}
                  </Txt>
                </>
              ) : (
                <Txt variant="small" color={t.heroText} style={{ opacity: 0.85 }}>Mês que vem eu já comparo com esse aqui.</Txt>
              )}
            </View>
            <View accessibilityLabel="Saldo dos últimos meses" style={{ alignItems: 'flex-end' }}>
              <Sparkline values={series.map((p) => p.incomeCents - p.expenseCents)} color={t.heroText} width={92} height={38} />
              <Txt color={t.heroText} style={{ fontSize: 9.5, lineHeight: 13, opacity: 0.7, fontWeight: '600' }}>saldo em 6 meses</Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 7, marginTop: 2 }}>
            <HeroStat label="Entrou" value={formatBRL(summary.incomeCents).replace('R$ ', '')} drill={{ kind: 'income' }} />
            <HeroStat label="Saiu" value={formatBRL(summary.expenseCents).replace('R$ ', '')} drill={{ kind: 'expense' }} />
            <HeroStat label="Guardado" value={formatBRL(summary.investedCents).replace('R$ ', '')} drill={{ kind: 'invested' }} />
          </View>
        </Card>
      </Appear>

      <Appear index={1}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <QuickAction icon="add" label="Lançar" onPress={() => router.push('/transacao')} />
          <QuickAction icon="cloud-upload-outline" label="Extrato" onPress={() => router.push('/importar')} />
          <QuickAction icon="cash-outline" label="Renda" onPress={() => router.push('/renda')} />
          <QuickAction icon="trending-up" label="Simular" onPress={() => router.push('/investir')} />
        </View>
      </Appear>

      {say ? (
        <Appear index={2}>
          <Press onPress={() => router.push('/dicas')} accessibilityLabel={`${say.title} ${say.text} Ver as dicas`}>
            <Card style={{ borderColor: `${moodColor}66`, backgroundColor: `${moodColor}1C` }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${moodColor}33` }}>
                  <Icon name={MOOD_ICON[say.mood]} size={21} color={moodColor} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt variant="label" color={moodColor}>Papo reto</Txt>
                  <Txt variant="h2" style={{ fontSize: 17, lineHeight: 23 }}>{say.title}</Txt>
                  <Txt variant="muted" color={t.text}>{say.text}</Txt>
                </View>
              </View>
            </Card>
          </Press>
        </Appear>
      ) : null}

      {summary.baseIncomeCents === 0 ? (
        <Appear index={2}>
          <Card>
            <Txt variant="h2">Falta me contar quanto você ganha</Txt>
            <Txt variant="muted">Sem isso eu não consigo dizer quanto dá pra gastar em cada coisa.</Txt>
            <Button title="Quanto eu ganho por mês" icon="cash-outline" onPress={() => router.push('/renda')} />
          </Card>
        </Appear>
      ) : null}

      {isCurrent && budgetCents > 0 && pace.length > 1 ? (
        <Appear index={3}>
          <Card>
            <CardTitle
              label="Ritmo do mês"
              title="Você tá indo rápido?"
              hint="Passa o dedo no gráfico pra ver dia a dia."
              right={
                <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: `${paceDiff > 0 ? t.over : t.ok}26` }}>
                  <Txt color={paceDiff > 0 ? t.over : t.ok} style={{ fontSize: 11, lineHeight: 15, fontWeight: '800' }}>{paceDiff > 0 ? 'rápido demais' : 'no ritmo'}</Txt>
                </View>
              }
            />
            <SpendingPace points={pace} totalDays={daysInMonth(month)} projectedCents={summary.projectedExpenseCents} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
              <LineKey color={paceDiff > 0 ? t.over : t.ok} label="O que você gastou" />
              <LineKey color={t.muted} label="Ritmo que cabe" dash />
              {summary.projectedExpenseCents !== null ? <LineKey color={summary.projectedExpenseCents > budgetCents ? t.over : t.ok} label="Pra onde vai" dots /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <Tile label="Gasto" value={formatBRL(last.cumulativeCents).replace('R$ ', '')} color={paceDiff > 0 ? t.over : t.ok} drill={{ kind: 'expense' }} />
              <Tile label="Ritmo ideal" value={formatBRL(last.paceCents).replace('R$ ', '')} color={t.muted} />
              {summary.projectedExpenseCents !== null ? (
                <Tile label="Previsão" value={formatBRL(summary.projectedExpenseCents).replace('R$ ', '')} color={summary.projectedExpenseCents > budgetCents ? t.over : t.ok} />
              ) : null}
            </View>
            {summary.projectedExpenseCents !== null ? (
              <Txt variant="small">
                {summary.projectedExpenseCents > budgetCents
                  ? `Do jeito que tá, o mês fecha ${formatBRL(summary.projectedExpenseCents - budgetCents)} acima do que cabe (${formatBRL(budgetCents)}). A previsão conta as contas fixas que ainda vão vencer.`
                  : `Do jeito que tá, o mês fecha ${formatBRL(budgetCents - summary.projectedExpenseCents)} abaixo do que cabe (${formatBRL(budgetCents)}). Segue assim.`}
              </Txt>
            ) : (
              <Txt variant="small">A previsão do fechamento aparece a partir do dia 5, quando já dá pra ver o ritmo.</Txt>
            )}
          </Card>
        </Appear>
      ) : null}

      {health ? (
        <Appear index={4}>
          <Card>
            <CardTitle
              label="Como tá sua grana"
              title="Sua nota do mês"
              hint={isCurrent ? 'Nota parcial: o mês ainda não acabou, então ela tende a ser otimista.' : 'De 0 a 100, somando os 4 critérios aqui de baixo.'}
            />
            <View style={{ alignItems: 'center' }}>
              <Gauge score={health.score} size={Math.min(214, screenW - 96)}>
                <Txt color={t.textStrong} style={{ fontSize: 44, lineHeight: 48, fontWeight: '800', letterSpacing: -1.6 }}>{health.score}</Txt>
                <Txt variant="small" style={{ fontWeight: '600' }}>de 100</Txt>
                <Txt color={healthColor} style={{ fontSize: 17, lineHeight: 23, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 }}>{health.label}</Txt>
              </Gauge>
            </View>
            {health.parts.map((p, i) => (
              <View key={p.label} style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt style={{ fontWeight: '600', fontSize: 14 }}>{p.label}</Txt>
                  <Txt variant="muted" style={{ fontWeight: '700' }}>{p.points}<Txt variant="small">/{p.max}</Txt></Txt>
                </View>
                <Bar ratio={p.points / p.max} color={p.points / p.max >= 0.7 ? t.ok : p.points / p.max >= 0.4 ? t.warning : t.over} height={6} delay={120 + i * 70} />
                <Txt variant="small">{p.detail}</Txt>
              </View>
            ))}
          </Card>
        </Appear>
      ) : null}

      <Appear index={5}>
        <Card>
          <CardTitle label="A regra 50/30/20" title="Pra onde sua renda foi" hint="O anel cheio é o teto de cada grupo. Passou da volta, estourou." />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {summary.groups.map((g, i) => {
              const ratio = g.idealCents > 0 ? g.spentCents / g.idealCents : 0;
              const saving = g.group === 'poupanca';
              const bad = !saving && ratio > 1;
              return (
                <Press
                  key={g.group}
                  onPress={() => router.push({ pathname: '/detalhe', params: { group: g.group } })}
                  style={{ flex: 1 }}
                  accessibilityLabel={`${g.label}: ${g.actualPct.toFixed(0)}% da renda, ideal ${g.idealPct}%. Ver gastos`}>
                  <View style={{ alignItems: 'center', gap: 5 }}>
                    <Ring ratio={ratio} color={groupColor[g.group]} overColor={saving ? undefined : t.over} size={Math.min(78, (screenW - 96) / 3)} delay={i * 110}>
                      <Txt color={bad ? t.over : t.textStrong} style={{ fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -0.5 }}>{g.actualPct.toFixed(0)}%</Txt>
                    </Ring>
                    <Txt numberOfLines={1} style={{ fontSize: 11.5, lineHeight: 16, fontWeight: '700' }}>{g.label}</Txt>
                    <Txt variant="small" style={{ fontSize: 10.5, lineHeight: 14 }}>{saving ? 'meta' : 'teto'} {g.idealPct}%</Txt>
                    <Txt numberOfLines={1} color={bad ? t.over : t.text} style={{ fontSize: fitFontSize(formatBRL(g.spentCents), 11.5, 9), lineHeight: 15, fontWeight: '700' }}>{formatBRL(g.spentCents)}</Txt>
                  </View>
                </Press>
              );
            })}
          </View>
        </Card>
      </Appear>

      {top.length > 0 ? (
        <Appear index={6}>
          <Card>
            <CardTitle label="Top 5" title="Onde a grana foi parar" hint="Toca numa categoria pra ver os lançamentos." />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Donut size={126} thickness={17} slices={top} center={formatBRLShort(summary.expenseCents).replace('R$ ', '')} sub="gastos" />
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
                        <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: s.color }} />
                        <Txt variant="small" color={t.text} style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{s.name}</Txt>
                        <Txt variant="small" color={t.text} style={{ fontWeight: '800' }}>{Math.round(share * 100)}%</Txt>
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

      <Appear index={7}>
        <Card>
          <CardTitle label="Últimos 6 meses" title="Entrou × saiu" hint="Toca num mês pra ver os números dele." />
          <MonthlyBars data={series} selected={barIndex} onSelect={(i) => { tap(); setPicked({ month, index: i }); }} />
          {bar ? (
            <View style={{ gap: 7 }}>
              <Txt variant="label">{monthLabel(bar.month)}</Txt>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <Tile label="Entrou" value={formatBRL(bar.incomeCents).replace('R$ ', '')} color={t.income} dot />
                <Tile label="Saiu" value={formatBRL(bar.expenseCents).replace('R$ ', '')} color={t.expense} dot />
                <Tile label="Sobrou" value={formatBRL(bar.incomeCents - bar.expenseCents).replace('R$ ', '')} color={bar.incomeCents - bar.expenseCents >= 0 ? t.text : t.over} />
              </View>
            </View>
          ) : null}
        </Card>
      </Appear>

      {recurringCents > 0 ? (
        <Appear index={8}>
          <Press onPress={() => router.push({ pathname: '/detalhe', params: { kind: 'recurring' } })}>
            <Card>
              <CardTitle
                label="Todo mês"
                title="Gastos constantes"
                right={summary.baseIncomeCents > 0 ? <Txt variant="muted" style={{ fontWeight: '700' }}>{Math.round((recurringCents / summary.baseIncomeCents) * 100)}% da renda</Txt> : undefined}
              />
              <MoneyTicker cents={recurringCents} style={{ fontSize: 28, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, color: t.textStrong }} />
              <Bar ratio={summary.baseIncomeCents > 0 ? recurringCents / summary.baseIncomeCents : 0} color={t.necessidades} markerAt={0.5} />
              <Txt variant="small">É o que sai todo mês, faça chuva ou faça sol. Abaixo de 50% da renda (o risquinho), o orçamento respira.</Txt>
            </Card>
          </Press>
        </Appear>
      ) : null}

      <Appear index={9}>
        <Card>
          <CardTitle
            label="Colchão"
            title="Reserva de emergência"
            right={<Txt variant="muted" style={{ fontWeight: '700' }}>{emergency.monthsCovered.toFixed(1).replace('.', ',')} de 6 meses</Txt>}
          />
          <Bar ratio={emergency.progress} color={t.poupanca} height={10} delay={120} />
          <Txt variant="small">{formatBRL(settings.emergencyBalanceCents)} guardados · meta {formatBRL(emergency.targetCents)}</Txt>
        </Card>
      </Appear>

      {topTips.length > 0 ? (
        <Appear index={10}>
          <Card>
            <CardTitle
              label="Sem enrolação"
              title="O que fazer agora"
              right={
                <Press onPress={() => router.push('/dicas')} hitSlop={8}>
                  <Txt variant="muted" color={t.primary} style={{ fontWeight: '800' }}>Ver todas</Txt>
                </Press>
              }
            />
            {topTips.map((tip) => {
              const c = tip.severity === 'alerta' ? t.over : tip.severity === 'atencao' ? t.warning : t.info;
              return (
                <Press
                  key={tip.id}
                  onPress={() => (tip.categoryId ? router.push({ pathname: '/detalhe', params: { categoryId: tip.categoryId } }) : router.push('/dicas'))}
                  style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${c}26` }}>
                    <Icon name={tip.severity === 'alerta' ? 'alert-circle' : tip.severity === 'atencao' ? 'warning' : 'information-circle'} size={18} color={c} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '700', fontSize: 14, lineHeight: 20 }}>{tip.title}</Txt>
                    {tip.savingsCents > 0 ? <Txt variant="small">Dá pra guardar {formatBRL(tip.savingsCents)}/mês</Txt> : null}
                  </View>
                  <Icon name="chevron-forward" size={15} color={t.muted} />
                </Press>
              );
            })}
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
      <View style={{ paddingHorizontal: 8, paddingVertical: 9, gap: 2 }}>
        <Txt variant="small" color={t.heroText} style={{ opacity: 0.78, fontSize: 11 }}>{label}</Txt>
        <Txt color={t.heroText} style={{ fontWeight: '800', fontSize: fitFontSize(value, 14.5), lineHeight: 20, letterSpacing: -0.3 }} numberOfLines={1}>
          {value}
        </Txt>
      </View>
    </Press>
  );
}

/** Atalho redondo logo abaixo do saldo: as quatro coisas que mais se faz no app. */
function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ flex: 1 }}>
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.md + 2, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: t.soft }}>
          <Icon name={icon} size={19} color={t.primary} />
        </View>
        <Txt numberOfLines={1} style={{ fontSize: 11.5, lineHeight: 15, fontWeight: '700' }}>{label}</Txt>
      </View>
    </Press>
  );
}

/** Legenda de uma linha do gráfico: cheia, tracejada ou pontilhada. */
function LineKey({ color, label, dash, dots }: { color: string; label: string; dash?: boolean; dots?: boolean }) {
  const pieces = dots ? [3, 3, 3] : dash ? [6, 6] : [16];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: dots ? 3 : 4, width: 18 }}>
        {pieces.map((w, i) => (
          <View key={i} style={{ width: w, height: 3, borderRadius: 2, backgroundColor: color }} />
        ))}
      </View>
      <Txt variant="small" style={{ fontSize: 11.5, lineHeight: 16 }}>{label}</Txt>
    </View>
  );
}

/** Caixinha com um número. Com `drill`, tocar abre a lista que formou o valor. */
function Tile({ label, value, color, drill, dot }: { label: string; value: string; color: string; drill?: Record<string, string>; dot?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ borderRadius: 14, paddingHorizontal: 9, paddingVertical: 9, gap: 2, backgroundColor: t.fieldBg, borderWidth: 1, borderColor: t.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : null}
        <Txt variant="small" numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 14, flexShrink: 1 }}>{label}</Txt>
        {drill ? <Icon name="chevron-forward" size={10} color={t.muted} /> : null}
      </View>
      <Txt numberOfLines={1} color={dot ? t.text : color} style={{ fontWeight: '800', fontSize: fitFontSize(value.replace('R$ ', ''), 14.5, 10), lineHeight: 20, letterSpacing: -0.3 }}>{value}</Txt>
    </View>
  );
  if (!drill) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Press onPress={() => router.push({ pathname: '/detalhe', params: drill })} accessibilityLabel={`Ver ${label}`} style={{ flex: 1 }}>
      {body}
    </Press>
  );
}

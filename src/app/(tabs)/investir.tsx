import { useMemo, useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { GrowthChart } from '@/components/charts';
import { Appear, Bar, Press } from '@/components/motion';
import { Card, CardTitle, Chip, fitFontSize, Icon, MoneyField, Screen, ScreenHeader, Txt, tap } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { buildPlan, monthlyForPlan, simulatePlan, type Access, type Goal, type Nerve } from '@/engine/advisor';
import { compareProducts, defaultProducts, type Comparison } from '@/engine/invest';
import { formatBRL, parseMoneyToCents } from '@/engine/money';
import { font, radius, useTheme } from '@/theme';

const PRAZOS = [
  { label: '6 meses', months: 6 },
  { label: '1 ano', months: 12 },
  { label: '2 anos', months: 24 },
  { label: '5 anos', months: 60 },
  { label: '10 anos', months: 120 },
];

const GOALS: { id: Goal; icon: string; label: string; hint: string; months: number }[] = [
  { id: 'reserva', icon: 'shield-checkmark', label: 'Reserva de emergência', hint: 'Pra quando der merda', months: 12 },
  { id: 'compra', icon: 'airplane', label: 'Comprar algo', hint: 'Viagem, carro, casa', months: 24 },
  { id: 'aposentadoria', icon: 'hourglass', label: 'Aposentadoria', hint: 'Lá na frente', months: 120 },
  { id: 'render', icon: 'trending-up', label: 'Só fazer render', hint: 'Sem data certa', months: 60 },
];

const ACCESS: { id: Access; icon: string; label: string; hint: string }[] = [
  { id: 'qualquer-hora', icon: 'flash', label: 'Posso precisar', hint: 'Quero sacar quando quiser' },
  { id: 'pode-travar', icon: 'lock-closed', label: 'Pode ficar preso', hint: 'Só mexo no fim do prazo' },
];

const NERVES: { id: Nerve; icon: string; label: string; hint: string }[] = [
  { id: 'nenhum', icon: 'bed', label: 'Não quero ver cair', hint: 'Prefiro dormir tranquilo' },
  { id: 'pouco', icon: 'pulse', label: 'Aguento um pouco', hint: 'Se for por um tempo' },
  { id: 'aguento', icon: 'rocket', label: 'Aguento o tranco', hint: 'Se render mais no fim' },
];

const toInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '');

export default function Investir() {
  const t = useTheme();
  const { settings, saveSettings, summary, emergency } = useApp();

  // O caminho: quatro respostas. Enquanto o objetivo não é escolhido, não há conta.
  const [goal, setGoal] = useState<Goal | null>(null);
  const [months, setMonths] = useState(24);
  const [access, setAccess] = useState<Access>('pode-travar');
  const [nerve, setNerve] = useState<Nerve>('pouco');

  const [mode, setMode] = useState<'ter' | 'guardar'>('ter');
  const [initial, setInitial] = useState(() => toInput(settings.emergencyBalanceCents));
  // Começa sugerindo a meta de 20% da renda: é o número que o app já defende.
  const [monthly, setMonthly] = useState(() => toInput(Math.round(summary.baseIncomeCents * 0.2)));
  const [target, setTarget] = useState(() => toInput(emergency.targetCents));
  const [cdi, setCdi] = useState(String(settings.cdiAnnualPct).replace('.', ','));

  const cdiPct = Math.max(0, Number(cdi.replace(',', '.')) || 0);
  const initialCents = Math.max(0, parseMoneyToCents(initial) ?? 0);
  const monthlyCents = Math.max(0, parseMoneyToCents(monthly) ?? 0);
  const targetCents = Math.max(0, parseMoneyToCents(target) ?? 0);

  const chooseGoal = (g: (typeof GOALS)[number]) => {
    tap();
    setGoal(g.id);
    // Cada objetivo já vem com o prazo mais comum dele; dá pra mudar no passo seguinte.
    setMonths(g.months);
    if (g.id === 'reserva') setAccess('qualquer-hora');
  };

  const isReserve = goal === 'reserva';
  // A pergunta do sobe-e-desce só faz sentido para dinheiro travado por mais de 2 anos.
  const asksNerve = !!goal && !isReserve && access === 'pode-travar' && months > 24;

  const plan = useMemo(
    () => (goal ? buildPlan({ goal, months, access, nerve }, cdiPct, { reserveMonths: emergency.monthsCovered }) : null),
    [goal, months, access, nerve, cdiPct, emergency.monthsCovered],
  );
  const needed = useMemo(
    () => (plan && mode === 'guardar' ? monthlyForPlan(plan, targetCents, initialCents, months) : 0),
    [plan, mode, targetCents, initialCents, months],
  );
  const aporte = mode === 'ter' ? monthlyCents : needed;
  const main = useMemo(
    () => (plan ? simulatePlan(plan, { initialCents, monthlyCents: aporte, months }) : null),
    [plan, initialCents, aporte, months],
  );
  const rows = useMemo(
    () => compareProducts(defaultProducts(cdiPct), { initialCents, monthlyCents: aporte, months }),
    [initialCents, aporte, months, cdiPct],
  );

  const saveCdi = () => {
    if (cdiPct > 0 && cdiPct !== settings.cdiAnnualPct) void saveSettings({ ...settings, cdiAnnualPct: cdiPct });
  };

  const hasMoney = aporte > 0 || initialCents > 0;
  let step = 0;

  return (
    <Screen>
      <ScreenHeader eyebrow="Me conta o plano que eu faço a conta" title="Investir" />

      <Appear index={0}>
        <Card>
          <StepTitle n={++step} title="Pra que é essa grana?" hint="É isso que decide onde ela deve ficar." />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GOALS.map((g) => (
              <Option key={g.id} half icon={g.icon} label={g.label} hint={g.hint} selected={goal === g.id} onPress={() => chooseGoal(g)} />
            ))}
          </View>
        </Card>
      </Appear>

      {goal ? (
        <>
          <Appear index={1}>
            <Card>
              <StepTitle
                n={++step}
                title={isReserve ? 'Em quanto tempo quer montar?' : 'Quando vai precisar dela?'}
                hint={isReserve ? 'É o prazo pra juntar; depois ela fica lá, rendendo.' : 'Quanto mais tempo, mais opção de onde colocar.'}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRAZOS.map((p) => (
                  <Chip key={p.months} label={p.label} selected={months === p.months} onPress={() => setMonths(p.months)} />
                ))}
              </View>
            </Card>
          </Appear>

          {!isReserve ? (
            <Appear index={2}>
              <Card>
                <StepTitle n={++step} title="Pode precisar sacar antes?" hint="Dinheiro travado rende mais, mas não sai na hora do aperto." />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ACCESS.map((a) => (
                    <Option key={a.id} half icon={a.icon} label={a.label} hint={a.hint} selected={access === a.id} onPress={() => { tap(); setAccess(a.id); }} />
                  ))}
                </View>
              </Card>
            </Appear>
          ) : null}

          {asksNerve ? (
            <Appear index={3}>
              <Card>
                <StepTitle n={++step} title="E se o valor balançar no caminho?" hint="Em prazo longo, o que rende mais também oscila mais." />
                <View style={{ gap: 8 }}>
                  {NERVES.map((x) => (
                    <Option key={x.id} icon={x.icon} label={x.label} hint={x.hint} selected={nerve === x.id} onPress={() => { tap(); setNerve(x.id); }} />
                  ))}
                </View>
              </Card>
            </Appear>
          ) : null}

          <Appear index={4}>
            <Card>
              <StepTitle n={++step} title="E os valores?" />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Quanto vou ter" selected={mode === 'ter'} onPress={() => setMode('ter')} />
                <Chip label="Quanto guardar" selected={mode === 'guardar'} onPress={() => setMode('guardar')} />
              </View>
              <MoneyField label="Já tenho guardado" value={initial} onChangeText={setInitial} />
              {mode === 'ter' ? (
                <MoneyField label="Vou guardar por mês" value={monthly} onChangeText={setMonthly} />
              ) : (
                <MoneyField label="Quero chegar em" value={target} onChangeText={setTarget} />
              )}
              <View style={{ gap: 7 }}>
                <Txt variant="label">Taxa de referência (CDI) ao ano</Txt>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    value={cdi}
                    onChangeText={setCdi}
                    onBlur={saveCdi}
                    keyboardType="decimal-pad"
                    inputMode="decimal"
                    placeholder="10,5"
                    placeholderTextColor={t.faint}
                    style={{
                      width: 110,
                      borderWidth: 1,
                      borderColor: t.border,
                      backgroundColor: t.fieldBg,
                      color: t.textStrong,
                      borderRadius: radius.md,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 17,
                      ...font('700'),
                    }}
                  />
                  <Txt variant="h2">% a.a.</Txt>
                </View>
                <Txt variant="small">A Selic muda de tempos em tempos. Dá uma conferida na taxa de hoje e ajusta aqui — eu guardo pra você.</Txt>
              </View>
            </Card>
          </Appear>
        </>
      ) : (
        <Appear index={1}>
          <Card>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <Icon name="arrow-up-circle" color={t.primary} size={22} />
              <Txt variant="muted" style={{ flex: 1 }}>Escolhe aí em cima pra que é o dinheiro. Com mais umas perguntinhas eu te digo onde colocar e quanto vai dar.</Txt>
            </View>
          </Card>
        </Appear>
      )}

      {plan && main && hasMoney ? (
        <>
          <Appear index={5}>
            <Card tone={[t.heroFrom, t.heroTo]} strength={1.3}>
              <Txt variant="label" color={t.heroText} style={{ opacity: 0.85 }}>
                {mode === 'ter' ? 'Seguindo esse caminho, no fim você terá' : `Guardando ${formatBRL(needed)} por mês, você chega em`}
              </Txt>
              <Txt variant="hero" color={t.heroText} style={{ fontSize: Math.min(38, 470 / formatBRL(main.netCents).length) }}>{formatBRL(main.netCents)}</Txt>
              <Txt variant="small" color={t.heroText} style={{ opacity: 0.85 }}>
                No seu bolso, já descontado o imposto de renda. É uma conta conservadora: nada aqui rende mais do que dá pra garantir.
              </Txt>
              <View style={{ flexDirection: 'row', gap: 7, marginTop: 2 }}>
                <HeroBox label="Colocou" value={formatBRL(main.investedCents).replace('R$ ', '')} />
                <HeroBox label="Juros" value={formatBRL(main.interestCents).replace('R$ ', '')} />
                <HeroBox label="Imposto" value={formatBRL(main.taxCents).replace('R$ ', '')} />
              </View>
            </Card>
          </Appear>

          <Appear index={6}>
            <Card>
              <CardTitle label="Onde eu colocaria" title={plan.title} hint={plan.summary} />
              {plan.slices.length > 1 ? (
                <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
                  {plan.slices.map((sl, i) => (
                    <View key={sl.id} style={{ flex: sl.sharePct, backgroundColor: t.chart[i] }} />
                  ))}
                </View>
              ) : null}
              {main.perSlice.map(({ slice, netCents, initialCents: ini, monthlyCents: mon }, i) => (
                <View key={slice.id} style={{ gap: 6, paddingTop: i === 0 ? 0 : 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ minWidth: 50, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 11, alignItems: 'center', backgroundColor: `${t.chart[i]}33` }}>
                      <Txt color={t.chart[i]} style={{ fontSize: 14, lineHeight: 19, fontWeight: '800' }}>{slice.sharePct}%</Txt>
                    </View>
                    <Txt style={{ flex: 1, fontWeight: '700' }}>{slice.name}</Txt>
                  </View>
                  <Txt variant="muted" color={t.text}>{slice.why}</Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2 }}>
                    {ini > 0 ? <Txt variant="small">Do que você tem: <Txt variant="small" color={t.text} style={{ fontWeight: '700' }}>{formatBRL(ini)}</Txt></Txt> : null}
                    {mon > 0 ? <Txt variant="small">Por mês: <Txt variant="small" color={t.text} style={{ fontWeight: '700' }}>{formatBRL(mon)}</Txt></Txt> : null}
                    <Txt variant="small">No fim: <Txt variant="small" color={t.income} style={{ fontWeight: '800' }}>{formatBRL(netCents)}</Txt></Txt>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    <Icon name="warning" size={13} color={t.warning} />
                    <Txt variant="small" style={{ flex: 1 }}>{slice.caution}</Txt>
                  </View>
                  <Txt variant="small" style={{ fontSize: 11, lineHeight: 16 }}>Na conta: {slice.rateNote}.</Txt>
                </View>
              ))}
            </Card>
          </Appear>

          {plan.warnings.length > 0 ? (
            <Appear index={7}>
              <Card style={{ borderColor: `${t.warning}66`, backgroundColor: `${t.warning}1C` }}>
                <Txt variant="label" color={t.warning}>Papo reto</Txt>
                {plan.warnings.map((w) => (
                  <View key={w} style={{ flexDirection: 'row', gap: 9 }}>
                    <Icon name="alert-circle" size={17} color={t.warning} />
                    <Txt variant="muted" color={t.text} style={{ flex: 1 }}>{w}</Txt>
                  </View>
                ))}
              </Card>
            </Appear>
          ) : null}

          <Appear index={8}>
            <Card>
              <CardTitle
                label="Com o tempo"
                title="Como o dinheiro cresce"
                hint="A faixa de baixo é o que saiu do seu bolso. A de cima é o que os juros fizeram sozinhos. Passa o dedo pra ver mês a mês."
              />
              <GrowthChart points={main.points} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 4 }}>
                <Legend color={t.primary} label="O que você colocou" />
                <Legend color={t.income} label="Total com juros" />
              </View>
            </Card>
          </Appear>

          <Appear index={9}>
            <Card>
              <CardTitle
                label="Pra comparar"
                title="Se fosse tudo num lugar só"
                hint="O mesmo dinheiro inteiro em cada tipo, pelo que sobra depois do imposto. Taxa de vitrine engana."
              />
              {rows.map((row, i) => (
                <ProductRow key={row.id} row={row} best={i === 0} />
              ))}
            </Card>
          </Appear>

          <Appear index={10}>
            <Card>
              <CardTitle label="Pra não levar susto" title="O que mexe no resultado" />
              <Bullet>
                <Txt variant="small">
                  <Txt variant="small" style={{ fontWeight: '700', color: t.text }}>Imposto cai com o tempo: </Txt>
                  22,5% até 6 meses, 20% até 1 ano, 17,5% até 2 anos e 15% depois disso. Resgatar cedo é o jeito mais fácil
                  de perder dinheiro.
                </Txt>
              </Bullet>
              <Bullet>
                <Txt variant="small">
                  <Txt variant="small" style={{ fontWeight: '700', color: t.text }}>LCI e LCA não pagam IR, </Txt>
                  mas costumam ter carência: o dinheiro fica preso até o vencimento. Não serve pra reserva de emergência.
                </Txt>
              </Bullet>
              <Bullet>
                <Txt variant="small">
                  <Txt variant="small" style={{ fontWeight: '700', color: t.text }}>FGC cobre até R$ 250 mil </Txt>
                  por banco e por CPF em CDB, LCI e LCA. Tesouro é do governo, não precisa do FGC.
                </Txt>
              </Bullet>
              <Bullet>
                <Txt variant="small">
                  <Txt variant="small" style={{ fontWeight: '700', color: t.text }}>Tesouro Selic tem taxa da B3 </Txt>
                  de 0,2% ao ano acima dos primeiros R$ 10 mil, que não entra nesta conta. Em CDB, a taxa já vem embutida
                  no % do CDI.
                </Txt>
              </Bullet>
              <Txt variant="small" style={{ marginTop: 2 }}>
                O caminho aqui de cima é o de manual pra esse tipo de objetivo, montado com as suas respostas. É conselho
                de amigo e simulação, não recomendação profissional nem indicação de banco ou corretora, e não é promessa
                de rendimento: a taxa muda no meio do caminho. Antes de aplicar, confere taxa, prazo e carência — e se
                o valor for grande, fala com um profissional certificado.
              </Txt>
            </Card>
          </Appear>
        </>
      ) : plan ? (
        <Appear index={5}>
          <Card>
            <Txt variant="muted">Preenche quanto você já tem ou quanto vai guardar por mês que eu faço a conta.</Txt>
          </Card>
        </Appear>
      ) : null}
    </Screen>
  );
}

/** Número do passo + pergunta. */
function StepTitle({ n, title, hint }: { n: number; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}>
        <Txt color={t.primaryText} style={{ fontSize: 13.5, lineHeight: 18, fontWeight: '800' }}>{n}</Txt>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="h2" style={{ lineHeight: 26 }}>{title}</Txt>
        {hint ? <Txt variant="small">{hint}</Txt> : null}
      </View>
    </View>
  );
}

/** Opção grande de uma pergunta: ícone, resposta e uma linha de apoio. */
function Option({ icon, label, hint, selected, onPress, half }: { icon: string; label: string; hint: string; selected: boolean; onPress: () => void; half?: boolean }) {
  const t = useTheme();
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${hint}`}
      onPress={onPress}
      style={half ? { flexBasis: '47%', flexGrow: 1 } : undefined}>
      <View
        style={{
          flexDirection: half ? 'column' : 'row',
          alignItems: half ? 'flex-start' : 'center',
          gap: half ? 8 : 12,
          padding: 12,
          // Altura fixa nas opções em grade: senão cada uma fica de um tamanho.
          minHeight: half ? 136 : undefined,
          borderRadius: radius.md + 2,
          borderWidth: 1.5,
          borderColor: selected ? t.primary : t.border,
          backgroundColor: selected ? t.soft : t.fieldBg,
        }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? t.primary : t.soft }}>
          <Icon name={icon} size={18} color={selected ? t.primaryText : t.primary} />
        </View>
        <View style={half ? { gap: 1 } : { flex: 1, gap: 1 }}>
          <Txt style={{ fontWeight: '700', fontSize: 14, lineHeight: 19 }}>{label}</Txt>
          <Txt variant="small" style={{ fontSize: 11.5, lineHeight: 16 }}>{hint}</Txt>
        </View>
        {!half && selected ? <Icon name="checkmark-circle" size={20} color={t.primary} /> : null}
      </View>
    </Press>
  );
}

function HeroBox({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
      <View style={{ paddingHorizontal: 8, paddingVertical: 9, gap: 2 }}>
        <Txt variant="small" color={t.heroText} style={{ opacity: 0.75, fontSize: 11 }}>{label}</Txt>
        <Txt color={t.heroText} style={{ fontWeight: '800', fontSize: fitFontSize(value, 14), lineHeight: 19, letterSpacing: -0.3 }} numberOfLines={1}>
          {value}
        </Txt>
      </View>
    </View>
  );
}

function ProductRow({ row, best }: { row: Comparison; best: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Press onPress={() => setOpen((v) => !v)} style={{ gap: 6 }} accessibilityRole="button" aria-expanded={open}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={2}>{row.name}</Txt>
            {best ? <Icon name="trophy" size={13} color={t.primary} /> : null}
          </View>
          <Txt variant="small" numberOfLines={3}>
            {best ? row.detail : `${formatBRL(row.behindBestCents)} a menos que o primeiro`}
          </Txt>
        </View>
        <Txt style={{ fontWeight: '800', fontSize: 15 }} color={best ? t.income : t.text}>
          {formatBRL(row.result.netCents)}
        </Txt>
      </View>
      {open ? (
        <View style={{ gap: 4, paddingLeft: 2 }}>
          <Txt variant="small">{row.detail}</Txt>
          <Txt variant="small">
            Rende {row.annualPct.toFixed(2).replace('.', ',')}% ao ano. Juros de {formatBRL(row.result.interestCents)}
            {row.result.taxCents > 0 ? `, menos ${formatBRL(row.result.taxCents)} de imposto.` : ', sem imposto.'}
          </Txt>
        </View>
      ) : null}
    </Press>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Icon name="ellipse" size={6} color={t.primary} />
      <View style={{ flex: 1 }}>{children}</View>
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

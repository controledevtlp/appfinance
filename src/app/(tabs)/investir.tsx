import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { GrowthChart } from '@/components/charts';
import { Appear, Bar, Press } from '@/components/motion';
import { Card, CardTitle, Chip, fitFontSize, Icon, MoneyField, Screen, ScreenHeader, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import {
  compareProducts,
  defaultProducts,
  monthlyNeeded,
  simulate,
  type Comparison,
} from '@/engine/invest';
import { formatBRL, parseMoneyToCents } from '@/engine/money';
import { font, radius, useTheme } from '@/theme';

const PRAZOS = [
  { label: '1 ano', months: 12 },
  { label: '2 anos', months: 24 },
  { label: '5 anos', months: 60 },
  { label: '10 anos', months: 120 },
];

const toInput = (cents: number) => (cents > 0 ? (cents / 100).toFixed(2).replace('.', ',') : '');

export default function Investir() {
  const t = useTheme();
  const { settings, saveSettings, summary, emergency } = useApp();

  const [mode, setMode] = useState<'ter' | 'guardar'>('ter');
  const [initial, setInitial] = useState(() => toInput(settings.emergencyBalanceCents));
  // Começa sugerindo a meta de 20% da renda: é o número que o app já defende.
  const [monthly, setMonthly] = useState(() => toInput(Math.round(summary.baseIncomeCents * 0.2)));
  const [target, setTarget] = useState(() => toInput(emergency.targetCents));
  const [months, setMonths] = useState(24);
  const [cdi, setCdi] = useState(String(settings.cdiAnnualPct).replace('.', ','));

  const cdiPct = Math.max(0, Number(cdi.replace(',', '.')) || 0);
  const initialCents = Math.max(0, parseMoneyToCents(initial) ?? 0);
  const monthlyCents = Math.max(0, parseMoneyToCents(monthly) ?? 0);
  const targetCents = Math.max(0, parseMoneyToCents(target) ?? 0);

  const needed = useMemo(
    () => monthlyNeeded(targetCents, initialCents, months, cdiPct),
    [targetCents, initialCents, months, cdiPct],
  );
  const aporte = mode === 'ter' ? monthlyCents : needed;

  const base = { initialCents, monthlyCents: aporte, months };
  const main = useMemo(() => simulate({ ...base, annualPct: cdiPct }), [initialCents, aporte, months, cdiPct]);
  const rows = useMemo(() => compareProducts(defaultProducts(cdiPct), base), [initialCents, aporte, months, cdiPct]);

  const saveCdi = () => {
    if (cdiPct > 0 && cdiPct !== settings.cdiAnnualPct) void saveSettings({ ...settings, cdiAnnualPct: cdiPct });
  };

  return (
    <Screen>
      <ScreenHeader eyebrow="Simulador de renda fixa" title="Investir" />
      <Appear index={0}>
        <Card>
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
            <Txt variant="label">Por quanto tempo</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PRAZOS.map((p) => (
                <Chip key={p.months} label={p.label} selected={months === p.months} onPress={() => setMonths(p.months)} />
              ))}
            </View>
          </View>

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
            <Txt variant="small">
              A Selic muda de tempos em tempos. Dá uma conferida na taxa de hoje e ajusta aqui — eu guardo pra você.
            </Txt>
          </View>
        </Card>
      </Appear>

      {aporte > 0 || initialCents > 0 ? (
        <>
          <Appear index={1}>
            <Card tone={[t.heroFrom, t.heroTo]} strength={1.3}>
              <Txt variant="label" color={t.heroText} style={{ opacity: 0.8 }}>
                {mode === 'ter' ? 'No fim você terá' : `Guardando ${formatBRL(needed)} por mês, você chega em`}
              </Txt>
              <Txt variant="hero" color={t.heroText} style={{ fontSize: Math.min(38, 470 / formatBRL(main.netCents).length) }}>{formatBRL(main.netCents)}</Txt>
              <Txt variant="small" color={t.heroText} style={{ opacity: 0.85 }}>
                Já descontado o imposto de renda{main.taxRate > 0 ? ` de ${(main.taxRate * 100).toFixed(1).replace('.', ',')}%` : ''}.
              </Txt>
              <View style={{ flexDirection: 'row', gap: 7, marginTop: 2 }}>
                <HeroBox label="Você colocou" value={formatBRL(main.investedCents).replace('R$ ', '')} />
                <HeroBox label="Os juros deram" value={formatBRL(main.interestCents).replace('R$ ', '')} />
                <HeroBox label="Imposto" value={formatBRL(main.taxCents).replace('R$ ', '')} />
              </View>
            </Card>
          </Appear>

          <Appear index={2}>
            <Card>
              <CardTitle
                label="Com o tempo"
                title="Como o dinheiro cresce"
                hint="A faixa de baixo é o que saiu do seu bolso. A de cima é o que os juros fizeram sozinhos. Passa o dedo pra ver mês a mês."
              />
              <GrowthChart points={main.points} />
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Legend color={t.primary} label="O que você colocou" />
                <Legend color={t.income} label="Total com juros" />
              </View>
            </Card>
          </Appear>

          <Appear index={3}>
            <Card>
              <CardTitle
                label="Onde render mais"
                title="Comparando pelo líquido"
                hint="Taxa de vitrine engana: o que importa é o que sobra depois do imposto."
              />
              {rows.map((row, i) => (
                <ProductRow key={row.id} row={row} best={i === 0} />
              ))}
            </Card>
          </Appear>

          <Appear index={4}>
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
                Isso aqui é uma simulação pra te ajudar a comparar, não é promessa de rendimento nem recomendação de
                investimento. Rendimento passado não garante o futuro, e a taxa pode mudar no meio do caminho.
              </Txt>
            </Card>
          </Appear>
        </>
      ) : (
        <Appear index={1}>
          <Card>
            <Txt variant="muted">Preenche quanto você já tem ou quanto vai guardar por mês que eu faço a conta.</Txt>
          </Card>
        </Appear>
      )}
    </Screen>
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

function Bullet({ children }: { children: React.ReactNode }) {
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

import { useState } from 'react';
import { View } from 'react-native';
import { Appear, Morph, Press, Reveal } from '@/components/motion';
import { Card, Empty, Icon, MonthSwitcher, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { formatBRL } from '@/engine/money';
import { totalPotentialSavings } from '@/engine/tips';
import type { Tip, TipSeverity } from '@/engine/types';
import { useTheme } from '@/theme';

export default function Dicas() {
  const t = useTheme();
  const { tips, investments, month, setMonth, transactions } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const total = totalPotentialSavings(tips);

  const color: Record<TipSeverity, string> = { alerta: t.over, atencao: t.warning, info: t.info, positivo: t.ok };
  const icon: Record<TipSeverity, string> = { alerta: 'alert-circle', atencao: 'warning', info: 'information-circle', positivo: 'checkmark-circle' };

  return (
    <Screen>
      <MonthSwitcher month={month} onChange={setMonth} />

      {transactions.length === 0 ? (
        <Empty icon="bulb-outline" title="Ainda não tenho o que falar" text="Lança ou importa seus gastos que eu te mostro onde dá pra economizar." />
      ) : (
        <>
          {total > 0 ? (
            <Appear index={0}>
            <Card tone={[t.heroFrom, t.heroTo]} strength={1.2}>
              <Txt variant="label" color={t.heroText} style={{ opacity: 0.8 }}>Seguindo os planos aqui de baixo, dá pra sobrar até</Txt>
              <Txt variant="hero" color={t.heroText}>{formatBRL(total)}<Txt color={t.heroText} style={{ fontSize: 18, fontWeight: '700', opacity: 0.8 }}>/mês</Txt></Txt>
              <Txt variant="small" color={t.heroText} style={{ opacity: 0.85 }}>Isso dá {formatBRL(total * 12)} no ano. Pensa no que você faria com esse dinheiro.</Txt>
            </Card>
            </Appear>
          ) : null}

          <Appear index={1}>
            <Txt variant="h2" style={{ marginTop: 4 }}>Onde dá pra economizar</Txt>
          </Appear>
          {tips.map((tip: Tip, idx: number) => {
            const expanded = open === tip.id;
            return (
              <Appear key={tip.id} index={idx + 1}>
              <Press onPress={() => setOpen(expanded ? null : tip.id)} accessibilityRole="button" aria-expanded={expanded}>
                <Morph>
                <Card style={{ borderLeftWidth: 4, borderLeftColor: color[tip.severity] }}>
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <Icon name={icon[tip.severity]} color={color[tip.severity]} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Txt style={{ fontWeight: '700' }}>{tip.title}</Txt>
                      <Txt variant="muted">{tip.message}</Txt>
                      {tip.savingsCents > 0 ? <Txt variant="small" color={t.primary} style={{ fontWeight: '700' }}>Dá pra guardar {formatBRL(tip.savingsCents)}/mês</Txt> : null}
                    </View>
                    <Icon name={expanded ? 'chevron-up' : 'chevron-down'} color={t.muted} size={18} />
                  </View>
                  {expanded ? (
                    <Reveal>
                    <View style={{ gap: 8, paddingTop: 4 }}>
                      <Txt variant="small" style={{ fontWeight: '700' }}>COMO FAZER</Txt>
                      {tip.steps.map((s, i) => (
                        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                          <Txt color={t.primary} style={{ fontWeight: '700' }}>{i + 1}.</Txt>
                          <Txt style={{ flex: 1 }}>{s}</Txt>
                        </View>
                      ))}
                    </View>
                    </Reveal>
                  ) : null}
                </Card>
                </Morph>
              </Press>
              </Appear>
            );
          })}
          {tips.length === 0 ? <Txt variant="muted">Nenhum alerta esse mês. Tá indo bem, continua assim!</Txt> : null}

          {investments.length > 0 ? (
            <>
              <Appear index={1}>
                <View style={{ marginTop: 10, gap: 2 }}>
                  <Txt variant="h2">Onde botar a grana pra render</Txt>
                  <Txt variant="small">
                    Renda fixa, na ordem certa: primeiro a reserva, depois o prazo. Isso aqui é pra você estudar, não é
                    recomendação de investimento nem indicação de banco ou corretora. A decisão é sua.
                  </Txt>
                </View>
              </Appear>
              {investments.map((tip: Tip, idx: number) => {
                const expanded = open === tip.id;
                return (
                  <Appear key={tip.id} index={idx + 2}>
                    <Press onPress={() => setOpen(expanded ? null : tip.id)} accessibilityRole="button" aria-expanded={expanded}>
                      <Morph>
                        <Card style={{ borderLeftWidth: 4, borderLeftColor: t.poupanca }}>
                          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            <Icon name="trending-up" color={t.poupanca} />
                            <View style={{ flex: 1, gap: 4 }}>
                              <Txt style={{ fontWeight: '700' }}>{tip.title}</Txt>
                              <Txt variant="muted">{tip.message}</Txt>
                            </View>
                            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} color={t.muted} size={18} />
                          </View>
                          {expanded ? (
                            <Reveal>
                              <View style={{ gap: 8, paddingTop: 4 }}>
                                {tip.steps.map((st, i) => (
                                  <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                                    <Icon name="ellipse" size={7} color={t.poupanca} />
                                    <Txt style={{ flex: 1 }}>{st}</Txt>
                                  </View>
                                ))}
                              </View>
                            </Reveal>
                          ) : null}
                        </Card>
                      </Morph>
                    </Press>
                  </Appear>
                );
              })}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

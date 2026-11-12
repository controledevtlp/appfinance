import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import { Appear, Bar, Morph, Press } from '@/components/motion';
import { Button, Card, CategoryBadge, CategoryPicker, Empty, Icon, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { getCategory } from '@/engine/categories';
import { formatDateBR } from '@/engine/dates';
import {
  decodeBytes,
  groupRecurringCandidates,
  parseStatement,
  toPreviewRows,
  type ParseResult,
} from '@/engine/import';
import { formatBRL } from '@/engine/money';
import type { TxType } from '@/engine/types';
import { notify } from '@/lib/dialog';
import { radius, useTheme } from '@/theme';

const MAX_ROWS = 150;
const GROUPS_COLLAPSED = 6;

export default function Importar() {
  const t = useTheme();
  const { transactions, addTransactions, settings } = useApp();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [invoice, setInvoice] = useState<boolean | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [pickerFor, setPickerFor] = useState<{ index: number; type: TxType } | null>(null);
  const [recurring, setRecurring] = useState<Set<string>>(new Set());
  const [touchedRecurring, setTouchedRecurring] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [busy, setBusy] = useState(false);

  const result: ParseResult | null = useMemo(
    () => (text === null ? null : parseStatement(text, { positiveIsExpense: invoice ?? undefined })),
    [text, invoice],
  );

  const rows = useMemo(() => {
    if (!result) return [];
    const known = new Set(transactions.map((x) => x.externalId).filter((x): x is string => !!x));
    return toPreviewRows(result.rows, known).map((r, i) => ({ ...r, categoryId: overrides[i] ?? r.categoryId }));
  }, [result, transactions, overrides]);

  // Mapeamento instantâneo: assim que o arquivo é lido, os candidatos a gasto fixo já aparecem.
  const groups = useMemo(() => groupRecurringCandidates(rows), [rows]);
  const selected = useMemo(() => {
    if (touchedRecurring) return recurring;
    return new Set(groups.filter((g) => g.suggested).map((g) => g.key));
  }, [groups, recurring, touchedRecurring]);

  const keyByIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of groups) for (const i of g.indexes) m.set(i, g.key);
    return m;
  }, [groups]);

  const fresh = rows
    .map((r, i) => ({ ...r, isRecurring: selected.has(keyByIndex.get(i) ?? '') }))
    .filter((r) => !r.duplicate);

  const totalIn = fresh.filter((r) => r.type === 'income' && r.categoryId !== 'transferencia').reduce((a, r) => a + r.amountCents, 0);
  const totalOut = fresh.filter((r) => r.type === 'expense' && r.categoryId !== 'transferencia').reduce((a, r) => a + r.amountCents, 0);
  const fixedTotal = groups.filter((g) => selected.has(g.key)).reduce((a, g) => a + g.monthlyCents, 0);
  const income = settings.monthlyIncomeCents;

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setTouchedRecurring(true);
    setRecurring(next);
  };

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      const bytes =
        Platform.OS === 'web' && asset.file
          ? new Uint8Array(await asset.file.arrayBuffer())
          : await new File(asset.uri).bytes();
      setFileName(asset.name);
      setOverrides({});
      setInvoice(null);
      setRecurring(new Set());
      setTouchedRecurring(false);
      setShowAllGroups(false);
      setText(decodeBytes(bytes));
    } catch (e) {
      notify('Não foi possível ler o arquivo', (e as Error).message);
    }
  };

  const doImport = async () => {
    if (!fresh.length) return;
    setBusy(true);
    try {
      await addTransactions(
        fresh.map(({ duplicate: _d, isRecurring, ...tx }) => ({ ...tx, recurring: isRecurring })),
      );
      notify('Importação concluída', `${fresh.length} lançamentos adicionados.`, () => router.replace('/lancamentos'));
    } catch (e) {
      notify('Erro ao importar', (e as Error).message);
      setBusy(false);
    }
  };

  if (!result) {
    return (
      <Screen>
        <Appear>
          <Empty
            icon="document-text-outline"
            title="Escolha o arquivo do extrato"
            text="No app ou site do seu banco, exporte o extrato em CSV ou OFX (também funciona com a fatura do cartão) e selecione aqui.">
            <Button title="Escolher arquivo" icon="folder-open-outline" onPress={pick} />
          </Empty>
        </Appear>
      </Screen>
    );
  }

  const visibleGroups = showAllGroups ? groups : groups.slice(0, GROUPS_COLLAPSED);

  return (
    <Screen padBottom={120}>
      <Appear index={0}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }} numberOfLines={1}>{fileName}</Txt>
              <Txt variant="small">
                {result.format.toUpperCase()} · {rows.length} linhas{result.skipped ? ` · ${result.skipped} ignoradas` : ''}
              </Txt>
            </View>
            <Button title="Trocar" variant="ghost" onPress={pick} />
          </View>
          {result.format === 'csv' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>É fatura de cartão?</Txt>
                <Txt variant="small">Em faturas, valores positivos são compras.</Txt>
              </View>
              <Switch value={invoice ?? result.looksLikeCardInvoice} onValueChange={setInvoice} trackColor={{ true: t.primary, false: t.border }} />
            </View>
          ) : null}
          {result.warnings.map((w) => (
            <Txt key={w} variant="small" color={t.warning}>{w}</Txt>
          ))}
        </Card>
      </Appear>

      {groups.length > 0 ? (
        <Appear index={1}>
          <Morph>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Txt variant="h2">Quais se repetem todo mês?</Txt>
                  <Txt variant="small">
                    Já marquei os que parecem fixos. Confira e ajuste: isso melhora a projeção do mês e separa o que você
                    realmente consegue cortar.
                  </Txt>
                </View>
                <Icon name="repeat" color={t.primary} size={22} />
              </View>

              <View style={{ backgroundColor: t.soft, borderRadius: radius.md, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Txt variant="muted">Custo fixo mapeado</Txt>
                  <Txt variant="h2" color={t.primary}>{formatBRL(fixedTotal)}/mês</Txt>
                </View>
                {income > 0 ? (
                  <>
                    <Bar ratio={fixedTotal / income} color={fixedTotal > income * 0.5 ? t.over : t.primary} markerAt={0.5} height={6} />
                    <Txt variant="small">
                      {Math.round((fixedTotal / income) * 100)}% da sua renda. O traço marca 50%, o limite saudável.
                    </Txt>
                  </>
                ) : (
                  <Txt variant="small">Informe sua renda para ver quanto isso pesa no orçamento.</Txt>
                )}
              </View>

              {visibleGroups.map((g) => {
                const on = selected.has(g.key);
                return (
                  <Press key={g.key} onPress={() => toggle(g.key)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={g.label}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
                      <CategoryBadge categoryId={g.categoryId} size={34} />
                      <View style={{ flex: 1 }}>
                        <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{g.label}</Txt>
                        <Txt variant="small">
                          {formatBRL(g.monthlyCents)}/mês · {g.months > 1 ? `aparece em ${g.months} meses` : getCategory(g.categoryId).name}
                        </Txt>
                      </View>
                      <Switch value={on} onValueChange={() => toggle(g.key)} trackColor={{ true: t.primary, false: t.border }} />
                    </View>
                  </Press>
                );
              })}

              {groups.length > GROUPS_COLLAPSED ? (
                <Press onPress={() => setShowAllGroups((v) => !v)} hitSlop={8}>
                  <Txt color={t.primary} style={{ fontWeight: '700', textAlign: 'center' }}>
                    {showAllGroups
                      ? 'Mostrar menos'
                      : groups.length - GROUPS_COLLAPSED === 1
                        ? 'Ver mais 1 lançamento'
                        : `Ver mais ${groups.length - GROUPS_COLLAPSED} lançamentos`}
                  </Txt>
                </Press>
              ) : null}
            </Card>
          </Morph>
        </Appear>
      ) : null}

      {rows.length > 0 ? (
        <Appear index={2}>
          <Card>
            <Txt variant="h2">Prévia</Txt>
            <Txt variant="small">Toque na linha para corrigir a categoria. O que já foi importado antes fica esmaecido.</Txt>
            {rows.slice(0, MAX_ROWS).map((r, i) => {
              const isRecurring = selected.has(keyByIndex.get(i) ?? '');
              return (
                <Press key={i} disabled={r.duplicate} onPress={() => setPickerFor({ index: i, type: r.type })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: r.duplicate ? 0.4 : 1, paddingVertical: 4 }}>
                    <CategoryBadge categoryId={r.categoryId} size={34} />
                    <View style={{ flex: 1 }}>
                      <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{r.description}</Txt>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Txt variant="small">
                          {formatDateBR(r.date)} · {r.duplicate ? 'já importado' : getCategory(r.categoryId).name}
                        </Txt>
                        {isRecurring && !r.duplicate ? <Icon name="repeat" size={12} color={t.primary} /> : null}
                      </View>
                    </View>
                    <Txt style={{ fontWeight: '700' }} color={r.categoryId === 'transferencia' ? t.muted : r.type === 'income' ? t.income : t.expense}>
                      {r.type === 'income' ? '+' : '-'}{formatBRL(r.amountCents)}
                    </Txt>
                  </View>
                </Press>
              );
            })}
            {rows.length > MAX_ROWS ? (
              <Txt variant="small">…e mais {rows.length - MAX_ROWS} linhas (todas serão importadas).</Txt>
            ) : null}
          </Card>
        </Appear>
      ) : null}

      <Appear index={3}>
        <Card>
          <Txt variant="h2">Resumo</Txt>
          <Txt variant="muted">{fresh.length} novos · {rows.length - fresh.length} duplicados</Txt>
          <Txt>Entradas {formatBRL(totalIn)} · Saídas {formatBRL(totalOut)}</Txt>
          <Txt variant="small">Pagamentos de fatura e transferências não entram nas contas, para não contar gasto em dobro.</Txt>
          <Button title={`Importar ${fresh.length} lançamentos`} onPress={doImport} loading={busy} disabled={!fresh.length} />
        </Card>
      </Appear>

      <CategoryPicker
        visible={!!pickerFor}
        type={pickerFor?.type ?? 'expense'}
        value={pickerFor ? rows[pickerFor.index]?.categoryId : undefined}
        onSelect={(c) => pickerFor && setOverrides((o) => ({ ...o, [pickerFor.index]: c }))}
        onClose={() => setPickerFor(null)}
      />
    </Screen>
  );
}

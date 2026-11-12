import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { Appear, Bar, Morph, Press } from '@/components/motion';
import { Button, Card, CategoryBadge, CategoryPicker, Empty, Icon, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { CATEGORIES, getCategory } from '@/engine/categories';
import { formatDateBR, monthLabel } from '@/engine/dates';
import {
  decodeBytes,
  groupRecurringCandidates,
  parseStatementBytes,
  pdfDiagnostic,
  toPreviewRows,
  type ParseResult,
} from '@/engine/import';
import { formatBRL } from '@/engine/money';
import type { TxType } from '@/engine/types';
import { withCategoryRule } from '@/engine/naming';
import { notify } from '@/lib/dialog';
import { readPickedFile, SAMPLE_STATEMENT } from '@/lib/readFile';
import { radius, useTheme } from '@/theme';

const MAX_ROWS = 150;
const GROUPS_COLLAPSED = 6;

export default function Importar() {
  const t = useTheme();
  const { transactions, addTransactions, settings, saveSettings, setMonth } = useApp();
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [typeOverrides, setTypeOverrides] = useState<Record<number, TxType>>({});
  const [invoice, setInvoice] = useState<boolean | null>(null);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [pickerFor, setPickerFor] = useState<{ index: number; type: TxType } | null>(null);
  const [recurring, setRecurring] = useState<Set<string>>(new Set());
  const [touchedRecurring, setTouchedRecurring] = useState(false);
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [busy, setBusy] = useState(false);

  const result: ParseResult | null = useMemo(
    () => (bytes === null ? null : parseStatementBytes(bytes, { positiveIsExpense: invoice ?? undefined })),
    [bytes, invoice],
  );

  /** Primeiras linhas do arquivo, mostradas quando nada é reconhecido. */
  const preview = useMemo(() => {
    if (!bytes) return [];
    // Em PDF, o que interessa é o texto que conseguimos extrair, não os bytes crus.
    if (result?.format === 'pdf') return pdfDiagnostic(bytes).slice(0, 15);
    return decodeBytes(bytes.subarray(0, 4000)).split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  }, [bytes, result?.format]);

  const rows = useMemo(() => {
    if (!result) return [];
    const known = new Set(transactions.map((x) => x.externalId).filter((x): x is string => !!x));
    return toPreviewRows(result.rows, known, settings.categoryRules).map((r, i) => {
      const categoryId = overrides[i] ?? r.categoryId;
      return { ...r, categoryId, type: typeOverrides[i] ?? r.type };
    });
  }, [result, transactions, overrides, typeOverrides, settings.categoryRules]);

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

  const reset = (name: string) => {
    setFileName(name);
    setOverrides({});
    setTypeOverrides({});
    setInvoice(null);
    setRecurring(new Set());
    setTouchedRecurring(false);
    setShowAllGroups(false);
    setReadError(null);
  };

  const pick = async () => {
    let res: DocumentPicker.DocumentPickerResult;
    try {
      res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
    } catch (e) {
      setReadError(`O seletor de arquivos não abriu: ${(e as Error).message}`);
      return;
    }
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    try {
      const data = await readPickedFile(asset);
      if (!data.length) {
        setReadError(`O arquivo "${asset.name}" veio vazio (0 bytes).`);
        return;
      }
      reset(asset.name);
      setBytes(data);
    } catch (e) {
      setFileName(asset.name);
      setReadError(`Não consegui ler "${asset.name}". ${(e as Error).message}`);
    }
  };

  const loadSample = () => {
    reset('exemplo.csv');
    const s = SAMPLE_STATEMENT;
    const data = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) data[i] = s.charCodeAt(i) & 0xff;
    setBytes(data);
  };

  const doImport = async () => {
    if (!fresh.length) return;
    setBusy(true);
    try {
      // O que foi corrigido à mão vira regra: na próxima importação já vem certo.
      const corrected = Object.entries(overrides);
      if (corrected.length) {
        let rules = settings.categoryRules;
        for (const [index, categoryId] of corrected) {
          const row = rows[Number(index)];
          if (row) rules = withCategoryRule(rules, row.description, categoryId);
        }
        await saveSettings({ ...settings, categoryRules: rules });
      }
      await addTransactions(fresh.map(({ duplicate: _d, isRecurring, ...tx }) => ({ ...tx, recurring: isRecurring })));
      // O extrato costuma ser de um mês passado: leva o app para lá, senão a
      // tela abre no mês atual vazio e parece que a importação não funcionou.
      const months = new Map<string, number>();
      for (const r of fresh) {
        const m = r.date.slice(0, 7);
        months.set(m, (months.get(m) ?? 0) + 1);
      }
      const busiest = [...months.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0];
      if (busiest) setMonth(busiest[0]);
      notify(
        'Importação concluída',
        `${fresh.length} lançamentos adicionados${busiest ? ` em ${monthLabel(busiest[0])}` : ''}.`,
        () => router.replace('/lancamentos'),
      );
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
            text="No app ou site do seu banco, exporte o extrato e selecione aqui. Serve também para a fatura do cartão.">
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['CSV', 'OFX', 'PDF'].map((f) => (
                  <View key={f} style={{ borderWidth: 1, borderColor: t.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Txt variant="small" style={{ fontWeight: '700' }}>{f}</Txt>
                  </View>
                ))}
              </View>
              <Button title="Escolher arquivo" icon="folder-open-outline" onPress={pick} />
              <Button title="Testar com um extrato de exemplo" icon="flask-outline" variant="ghost" onPress={loadSample} />
            </View>
          </Empty>
        </Appear>
        {readError ? (
          <Appear index={1}>
            <Card style={{ borderColor: t.over }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="alert-circle" color={t.over} />
                <Txt variant="h2" color={t.over}>Deu problema ao abrir</Txt>
              </View>
              <Txt variant="muted">{readError}</Txt>
              <Txt variant="small">
                Tente de novo escolhendo o arquivo pelo gerenciador de arquivos do aparelho (em vez de um app de nuvem).
                Se continuar, toque em "Testar com um extrato de exemplo" para ver se o resto funciona.
              </Txt>
            </Card>
          </Appear>
        ) : null}
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

      {rows.length === 0 ? (
        <Appear index={1}>
          <Card style={{ borderColor: t.warning }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="help-circle" color={t.warning} />
              <Txt variant="h2">Não reconheci os lançamentos</Txt>
            </View>
            <Txt variant="muted">
              O arquivo foi lido ({(bytes?.length ?? 0).toLocaleString('pt-BR')} bytes), mas não achei colunas de data e valor.
            </Txt>
            {preview.length ? (
              <View style={{ backgroundColor: t.bg, borderRadius: radius.md, padding: 10, gap: 2 }}>
                <Txt variant="small" style={{ fontWeight: '700' }}>
                {result.format === 'pdf' ? 'TEXTO QUE CONSEGUI LER DO PDF' : 'PRIMEIRAS LINHAS DO ARQUIVO'}
              </Txt>
                {preview.map((l, i) => (
                  <Txt key={i} variant="small" numberOfLines={1}>{l}</Txt>
                ))}
              </View>
            ) : null}
            <Txt variant="small">
              Se puder, exporte em CSV ou OFX — são os formatos mais confiáveis. Em PDF digitalizado (foto do extrato) não há
              texto para ler.
            </Txt>
          </Card>
        </Appear>
      ) : null}

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
            <Txt variant="small">
              Toque na linha para corrigir a categoria — o app guarda a correção e aplica nas próximas importações. O que já
              foi importado antes fica esmaecido.
            </Txt>
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
        allowAll
        onSelect={(c) => {
          if (!pickerFor) return;
          const group = CATEGORIES.find((x) => x.id === c)?.group;
          setOverrides((o) => ({ ...o, [pickerFor.index]: c }));
          setTypeOverrides((o) => ({ ...o, [pickerFor.index]: group === 'renda' ? 'income' : 'expense' }));
        }}
        onClose={() => setPickerFor(null)}
      />
    </Screen>
  );
}

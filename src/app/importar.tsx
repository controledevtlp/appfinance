import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Platform, Switch, View } from 'react-native';
import { Button, Card, CategoryBadge, CategoryPicker, Empty, Screen, Txt } from '@/components/ui';
import { useApp } from '@/data/AppContext';
import { notify } from '@/lib/dialog';
import { getCategory } from '@/engine/categories';
import { formatDateBR } from '@/engine/dates';
import { decodeBytes, parseStatement, toPreviewRows, type ParseResult } from '@/engine/import';
import { formatBRL } from '@/engine/money';
import type { TxType } from '@/engine/types';
import { useTheme } from '@/theme';

const MAX_RENDER = 150;

export default function Importar() {
  const t = useTheme();
  const { transactions, addTransactions } = useApp();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [invoice, setInvoice] = useState<boolean | null>(null); // null = automático
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [pickerFor, setPickerFor] = useState<{ index: number; type: TxType } | null>(null);
  const [busy, setBusy] = useState(false);

  const result: ParseResult | null = useMemo(() => {
    if (text === null) return null;
    return parseStatement(text, { positiveIsExpense: invoice ?? undefined });
  }, [text, invoice]);

  const rows = useMemo(() => {
    if (!result) return [];
    const known = new Set(transactions.map((x) => x.externalId).filter((x): x is string => !!x));
    return toPreviewRows(result.rows, known).map((r, i) => ({ ...r, categoryId: overrides[i] ?? r.categoryId }));
  }, [result, transactions, overrides]);

  const fresh = rows.filter((r) => !r.duplicate);
  const totalIn = fresh.filter((r) => r.type === 'income' && r.categoryId !== 'transferencia').reduce((a, r) => a + r.amountCents, 0);
  const totalOut = fresh.filter((r) => r.type === 'expense' && r.categoryId !== 'transferencia').reduce((a, r) => a + r.amountCents, 0);

  const pick = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled) return;
      const asset = res.assets[0];
      let bytes: Uint8Array;
      if (Platform.OS === 'web' && asset.file) bytes = new Uint8Array(await asset.file.arrayBuffer());
      else bytes = await new File(asset.uri).bytes();
      setFileName(asset.name);
      setOverrides({});
      setInvoice(null);
      setText(decodeBytes(bytes));
    } catch (e) {
      notify('Não foi possível ler o arquivo', (e as Error).message);
    }
  };

  const doImport = async () => {
    if (!fresh.length) return;
    setBusy(true);
    try {
      await addTransactions(fresh.map(({ duplicate: _d, ...tx }) => tx));
      notify('Importação concluída', `${fresh.length} lançamentos adicionados.`, () => router.replace('/lancamentos'));
    } catch (e) {
      notify('Erro ao importar', (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen padBottom={120}>
      {!result ? (
        <Empty icon="document-text-outline" title="Escolha o arquivo do extrato" text="No app ou site do seu banco, exporte o extrato em CSV ou OFX (também funciona com a fatura do cartão) e selecione aqui.">
          <Button title="Escolher arquivo" icon="folder-open-outline" onPress={pick} />
        </Empty>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '700' }} numberOfLines={1}>{fileName}</Txt>
                <Txt variant="small">Formato {result.format.toUpperCase()} · {rows.length} linhas lidas{result.skipped ? ` · ${result.skipped} ignoradas` : ''}</Txt>
              </View>
              <Button title="Trocar" variant="ghost" onPress={pick} />
            </View>
            {result.format === 'csv' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '600' }}>É fatura de cartão?</Txt>
                  <Txt variant="small">Em faturas, valores positivos são compras. {result.looksLikeCardInvoice && invoice === null ? 'Detectado automaticamente.' : ''}</Txt>
                </View>
                <Switch value={invoice ?? result.looksLikeCardInvoice} onValueChange={setInvoice} trackColor={{ true: t.primary, false: t.border }} />
              </View>
            ) : null}
            {result.warnings.map((w) => (
              <Txt key={w} variant="small" color={t.warning}>{w}</Txt>
            ))}
          </Card>

          {rows.length > 0 ? (
            <Card>
              <Txt variant="h2">Prévia</Txt>
              <Txt variant="small">Toque na categoria para corrigir. Linhas já importadas antes aparecem esmaecidas e são ignoradas.</Txt>
              {rows.slice(0, MAX_RENDER).map((r, i) => (
                <Pressable key={i} disabled={r.duplicate} onPress={() => setPickerFor({ index: i, type: r.type })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: r.duplicate ? 0.4 : 1 }}>
                  <CategoryBadge categoryId={r.categoryId} size={34} />
                  <View style={{ flex: 1 }}>
                    <Txt numberOfLines={1} style={{ fontWeight: '600' }}>{r.description}</Txt>
                    <Txt variant="small">{formatDateBR(r.date)} · {r.duplicate ? 'já importado' : getCategory(r.categoryId).name}</Txt>
                  </View>
                  <Txt style={{ fontWeight: '700' }} color={r.categoryId === 'transferencia' ? t.muted : r.type === 'income' ? t.income : t.expense}>
                    {r.type === 'income' ? '+' : '-'}{formatBRL(r.amountCents)}
                  </Txt>
                </Pressable>
              ))}
              {rows.length > MAX_RENDER ? <Txt variant="small">…e mais {rows.length - MAX_RENDER} linhas (todas serão importadas).</Txt> : null}
            </Card>
          ) : null}

          <Card>
            <Txt variant="h2">Resumo da importação</Txt>
            <Txt variant="muted">{fresh.length} novos · {rows.length - fresh.length} duplicados</Txt>
            <Txt>Entradas {formatBRL(totalIn)} · Saídas {formatBRL(totalOut)}</Txt>
            <Txt variant="small">Pagamentos de fatura e transferências ficam na categoria “Transferência” e não entram nas contas.</Txt>
            <Button title={`Importar ${fresh.length} lançamentos`} onPress={doImport} loading={busy} disabled={!fresh.length} />
          </Card>

          <CategoryPicker
            visible={!!pickerFor}
            type={pickerFor?.type ?? 'expense'}
            value={pickerFor ? rows[pickerFor.index]?.categoryId : undefined}
            onSelect={(c) => pickerFor && setOverrides((o) => ({ ...o, [pickerFor.index]: c }))}
            onClose={() => setPickerFor(null)}
          />
        </>
      )}
    </Screen>
  );
}

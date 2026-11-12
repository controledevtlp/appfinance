import type * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

type Asset = DocumentPicker.DocumentPickerAsset;

/**
 * Lê os bytes do arquivo escolhido.
 *
 * Cada plataforma entrega o arquivo de um jeito, então tentamos em ordem:
 *  1. o Blob do navegador (web);
 *  2. o expo-file-system (Android/iOS) — que no navegador é apenas um stub vazio;
 *  3. fetch do próprio endereço, que resolve file://, content://, blob: e data:.
 * Se tudo falhar, o erro diz o que foi tentado, para dar para relatar o problema.
 */
export async function readPickedFile(asset: Asset): Promise<Uint8Array> {
  const tried: string[] = [];

  const blob = (asset as { file?: Blob }).file;
  if (blob && typeof blob.arrayBuffer === 'function') {
    try {
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      tried.push(`blob: ${(e as Error).message}`);
    }
  }

  if (Platform.OS !== 'web' && asset.uri) {
    try {
      const handle = new File(asset.uri);
      if (typeof handle.bytes === 'function') return await handle.bytes();
      tried.push('expo-file-system: bytes() indisponível');
    } catch (e) {
      tried.push(`expo-file-system: ${(e as Error).message}`);
    }
  }

  if (asset.uri) {
    try {
      const res = await fetch(asset.uri);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      tried.push(`fetch: ${(e as Error).message}`);
    }
  }

  throw new Error(tried.length ? tried.join(' · ') : 'o seletor de arquivos não devolveu nenhum conteúdo');
}

/** Extrato de exemplo, para conferir se a importação funciona sem depender de um arquivo. */
export const SAMPLE_STATEMENT = [
  'Data;Histórico;Descrição;Valor;Saldo',
  '05/11/2026;Crédito;SALARIO EMPRESA LTDA;6.500,00;6.500,00',
  '07/11/2026;Débito;NETFLIX.COM;-55,90;6.444,10',
  '10/11/2026;Débito;ALUGUEL IMOBILIARIA;-1.650,00;4.794,10',
  '12/11/2026;Débito;ENEL DISTRIBUICAO;-182,40;4.611,70',
  '13/11/2026;Débito;IFOOD *PEDIDO;-54,90;4.556,80',
  '15/11/2026;Débito;SUPERMERCADO CARREFOUR;-287,30;4.269,50',
].join('\n');

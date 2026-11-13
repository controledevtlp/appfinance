import { formatBRL } from './money';
import type { MonthSummary } from './types';

/*
 * A voz do app: um amigo sem filtro. Elogia quando você manda bem e xinga
 * quando você faz besteira — mas sempre com o número na mão e dizendo o que
 * fazer em seguida. Palavrão sem informação é só grosseria; aqui ele serve
 * pra chamar atenção para um dado que importa.
 *
 * As frases variam de um dia para o outro (para não enjoar), mas são
 * escolhidas por uma semente fixa, não por sorteio: a tela não pode trocar
 * de frase a cada vez que redesenha.
 */

export type Mood = 'pessimo' | 'ruim' | 'atencao' | 'bom' | 'otimo';

export interface Verdict {
  mood: Mood;
  title: string;
  text: string;
}

/** Escolhe um item da lista de forma estável para a mesma semente. */
export function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(Math.trunc(seed)) % list.length];
}

/** Semente do dia: muda à meia-noite, igual o dia inteiro. */
export function daySeed(now: Date = new Date()): number {
  return now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate();
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
}

const XINGO_VERMELHO = [
  'Ô seu animal, vamos economizar, né?!',
  'Tá de sacanagem com o seu bolso, porra?',
  'Caralho, assim não tem salário que aguente.',
  'Ô criatura, o dinheiro não dá em árvore não.',
] as const;

const XINGO_RITMO = [
  'Tá torrando grana, hein, seu bicho?',
  'Calma aí, ô desgraça, o mês não acabou.',
  'Pisa no freio, porra.',
  'Ô animal, olha a velocidade desse gasto.',
] as const;

const XINGO_ESTOURO = [
  'Porra, olha o tanto de coisa estourada.',
  'Ô seu cabeça de bagre, estourou tudo.',
  'Assim você me fode, e se fode junto.',
] as const;

const PUXAO = [
  'Segura a onda aí.',
  'Abre o olho, que tá começando a escorregar.',
  'Tá quase fazendo merda. Quase.',
] as const;

const ELOGIO = [
  'Tá no controle. Assim que eu gosto.',
  'Aí sim, sem fazer cagada.',
  'Tá mandando bem, continua.',
] as const;

const ELOGIO_FORTE = [
  'Aí sim, porra! Mandou bem demais.',
  'Caralho, que orgulho de você.',
  'Tá voando, seu lindo.',
] as const;

export interface VerdictInput {
  summary: MonthSummary;
  /** Gasto acumulado menos o ritmo ideal até hoje. Positivo = gastando rápido. */
  paceDiffCents: number;
  /** Ritmo ideal acumulado até hoje (para medir o tamanho do desvio). */
  paceCents: number;
  /** O mês escolhido é o mês corrente? */
  isCurrent: boolean;
  seed?: number;
}

/**
 * O resumo sem filtro do mês: uma frase de impacto e uma explicação com o
 * número que a justifica. Vai do pior caso para o melhor e para no primeiro
 * que se aplica. Retorna null quando ainda não há o que comentar.
 */
export function verdict({ summary, paceDiffCents, paceCents, isCurrent, seed = daySeed() }: VerdictInput): Verdict | null {
  if (summary.baseIncomeCents <= 0) return null;
  if (summary.expenseCents === 0 && summary.investedCents === 0) return null;

  const over = summary.categories.filter((c) => c.status === 'over' && c.category.group !== 'poupanca' && c.spentCents > 0);
  const resources = summary.totalResourcesCents;

  // 1) Gastou mais do que entrou: o pior cenário.
  if (summary.expenseCents > resources) {
    return {
      mood: 'pessimo',
      title: pick(XINGO_VERMELHO, seed),
      text: `Você já torrou ${formatBRL(summary.expenseCents - resources)} a mais do que entrou. Isso vira dívida, dívida vira juros, e aí fodeu. Corta delivery, compras e lazer até voltar pro azul.`,
    };
  }

  // 2) Mês em andamento e gastando bem mais rápido do que cabe.
  if (isCurrent && paceCents > 0 && paceDiffCents > paceCents * 0.2) {
    return {
      mood: 'ruim',
      title: pick(XINGO_RITMO, seed),
      text: `Você tá ${formatBRL(paceDiffCents)} na frente do ritmo que cabe no mês. Se não segurar agora, a última semana vai ser no miojo.`,
    };
  }

  // 3) Várias categorias estouradas.
  if (over.length >= 3) {
    const worst = [...over].sort((a, b) => b.spentCents - b.limitCents - (a.spentCents - a.limitCents))[0];
    return {
      mood: 'ruim',
      title: pick(XINGO_ESTOURO, seed),
      text: `São ${over.length} categorias acima do que cabe. A pior é ${worst.category.name}, com ${formatBRL(worst.spentCents - worst.limitCents)} a mais. Começa por ela.`,
    };
  }

  // 4) Um deslize: passou um pouco do ritmo ou estourou uma ou duas categorias.
  if (isCurrent && paceDiffCents > 0) {
    return {
      mood: 'atencao',
      title: pick(PUXAO, seed),
      text: `Você tá ${formatBRL(paceDiffCents)} acima do ritmo. Ainda dá pra voltar pra linha sem sofrer, é só maneirar nos gastos variáveis.`,
    };
  }
  if (over.length > 0) {
    const names = over.slice(0, 2).map((c) => c.category.name).join(' e ');
    return {
      mood: 'atencao',
      title: pick(PUXAO, seed),
      text: `${names} ${over.length > 1 ? 'passaram' : 'passou'} do limite. O resto tá ok, então é só ajustar isso aí.`,
    };
  }

  // 5) Mês fechado, guardando 20% ou mais: merece festa.
  if (!isCurrent && summary.savingsRatePct >= 20) {
    return {
      mood: 'otimo',
      title: pick(ELOGIO_FORTE, seed),
      text: `Você guardou ${summary.savingsRatePct.toFixed(0)}% do que entrou e não estourou nada. É assim que se constrói patrimônio.`,
    };
  }

  return {
    mood: 'bom',
    title: pick(ELOGIO, seed),
    text: isCurrent
      ? `Você tá ${formatBRL(-paceDiffCents)} abaixo do ritmo e sem nenhuma categoria estourada. Só não vai relaxar agora.`
      : 'Fechou o mês sem estourar nenhuma categoria. Bora tentar guardar um pouco mais no próximo.',
  };
}

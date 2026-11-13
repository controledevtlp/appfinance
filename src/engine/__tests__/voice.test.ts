import { describe, expect, it } from 'vitest';
import { computeMonthSummary, samePeriodChange } from '../budget';
import { DEFAULT_SETTINGS, type Settings, type Transaction } from '../types';
import { daySeed, greeting, pick, verdict } from '../voice';

let n = 0;
const tx = (date: string, amountCents: number, categoryId: string, type: 'expense' | 'income' = 'expense'): Transaction => ({
  id: `t${++n}`,
  date,
  description: categoryId,
  amountCents,
  type,
  categoryId,
  source: 'manual',
});

const settings: Settings = { ...DEFAULT_SETTINGS, monthlyIncomeCents: 500000 };
const NOV_15 = new Date(2026, 10, 15, 12);

describe('samePeriodChange', () => {
  const txs = [
    tx('2026-10-03', 10000, 'mercado'),
    tx('2026-10-28', 90000, 'moradia'), // depois do dia de corte: fica de fora no mês corrente
    tx('2026-11-04', 15000, 'mercado'),
    tx('2026-11-10', 99900, 'investimentos'), // aporte não é gasto
    tx('2026-11-11', 5000, 'transferencia'),
  ];

  it('no mês corrente compara só até o dia de hoje dos dois lados', () => {
    expect(samePeriodChange(txs, '2026-11', NOV_15)).toEqual({ currentCents: 15000, previousCents: 10000, pct: 50 });
  });

  it('em mês fechado compara os meses inteiros', () => {
    const r = samePeriodChange(txs, '2026-11', new Date(2026, 11, 20));
    expect(r.previousCents).toBe(100000);
    expect(r.pct).toBeCloseTo(-85);
  });

  it('sem mês anterior não inventa percentual', () => {
    expect(samePeriodChange(txs, '2026-10', NOV_15).pct).toBeNull();
  });
});

describe('voz do app', () => {
  it('cumprimenta conforme a hora', () => {
    expect(greeting(new Date(2026, 0, 1, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 0, 1, 15))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 0, 1, 22))).toBe('Boa noite');
    expect(greeting(new Date(2026, 0, 1, 2))).toBe('Boa noite');
  });

  it('a frase do dia é estável, e muda de um dia pro outro', () => {
    const list = ['a', 'b', 'c'] as const;
    expect(pick(list, daySeed(NOV_15))).toBe(pick(list, daySeed(NOV_15)));
    expect(daySeed(new Date(2026, 10, 16))).toBe(daySeed(NOV_15) + 1);
    expect(pick(list, -4)).toBe('b');
  });

  const summaryOf = (txs: Transaction[], month = '2026-11', now = NOV_15) => computeMonthSummary(txs, month, settings, now);
  const base = { paceDiffCents: 0, paceCents: 200000, isCurrent: true, seed: 0 };

  it('fica quieto enquanto não tem dado', () => {
    expect(verdict({ ...base, summary: summaryOf([]) })).toBeNull();
    expect(verdict({ ...base, summary: computeMonthSummary([tx('2026-11-02', 100, 'mercado')], '2026-11', DEFAULT_SETTINGS, NOV_15) })).toBeNull();
  });

  it('xinga pra valer quando o gasto passa do que entrou, e diz de quanto é o rombo', () => {
    const v = verdict({ ...base, summary: summaryOf([tx('2026-11-02', 620000, 'compras')]) })!;
    expect(v.mood).toBe('pessimo');
    expect(v.title).toBe('Ô seu animal, vamos economizar, né?!');
    expect(v.text).toContain('R$ 1.200,00');
  });

  it('reclama do ritmo quando o desvio passa de 20%', () => {
    const summary = summaryOf([tx('2026-11-02', 30000, 'mercado')]);
    expect(verdict({ ...base, summary, paceDiffCents: 50000 })!.mood).toBe('ruim');
    expect(verdict({ ...base, summary, paceDiffCents: 10000 })!.mood).toBe('atencao');
    // Em mês fechado o ritmo não importa mais.
    expect(verdict({ ...base, summary, paceDiffCents: 50000, isCurrent: false })!.mood).toBe('otimo');
  });

  it('aponta a pior categoria quando várias estouram', () => {
    const v = verdict({
      ...base,
      summary: summaryOf([tx('2026-11-02', 90000, 'delivery'), tx('2026-11-03', 80000, 'lazer'), tx('2026-11-04', 70000, 'compras')]),
    })!;
    expect(v.mood).toBe('ruim');
    expect(v.text).toContain('3 categorias');
    expect(v.text).toMatch(/A pior é .+, com R\$ /);
  });

  it('elogia quando tá tudo certo, e faz festa em mês fechado com 20% guardado', () => {
    const txs = [tx('2026-10-05', 500000, 'salario', 'income'), tx('2026-10-06', 40000, 'mercado')];
    const fechado = verdict({ ...base, isCurrent: false, summary: summaryOf(txs, '2026-10') })!;
    expect(fechado.mood).toBe('otimo');
    const andando = verdict({ ...base, paceDiffCents: -30000, summary: summaryOf([tx('2026-11-02', 20000, 'mercado')]) })!;
    expect(andando.mood).toBe('bom');
    expect(andando.text).toContain('R$ 300,00 abaixo do ritmo');
  });
});

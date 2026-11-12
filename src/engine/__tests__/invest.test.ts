import { describe, expect, it } from 'vitest';
import {
  compareProducts,
  defaultProducts,
  irRate,
  monthlyNeeded,
  monthlyRate,
  poupancaAnnualPct,
  simulate,
} from '../invest';

describe('juros compostos', () => {
  it('converte taxa anual em mensal equivalente', () => {
    // 12,68% ao ano é exatamente 1% ao mês capitalizado.
    expect(monthlyRate(12.682503)).toBeCloseTo(0.01, 6);
    expect(monthlyRate(0)).toBe(0);
  });

  it('sem juros, o saldo é só a soma dos aportes', () => {
    const r = simulate({ initialCents: 100000, monthlyCents: 10000, months: 12, annualPct: 0 });
    expect(r.investedCents).toBe(100000 + 10000 * 12);
    expect(r.grossCents).toBe(r.investedCents);
    expect(r.interestCents).toBe(0);
    expect(r.taxCents).toBe(0);
  });

  it('capitaliza o valor inicial mês a mês', () => {
    // R$ 1.000 a 1% ao mês por 12 meses = 1000 * 1,01^12 = R$ 1.126,83
    const r = simulate({ initialCents: 100000, monthlyCents: 0, months: 12, annualPct: 12.682503 });
    expect(r.grossCents).toBe(112683);
    expect(r.points).toHaveLength(13); // inclui o mês 0
    expect(r.points[0]).toEqual({ month: 0, investedCents: 100000, balanceCents: 100000 });
  });

  it('aporte entra no fim do mês, então o último não rende', () => {
    // 2 meses, 1% a.m., aporte de 100: 100*1,01 + 100 = 201,00
    const r = simulate({ initialCents: 0, monthlyCents: 10000, months: 2, annualPct: 12.682503 });
    expect(r.grossCents).toBe(20100);
  });
});

describe('imposto de renda', () => {
  it('segue a tabela regressiva', () => {
    expect(irRate(5)).toBe(0.225); // até 180 dias
    expect(irRate(11)).toBe(0.2); // até 360
    expect(irRate(23)).toBe(0.175); // até 720
    expect(irRate(24)).toBe(0.175); // 24 meses = 720 dias, ainda na faixa anterior
    expect(irRate(25)).toBe(0.15); // acima de 720
  });

  it('incide só sobre o rendimento, nunca sobre o que você investiu', () => {
    const r = simulate({ initialCents: 100000, monthlyCents: 0, months: 12, annualPct: 12.682503 });
    expect(r.interestCents).toBe(12683);
    expect(r.taxCents).toBe(Math.round(12683 * 0.2));
    expect(r.netCents).toBe(r.grossCents - r.taxCents);
    expect(r.netCents).toBeGreaterThan(r.investedCents);
  });

  it('produto isento não paga nada', () => {
    const r = simulate({ initialCents: 100000, monthlyCents: 0, months: 12, annualPct: 12.682503, taxExempt: true });
    expect(r.taxRate).toBe(0);
    expect(r.taxCents).toBe(0);
    expect(r.netCents).toBe(r.grossCents);
  });
});

describe('poupança', () => {
  it('trava em 0,5% ao mês quando a Selic passa de 8,5%', () => {
    expect(poupancaAnnualPct(10.5)).toBeCloseTo(6.17, 2);
    expect(poupancaAnnualPct(15)).toBeCloseTo(6.17, 2); // não sobe junto com a Selic
  });

  it('abaixo de 8,5% rende 70% da Selic', () => {
    expect(poupancaAnnualPct(8)).toBeCloseTo(5.6, 2);
  });
});

describe('quanto guardar por mês', () => {
  it('o alvo é o que sobra no bolso, já sem o imposto', () => {
    const alvo = 5000000; // R$ 50 mil na mão
    const mensal = monthlyNeeded(alvo, 0, 60, 10.5);
    const conferindo = simulate({ initialCents: 0, monthlyCents: mensal, months: 60, annualPct: 10.5 });
    expect(conferindo.netCents).toBeGreaterThanOrEqual(alvo);
    expect(conferindo.netCents).toBeLessThan(alvo + 10000); // sem exagerar no arredondamento
  });

  it('com valor inicial, também chega certo no líquido', () => {
    const alvo = 3254382;
    const mensal = monthlyNeeded(alvo, 900000, 24, 10.5);
    const conferindo = simulate({ initialCents: 900000, monthlyCents: mensal, months: 24, annualPct: 10.5 });
    expect(conferindo.netCents).toBeGreaterThanOrEqual(alvo);
    expect(conferindo.netCents).toBeLessThan(alvo + 5000);
  });

  it('produto isento pede aporte menor que um tributado', () => {
    const comImposto = monthlyNeeded(5000000, 0, 60, 10.5, false);
    const isento = monthlyNeeded(5000000, 0, 60, 10.5, true);
    expect(isento).toBeLessThan(comImposto);
  });

  it('não pede aporte quando o valor inicial já chega lá sozinho', () => {
    expect(monthlyNeeded(100000, 100000, 12, 10)).toBe(0);
  });

  it('sem juros, divide o que falta pelo número de meses', () => {
    expect(monthlyNeeded(120000, 0, 12, 0)).toBe(10000);
  });
});

describe('comparação de produtos', () => {
  const base = { initialCents: 1000000, monthlyCents: 50000, months: 24 };

  it('ordena pelo líquido, não pela taxa de vitrine', () => {
    const cdi = 10.5;
    // 110% do CDI com imposto contra 95% isento: o isento ganha.
    const rows = compareProducts(defaultProducts(cdi, 110, 95), base);
    expect(rows[0].id).toBe('lci');
    expect(rows[0].behindBestCents).toBe(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].result.netCents).toBeLessThanOrEqual(rows[i - 1].result.netCents);
      expect(rows[i].behindBestCents).toBeGreaterThan(0);
    }
  });

  it('com CDB bem acima, ele passa a ganhar mesmo pagando imposto', () => {
    const rows = compareProducts(defaultProducts(10.5, 130, 90), base);
    expect(rows[0].id).toBe('cdb');
  });

  it('a poupança fica atrás das outras com a Selic alta', () => {
    const rows = compareProducts(defaultProducts(10.5), base);
    expect(rows[rows.length - 1].id).toBe('poupanca');
  });

  it('todo produto devolve uma simulação completa', () => {
    for (const row of compareProducts(defaultProducts(10.5), base)) {
      expect(row.result.points).toHaveLength(25);
      expect(row.result.investedCents).toBe(1000000 + 50000 * 24);
      expect(row.result.netCents).toBeGreaterThan(0);
    }
  });
});

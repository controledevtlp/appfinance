import { describe, expect, it } from 'vitest';
import { buildPlan, monthlyForPlan, simulatePlan, type Access, type Goal, type Nerve, type Path } from '../advisor';
import { simulate } from '../invest';

const CDI = 10.5;
const path = (p: Partial<Path> = {}): Path => ({ goal: 'render', months: 24, access: 'pode-travar', nerve: 'pouco', ...p });
const ids = (p: Partial<Path>, ctx = {}) => buildPlan(path(p), CDI, ctx).slices.map((s) => `${s.id}:${s.sharePct}`);

describe('caminho do investimento', () => {
  it('as fatias somam 100% em qualquer combinação de respostas', () => {
    const goals: Goal[] = ['reserva', 'compra', 'aposentadoria', 'render'];
    const accesses: Access[] = ['qualquer-hora', 'pode-travar'];
    const nerves: Nerve[] = ['nenhum', 'pouco', 'aguento'];
    for (const goal of goals) for (const access of accesses) for (const nerve of nerves) for (const months of [6, 12, 24, 60, 120]) {
      const plan = buildPlan({ goal, access, nerve, months }, CDI);
      expect(plan.slices.reduce((a, s) => a + s.sharePct, 0)).toBe(100);
      expect(plan.slices.length).toBeGreaterThan(0);
    }
  });

  it('reserva é sempre liquidez diária, mesmo que a pessoa diga que pode travar', () => {
    expect(ids({ goal: 'reserva', access: 'pode-travar', months: 120, nerve: 'aguento' })).toEqual(['liquidez:100']);
  });

  it('quem pode precisar a qualquer hora não entra em nada com carência', () => {
    expect(ids({ access: 'qualquer-hora', months: 120, nerve: 'aguento' })).toEqual(['liquidez:100']);
    expect(buildPlan(path({ access: 'qualquer-hora', months: 120 }), CDI).warnings.join(' ')).toContain('travar uma parte');
  });

  it('prazo curto não leva nada que oscila, aguente a pessoa o que aguentar', () => {
    const plan = buildPlan(path({ months: 12, nerve: 'aguento' }), CDI);
    expect(plan.slices).toHaveLength(1);
    expect(['isento', 'cdb-prazo']).toContain(plan.slices[0].id);
  });

  it('entre LCI e CDB escolhe quem deixa mais no bolso, e isso muda com o prazo', () => {
    // 12 meses: imposto de 20% no CDB → a LCI isenta de 90% ganha.
    expect(buildPlan(path({ months: 12 }), CDI).slices[0].id).toBe('isento');
    // 60 meses: imposto de 15% → CDB de 110% passa a LCI.
    expect(buildPlan(path({ months: 60, nerve: 'nenhum' }), CDI).slices[0].id).toBe('cdb-prazo');
  });

  it('prazo longo ganha proteção contra inflação, e renda variável só pra quem aguenta', () => {
    expect(ids({ months: 120, nerve: 'nenhum' })).toEqual(['cdb-prazo:60', 'ipca:40']);
    expect(ids({ months: 120, nerve: 'pouco' })).toEqual(['ipca:60', 'cdb-prazo:40']);
    expect(ids({ months: 120, nerve: 'aguento' })).toEqual(['ipca:50', 'cdb-prazo:30', 'variavel:20']);
  });

  it('dinheiro com data pra usar não vai pra renda variável', () => {
    const plan = buildPlan(path({ goal: 'compra', months: 120, nerve: 'aguento' }), CDI);
    expect(plan.slices.map((s) => s.id)).not.toContain('variavel');
    expect(plan.warnings.join(' ')).toContain('renda variável de fora');
  });

  it('puxa a orelha de quem quer travar dinheiro sem ter reserva', () => {
    expect(buildPlan(path(), CDI, { reserveMonths: 0.8 }).warnings[0]).toContain('0,8 mês');
    expect(buildPlan(path(), CDI, { reserveMonths: 4 }).warnings).toEqual([]);
    expect(buildPlan(path({ goal: 'reserva' }), CDI, { reserveMonths: 0 }).warnings).toEqual([]);
  });

  it('nenhuma fatia promete mais do que o CDI onde o ganho não é garantido', () => {
    const plan = buildPlan(path({ months: 120, nerve: 'aguento' }), CDI);
    for (const s of plan.slices.filter((x) => x.id === 'ipca' || x.id === 'variavel')) expect(s.annualPct).toBe(CDI);
  });
});

describe('conta do plano', () => {
  const amounts = { initialCents: 1_000_001, monthlyCents: 50_033, months: 120 };

  it('plano de uma fatia só dá o mesmo que a simulação direta', () => {
    const plan = buildPlan(path({ goal: 'reserva' }), CDI);
    const direct = simulate({ ...amounts, annualPct: CDI });
    const r = simulatePlan(plan, amounts);
    expect(r.netCents).toBe(direct.netCents);
    expect(r.points).toEqual(direct.points);
  });

  it('dividir entre fatias não perde nem cria centavo', () => {
    const plan = buildPlan(path({ months: 120, nerve: 'aguento' }), CDI);
    const r = simulatePlan(plan, amounts);
    expect(r.perSlice.reduce((a, s) => a + s.initialCents, 0)).toBe(amounts.initialCents);
    expect(r.perSlice.reduce((a, s) => a + s.monthlyCents, 0)).toBe(amounts.monthlyCents);
    expect(r.investedCents).toBe(amounts.initialCents + amounts.monthlyCents * 120);
    expect(r.netCents).toBe(r.perSlice.reduce((a, s) => a + s.netCents, 0));
    expect(r.points).toHaveLength(121);
    expect(r.points[120].investedCents).toBe(r.investedCents);
  });

  it('o aporte calculado chega no alvo líquido, e um centavo a menos não chega', () => {
    const plan = buildPlan(path({ months: 60, nerve: 'aguento' }), CDI);
    const target = 10_000_000;
    const monthly = monthlyForPlan(plan, target, 500_000, 60);
    expect(simulatePlan(plan, { initialCents: 500_000, monthlyCents: monthly, months: 60 }).netCents).toBeGreaterThanOrEqual(target);
    expect(simulatePlan(plan, { initialCents: 500_000, monthlyCents: monthly - 1, months: 60 }).netCents).toBeLessThan(target);
  });

  it('não pede aporte quando o que já tem basta, nem quando não há alvo', () => {
    const plan = buildPlan(path(), CDI);
    expect(monthlyForPlan(plan, 100_000, 500_000, 24)).toBe(0);
    expect(monthlyForPlan(plan, 0, 0, 24)).toBe(0);
  });
});

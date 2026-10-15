import test from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/financeiro-dados.js';

test('fechamento no penúltimo dia útil (fins de semana e feriados)', () => {
  assert.equal(F.diaFechamento('2026-10'), '2026-10-29'); // 31 é sábado, 30 sexta
  assert.equal(F.diaFechamento('2026-09'), '2026-09-29'); // 30 quarta
  assert.equal(F.diaFechamento('2026-12'), '2026-12-30'); // 31 quinta, 25 feriado
  assert.equal(F.diaFechamento('2026-05'), '2026-05-28'); // 31 domingo, 30 sábado, 29 sexta
  assert.equal(F.diaFechamento('2027-03'), '2027-03-30'); // 31 quarta (Sexta Santa é 26/03)
  assert.ok(F.feriados(2026).has('2026-04-03')); // Sexta-feira Santa 2026
  assert.ok(F.feriados(2026).has('2026-02-16') && F.feriados(2026).has('2026-02-17')); // Carnaval
});
test('contrato depois do fechamento vai para o mês seguinte', () => {
  assert.equal(F.competencia('2026-10-29'), '2026-10');
  assert.equal(F.competencia('2026-10-30'), '2026-11');
  assert.equal(F.competencia('2026-12-31'), '2027-01');
  assert.equal(F.competencia('2026-09-30'), '2026-10');
  // mês já fechado sem o contrato: vai para o próximo aberto
  assert.equal(F.competencia('2026-09-10', { fechamentos: { '2026-09': { ids: ['a'] } }, id: 'b' }), '2026-10');
  assert.equal(F.competencia('2026-09-10', { fechamentos: { '2026-09': { ids: ['a'] } }, id: 'a' }), '2026-09');
});
test('0,8% bruto do valor financiado, 18% de imposto', () => {
  assert.deepEqual(F.calcular(250000), { bruto: 2000, imposto: 360, liquido: 1640 });
  assert.equal(F.pct(0.8), '0,8%');
  assert.deepEqual(F.calcular(250000, F.PADRAO, { empreendimento: true }), { bruto: 600, imposto: 108, liquido: 492 });
  assert.deepEqual(F.calcular(187350.55, { taxa_bruta: 8, imposto: 18 }), { bruto: 14988.04, imposto: 2697.85, liquido: 12290.19 });
  assert.equal(F.valorEmNumero('187.350,55'), 187350.55);
  assert.equal(F.valorEmNumero('R$ 200.000'), 200000);
  assert.equal(F.valorEmNumero('1500.5'), 1500.5);
});
test('faturamento do mês: itens, totais, pendências e mês fechado congelado', () => {
  const cs = [
    { id: 'a', nome: 'Ana', contrato_numero: '1', valor_financiado: 200000, assinado_em: '2026-10-05' },
    { id: 'b', nome: 'Bia', contrato_numero: null, valor_financiado: 100000, assinado_em: '2026-10-20' },
    { id: 'c', nome: 'Caio', contrato_numero: '3', valor_financiado: 300000, assinado_em: '2026-10-30' },
  ];
  const f = F.faturamentoDoMes(cs, '2026-10', { parametros: { taxa_bruta: 8, imposto: 18 } });
  assert.deepEqual(f.itens.map((x) => x.id), ['a', 'b']);
  assert.equal(f.totais.bruto, 24000); assert.equal(f.totais.liquido, 19680); assert.equal(f.pendentes, 1);
  const fech = { '2026-10': F.retratoFechamento(f, { por: 'x', em: '2026-10-29T20:00:00Z' }) };
  const cs2 = cs.map((c) => (c.id === 'a' ? { ...c, valor_financiado: 999999 } : c));
  const f2 = F.faturamentoDoMes(cs2, '2026-10', { fechamentos: fech, parametros: { taxa_bruta: 9, imposto: 18 } });
  assert.equal(f2.totais.bruto, 24000); // retrato não muda
  assert.deepEqual(F.faturamentoDoMes(cs, '2026-11', { fechamentos: fech }).itens.map((x) => x.id), ['c']);
  assert.match(F.textoNfe(f), /competência 10\/2026: 2 contratos/);
  assert.equal(F.planilhaFaturamento(f)[0].linhas.length, 3);
});
test('empreendimento Caixa: comissão fixa de R$ 600, guardada no fechamento', () => {
  const cs = [{ id: 'a', nome: 'Ana', contrato_numero: '1', valor_financiado: 200000, assinado_em: '2026-10-05' },
    { id: 'e', nome: 'Edu', contrato_numero: '2', valor_financiado: 180000, assinado_em: '2026-10-06', empreendimento_caixa: true }];
  const f = F.faturamentoDoMes(cs, '2026-10');
  assert.equal(f.itens.find((x) => x.id === 'e').bruto, 600);
  assert.equal(f.totais.bruto, 2200);
  const fech = { '2026-10': F.retratoFechamento(f) };
  assert.deepEqual(fech['2026-10'].fixos, ['e']);
  const depois = F.faturamentoDoMes(cs.map((c) => ({ ...c, empreendimento_caixa: false })), '2026-10', { fechamentos: fech });
  assert.equal(depois.totais.bruto, 2200);
  assert.match(F.nomeRegra(f.itens[1]), /Fixo/);
});
test('lançamentos: resumo, resultado e fixas para copiar', () => {
  const ls = [
    { mes: '2026-09', tipo: 'fixa', categoria: 'Aluguel', descricao: 'Sala', valor: 2500 },
    { mes: '2026-09', tipo: 'fixa', categoria: 'Internet', descricao: 'Fibra', valor: 150 },
    { mes: '2026-10', tipo: 'fixa', categoria: 'Aluguel', descricao: 'Sala', valor: 2500 },
    { mes: '2026-10', tipo: 'variavel', categoria: 'Marketing', descricao: '', valor: 300 },
    { mes: '2026-10', tipo: 'credito', categoria: 'Reembolso', descricao: '', valor: 100 },
  ];
  const r = F.resumoLancamentos(ls, '2026-10');
  assert.equal(r.despesas, 2800); assert.equal(r.creditos, 100); assert.equal(r.porCategoria[0][0], 'Aluguel');
  const res = F.resultadoDoMes({ totais: { liquido: 16400 } }, r);
  assert.equal(res.resultado, 13700);
  assert.deepEqual(F.fixasParaCopiar(ls, '2026-10').map((l) => l.categoria), ['Internet']);
});
test('permissões: nível 1 tudo; níveis 2 e 3 conforme o nível 1', () => {
  assert.equal(F.acessoFinanceiro(1).faturamento, true);
  assert.equal(F.acessoFinanceiro(3).lancar_despesas, true);
  assert.equal(F.acessoFinanceiro(3).faturamento, false);
  assert.equal(F.acessoFinanceiro(3).ver_todos, false);
  assert.equal(F.acessoFinanceiro(2, { 2: { lancar_creditos: false } }).lancar_creditos, false);
  assert.equal(F.acessoFinanceiro(3, { 3: { lancar_despesas: false, lancar_creditos: false } }).lancar_despesas, false);
});

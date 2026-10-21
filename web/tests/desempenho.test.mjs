import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/desempenho-dados.js';
import * as R from '../js/regras.js';

const agora = new Date(2026, 9, 20, 12); // 20/out/2026
const cli = (id, corretor, nome, enviado, status = 'cadastro_recebido') => ({ id, corretor_id: corretor, corretor_nome: nome, enviado_em: enviado, status, programa: 'MCMV' });

test('evolução do mês: uma linha por corretor, acumulada até hoje', () => {
  const clientes = [cli('a', 'c1', 'Ana', '2026-10-02T10:00:00'), cli('b', 'c1', 'Ana', '2026-10-15T10:00:00'), cli('c', 'c2', 'João', '2026-10-05T10:00:00'), cli('d', 'c2', 'João', '2026-09-30T10:00:00')];
  const ev = P.evolucaoDoMes('abertos', clientes, [], { grupo: 'corretor', agora, nomes: { c1: 'Ana', c2: 'João', c3: 'Pedro' } });
  assert.equal(ev.dias, 31); assert.equal(ev.hoje, 20);
  const ana = ev.series.find((s) => s.id === 'c1');
  assert.equal(ana.total, 2); assert.equal(ana.valores[0], 0); assert.equal(ana.valores[1], 1); assert.equal(ana.valores[14], 2); assert.equal(ana.valores[20], null);
  assert.equal(ev.series.find((s) => s.id === 'c2').total, 1); // setembro não conta
  assert.equal(ev.series.find((s) => s.id === 'c3').total, 0); // quem não pontuou aparece com zero
  assert.equal(ev.series[0].id, 'c1'); // ordenado por total
});

test('evolução do corretor: este mês e mês anterior', () => {
  const clientes = [cli('a', 'c1', 'Ana', '2026-10-02T10:00:00'), cli('b', 'c1', 'Ana', '2026-09-10T10:00:00'), cli('c', 'c1', 'Ana', '2026-09-25T10:00:00')];
  const ev = P.evolucaoDoMes('abertos', clientes, [], { agora });
  assert.equal(ev.series[0].total, 1); assert.equal(ev.series[1].total, 2); assert.equal(ev.series[1].valores.length, 31);
});

test('mais de 6 corretores: os demais viram uma linha só', () => {
  const clientes = Array.from({ length: 9 }, (_, i) => cli(`x${i}`, `c${i}`, `C${i}`, '2026-10-03T10:00:00'));
  const ev = P.evolucaoDoMes('abertos', clientes, [], { grupo: 'corretor', agora });
  assert.equal(ev.series.length, 7); assert.equal(ev.series[6].id, 'demais'); assert.equal(ev.series[6].total, 3);
});

test('pizza por fase', () => {
  const r = P.porFase([cli('a', 1, 'A', 'x', 'em_analise'), cli('b', 1, 'A', 'x', 'contrato_assinado'), cli('c', 1, 'A', 'x', 'credito_liberado'), { id: 'r', rascunho: true, status: 'cadastro_recebido' }]);
  assert.equal(r.total, 3); assert.equal(r.itens.find((x) => x.id === 'concluido').valor, 2);
});

test('CTPS digital pelo CPF e GRERJ da busca', () => {
  assert.deepEqual(R.ctpsDigitalDoCpf('123.456.789-01'), { numero: '1234567', serie: '8901' });
  assert.equal(R.ctpsDigitalDoCpf('123'), null);
  assert.equal(R.textoCtps({ ctps_numero: '1234567', ctps_serie: '8901' }), '1234567 · série 8901');
  assert.equal(R.grerjDaBusca([]), 2);
  assert.equal(R.grerjDaBusca([{ papel: 'conjuge', nome: 'X' }, { papel: 'comprador', nome: 'Y' }]), 6);
});

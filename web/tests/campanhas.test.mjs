import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campanhas-dados.js';

const em = (iso, h = 12) => `${iso}T${String(h).padStart(2, '0')}:00:00-03:00`;
const imobs = [{ id: 'i1', nome: 'Imob 1' }, { id: 'i2', nome: 'Imob 2' }];
const corretores = [{ id: 'c1', nome: 'Ana', imobiliaria_id: 'i1' }, { id: 'c2', nome: 'Bia', imobiliaria_id: 'i2' }, { id: 'c3', nome: 'Caio', imobiliaria_id: null }];
const cli = (id, c, i) => ({ id, rascunho: false, corretor_id: c, imobiliaria_id: i, enviado_em: em('2026-09-01') });
const clientes = [cli('a', 'c1', 'i1'), cli('b', 'c1', 'i1'), cli('c', 'c2', 'i2'), cli('d', 'c3', null), cli('e', 'c2', 'i2')];
const hist = [
  { cliente_id: 'a', para: 'contrato_assinado', em: em('2026-10-05') },
  { cliente_id: 'b', para: 'contrato_assinado', em: em('2026-10-20') },
  { cliente_id: 'c', para: 'contrato_assinado', em: em('2026-10-03') },
  { cliente_id: 'e', para: 'contrato_assinado', em: em('2026-10-25') },
  { cliente_id: 'd', para: 'contrato_assinado', em: em('2026-09-30', 23) }, // antes do período
];
const camp = { id: 'k', metrica: 'assinados', inicio: '2026-10-01', fim: '2026-10-31', mostrar_nomes: true };
const dados = { clientes, historico: hist, corretores, imobiliarias: imobs, euId: 'c2', minhaImobiliariaId: 'i2' };

test('placar conta só dentro do período e desempata por quem chegou primeiro', () => {
  const p = C.placarCampanha(camp, dados);
  const im = C.doGrupo(p, 'imobiliaria');
  assert.deepEqual(im.map((x) => [x.nome, x.valor, x.posicao]), [['Imob 1', 2, 1], ['Imob 2', 2, 2]]); // empate 2x2: a Imob 1 completou em 20/10, a Imob 2 em 25/10
});
test('desempate: o último contrato mais antigo ganha', () => {
  const p = C.doGrupo(C.placarCampanha(camp, dados), 'imobiliaria');
  assert.equal(p[0].nome, 'Imob 1');
});
test('corretor sem pontos não tem posição e autônomo fora do período não pontua', () => {
  const c = C.doGrupo(C.placarCampanha(camp, dados), 'corretor');
  assert.equal(c.find((x) => x.nome === 'Caio').valor, 0);
  assert.equal(c.find((x) => x.nome === 'Caio').posicao, null);
  assert.equal(c[0].nome, 'Ana'); assert.equal(c[1].nome, 'Bia');
});
test('limite de datas: o dia final conta inteiro e o dia anterior não entra', () => {
  const h2 = [...hist, { cliente_id: 'd', para: 'contrato_assinado', em: em('2026-10-31', 23) }];
  const c = C.doGrupo(C.placarCampanha(camp, { ...dados, historico: h2.filter((x) => !(x.cliente_id === 'd' && x.em.startsWith('2026-09'))) }), 'corretor');
  assert.equal(c.find((x) => x.nome === 'Caio').valor, 1);
});
test('visibilidade: sem nomes, o corretor só vê a si mesmo', () => {
  const p = C.placarCampanha({ ...camp, mostrar_nomes: false }, dados);
  const v = C.placarVisivel(p, { mostrar_nomes: false }, { equipe: false });
  assert.deepEqual(v.map((x) => x.nome).sort(), ['Bia', 'Imob 2']);
  assert.equal(C.placarVisivel(p, { mostrar_nomes: false }, { equipe: true }).length, p.length);
});
test('situação da campanha', () => {
  assert.equal(C.situacaoCampanha(camp, new Date('2026-10-14T15:00:00Z')).estado, 'andamento');
  assert.equal(C.situacaoCampanha(camp, new Date('2026-10-14T15:00:00Z')).dias, 17);
  assert.equal(C.situacaoCampanha(camp, new Date('2026-11-01T15:00:00Z')).estado, 'encerrada');
  assert.equal(C.situacaoCampanha(camp, new Date('2026-09-25T15:00:00Z')).estado, 'agendada');
});
test('metas por mês usam o valor do mês e, na falta, o padrão', () => {
  const m = C.metasDoMesDefinidas('2026-10', [{ mes: '2026-10-01', metrica: 'assinados', valor: 9 }], { meta_abertos: '20', meta_contratos: '4' });
  assert.deepEqual([m.abertos, m.minutas, m.assinados, m.proprias], [20, 0, 9, 1]);
  assert.equal(C.somarMes('2026-12', 1), '2027-01'); assert.equal(C.nomeMes('2026-10'), 'outubro de 2026');
});

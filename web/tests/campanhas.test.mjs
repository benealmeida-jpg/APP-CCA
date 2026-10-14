import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campanhas-dados.js';

const em = (iso, h = 12) => `${iso}T${String(h).padStart(2, '0')}:00:00-03:00`;
const imobs = [{ id: 'i1', nome: 'Imob 1' }, { id: 'i2', nome: 'Imob 2' }];
const corretores = [{ id: 'c1', nome: 'Ana', imobiliaria_id: 'i1' }, { id: 'c2', nome: 'Bia', imobiliaria_id: 'i2' }, { id: 'c3', nome: 'Caio', imobiliaria_id: null }];
const cli = (id, c, i, vend = 'v-pf') => ({ id, rascunho: false, corretor_id: c, imobiliaria_id: i, vendedor_id: vend, enviado_em: em('2026-09-01') });
const vendedores = [{ id: 'v-pf', tipo: 'PF' }, { id: 'v-emp', tipo: 'PJ', pj_tipo: 'Empreendimento' }, { id: 'v-av', tipo: 'PJ', pj_tipo: 'Avulso' }];
const clientes = [cli('a', 'c1', 'i1'), cli('b', 'c1', 'i1'), cli('c', 'c2', 'i2'), cli('d', 'c3', null), cli('e', 'c2', 'i2', 'v-emp')];
const hist = [
  { cliente_id: 'a', para: 'contrato_assinado', em: em('2026-10-05') },
  { cliente_id: 'b', para: 'contrato_assinado', em: em('2026-10-20') },
  { cliente_id: 'c', para: 'contrato_assinado', em: em('2026-10-03') },
  { cliente_id: 'e', para: 'contrato_assinado', em: em('2026-10-25') },
  { cliente_id: 'd', para: 'contrato_assinado', em: em('2026-09-30', 23) }, // antes do período
];
const camp = { id: 'k', metrica: 'assinados', inicio: '2026-10-01', fim: '2026-10-31', mostrar_nomes: true };
const dados = { clientes, historico: hist, corretores, imobiliarias: imobs, vendedores, gestores: [{ id: 'g1', nome: 'Gil', imobiliaria_id: 'i1' }], euId: 'c2', minhaImobiliariaId: 'i2' };

test('imóvel avulso vale 2 pontos e empreendimento 1; desempate por quem chegou primeiro', () => {
  const im = C.doGrupo(C.placarCampanha(camp, dados), 'imobiliaria');
  // Imob 1: a (2) + b (2) = 4 pontos; Imob 2: c (2) + e (empreendimento, 1) = 3 pontos
  assert.deepEqual(im.map((x) => [x.nome, x.valor, x.contratos, x.posicao]), [['Imob 1', 4, 2, 1], ['Imob 2', 3, 2, 2]]);
  assert.equal(im[0].subnome, 'gestor Gil');
});
test('pontos da campanha podem mudar', () => {
  const im = C.doGrupo(C.placarCampanha({ ...camp, pontos_avulso: 1, pontos_empreendimento: 5 }, dados), 'imobiliaria');
  assert.deepEqual(im.map((x) => [x.nome, x.valor]), [['Imob 2', 6], ['Imob 1', 2]]);
});
test('empate em pontos: ganha quem completou primeiro', () => {
  const im = C.doGrupo(C.placarCampanha({ ...camp, pontos_avulso: 1, pontos_empreendimento: 1 }, dados), 'imobiliaria');
  assert.equal(im[0].nome, 'Imob 1'); // 2x2: a imob 1 fechou o 2º em 20/10, a 2 em 25/10
});
test('autônomo disputa separado e corretor de imobiliária não entra nele', () => {
  const p = C.placarCampanha(camp, dados);
  assert.deepEqual(C.doGrupo(p, 'autonomo').map((x) => x.nome), ['Caio']);
  assert.deepEqual(C.doGrupo(p, 'corretor').map((x) => x.nome), ['Ana', 'Bia']);
  assert.equal(C.doGrupo(p, 'autonomo')[0].valor, 0); assert.equal(C.doGrupo(p, 'autonomo')[0].posicao, null);
});
test('o dia final conta inteiro e o dia anterior ao início não entra', () => {
  const h2 = [...hist.filter((x) => !(x.cliente_id === 'd')), { cliente_id: 'd', para: 'contrato_assinado', em: em('2026-10-31', 23) }];
  const c = C.doGrupo(C.placarCampanha(camp, { ...dados, historico: h2 }), 'autonomo');
  assert.equal(c[0].valor, 2);
  assert.equal(C.doGrupo(C.placarCampanha(camp, dados), 'autonomo')[0].valor, 0);
});
test('só aparecem as disputas que têm prêmio', () => {
  const c = { premios: [{ categoria: 'imobiliaria', posicao: 1, descricao: 'x' }, { categoria: 'autonomo', posicao: 1, descricao: 'y' }, { categoria: 'corretor', posicao: 1, descricao: 'z', removido: true }] };
  assert.deepEqual(C.categoriasDaCampanha(c), ['imobiliaria', 'autonomo']);
  assert.equal(C.categoriasDaCampanha({ premios: [] }).length, 3);
});
test('visibilidade: sem nomes, o corretor só vê a si mesmo', () => {
  const p = C.placarCampanha({ ...camp, mostrar_nomes: false }, dados);
  const v = C.placarVisivel(p, { mostrar_nomes: false }, { equipe: false });
  assert.deepEqual(v.map((x) => x.nome).sort(), ['Bia', 'Imob 2']);
  assert.equal(C.regraPontos(camp), 'Imóvel avulso vale 2 pontos · empreendimento vale 1 ponto');
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

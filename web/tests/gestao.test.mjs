import test from 'node:test';
import assert from 'node:assert/strict';
import { faseDe, resumoGestao, porCorretor, processosParados, conversasDaImobiliaria } from '../js/gestao-dados.js';

const agora = new Date('2026-10-14T12:00:00');
const dias = (n) => new Date(agora.getTime() - n * 86400000).toISOString();
const clientes = [
  { id: 1, nome: 'Ana', corretor_id: 'a', corretor_nome: 'Ana C', status: 'em_analise', status_desde: dias(1), atualizado_em: dias(1), docs_pendentes: 2, conversa_nao_lidas: 1, conversa_ultima: dias(0) },
  { id: 2, nome: 'Bia', corretor_id: 'a', corretor_nome: 'Ana C', status: 'minuta_em_maos', status_desde: dias(9), atualizado_em: dias(9) },
  { id: 3, nome: 'Caio', corretor_id: 'b', corretor_nome: 'Bruno', status: 'credito_liberado', status_desde: dias(30), atualizado_em: dias(30) },
  { id: 4, nome: 'Duda', corretor_id: 'b', corretor_nome: 'Bruno', status: 'cadastro_recebido', rascunho: true },
  { id: 5, nome: 'Edu', corretor_id: 'x', corretor_nome: 'Ex-corretor', status: 'entrevista', status_desde: dias(2), atualizado_em: dias(2) },
  { id: 6, nome: 'Fê', corretor_id: 'b', corretor_nome: 'Bruno', status: 'entrevista_reprovada', status_desde: dias(20), atualizado_em: dias(20) },
];
const corretores = [{ id: 'a', nome: 'Ana C', papel: 'corretor' }, { id: 'b', nome: 'Bruno', papel: 'corretor' }, { id: 'c', nome: 'Carla', papel: 'corretor' }, { id: 'g', nome: 'Luciana', papel: 'gestor_imobiliaria' }];

test('fases do processo', () => {
  assert.equal(faseDe('entrevista'), 'andamento'); assert.equal(faseDe('conformidade'), 'finalizacao'); assert.equal(faseDe('conformidade_final'), 'finalizacao');
  assert.equal(faseDe('credito_liberado'), 'finalizado'); assert.equal(faseDe('entrevista_reprovada'), 'encerrado');
});
test('resumo geral ignora rascunho e filtra por corretor', () => {
  const r = resumoGestao(clientes, { agora });
  assert.deepEqual([r.andamento, r.finalizacao, r.finalizados, r.encerrados, r.total], [2, 1, 1, 1, 5]);
  assert.equal(r.parados, 1); assert.equal(r.pendencias, 1); assert.equal(r.naoLidas, 1);
  assert.equal(resumoGestao(clientes, { agora, corretorId: 'b' }).total, 2);
});
test('por corretor: inclui sem clientes e quem saiu da imobiliária', () => {
  const l = porCorretor(clientes, corretores, { agora });
  assert.equal(l.find((x) => x.id === 'c').total, 0);
  assert.equal(l.find((x) => x.id === 'x').antigo, true);
  assert.equal(l.find((x) => x.id === 'a').parados, 1);
  assert.equal(l.find((x) => x.id === 'g').gestor, true);
  assert.equal(l[0].id, 'a');
});
test('parados e conversas', () => {
  const p = processosParados(clientes, { agora });
  assert.deepEqual(p.map((x) => x.id), [2]); assert.equal(p[0].dias, 9);
  assert.deepEqual(conversasDaImobiliaria(clientes).map((x) => x.id), [1]);
});

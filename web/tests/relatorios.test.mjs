// node --test web/tests/relatorios.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/regras.js';
import { calcularRelatorio, planilhasDoRelatorio, intervaloPeriodo } from '../js/relatorios-dados.js';
import { gerarXlsx } from '../js/xlsx-simples.js';

const agora = new Date('2026-10-12T15:00:00-03:00');
const d = (n) => new Date(agora.getTime() - n * 864e5).toISOString();

test('processo parado: conta dias no mesmo status, ignora rascunho e contrato assinado', () => {
  assert.equal(R.diasParado({ status: 'em_analise', status_desde: d(7) }, 5, agora), 7);
  assert.equal(R.diasParado({ status: 'em_analise', status_desde: d(4) }, 5, agora), 0);
  assert.equal(R.diasParado({ status: 'contrato_assinado', status_desde: d(30) }, 5, agora), 0);
  assert.equal(R.diasParado({ status: 'em_analise', rascunho: true, status_desde: d(30) }, 5, agora), 0);
  assert.equal(R.diasParado({ status: 'cadastro_ok', enviado_em: d(10) }, 5, agora), 10);
});

test('período: este mês começa no dia 1; escolher datas inclui o dia final', () => {
  assert.equal(intervaloPeriodo('mes', {}, agora).ini.getDate(), 1);
  const p = intervaloPeriodo('personalizado', { de: '2026-10-01', ate: '2026-10-05' }, agora);
  assert.equal(p.ini.getDate(), 1);
  assert.equal(p.fim.getDate(), 6);
  assert.deepEqual(intervaloPeriodo('tudo', {}, agora), { ini: null, fim: null });
});

const clientes = [
  { id: 'a', nome: 'A', corretor_id: 'u1', corretor_nome: 'João', imobiliaria_id: 'i1', imobiliaria_nome: 'Imob', status: 'documentacao_pendente', enviado_em: d(9), status_desde: d(8), docs_pendentes: 1, docs_recusados: 0 },
  { id: 'b', nome: 'B', corretor_id: 'u1', corretor_nome: 'João', imobiliaria_id: 'i1', imobiliaria_nome: 'Imob', status: 'cliente_aprovado', enviado_em: d(26), status_desde: d(3), docs_pendentes: 0, docs_recusados: 0 },
  { id: 'c', nome: 'C', corretor_id: 'u2', corretor_nome: 'Pedro', imobiliaria_id: null, imobiliaria_nome: 'Autônomo', status: 'em_analise', enviado_em: d(40), status_desde: d(2), docs_pendentes: 0, docs_recusados: 0 },
  { id: 'r', nome: 'Rascunho', corretor_id: 'u1', rascunho: true, status: 'cadastro_recebido', criado_em: d(1) },
];
const historico = [
  { cliente_id: 'b', de: 'cadastro_recebido', para: 'em_analise', em: d(16) },
  { cliente_id: 'b', de: 'em_analise', para: 'cliente_aprovado', em: d(6) },
];

test('relatório: totais, taxa, tempo até aprovar e tempo por etapa', () => {
  const rel = calcularRelatorio({ clientes, historico, agora });
  assert.equal(rel.resumo.enviados, 3);
  assert.equal(rel.resumo.aprovados, 1);
  assert.equal(Math.round(rel.resumo.taxa * 100), 33);
  assert.equal(rel.resumo.parados, 1); // A (8 dias); B aprovado há 3; C há 2
  assert.equal(rel.resumo.mediaDiasAprovacao, 20);
  const analise = rel.porEtapa.find((e) => e.codigo === 'em_analise');
  assert.equal(analise.passagens, 1);
  assert.equal(analise.mediaDias, 10);
  assert.equal(rel.porImobiliaria.find((g) => g.chave === 'autonomo').enviados, 1);
});

test('relatório: filtros de imobiliária, corretor e período', () => {
  assert.equal(calcularRelatorio({ clientes, historico, agora, filtros: { imobiliaria: 'autonomo' } }).resumo.enviados, 1);
  assert.equal(calcularRelatorio({ clientes, historico, agora, filtros: { corretor: 'u1' } }).resumo.enviados, 2);
  assert.equal(calcularRelatorio({ clientes, historico, agora, filtros: { periodo: '30' } }).resumo.enviados, 2);
});

test('Excel: gera um .xlsx (zip) com as abas', async () => {
  const blob = gerarXlsx(planilhasDoRelatorio(calcularRelatorio({ clientes, historico, agora })));
  const b = new Uint8Array(await blob.arrayBuffer());
  assert.equal(b[0], 0x50); assert.equal(b[1], 0x4B); // "PK"
  const texto = new TextDecoder().decode(b);
  for (const aba of ['Resumo', 'Clientes', 'Por status', 'Por imobiliária', 'Por corretor', 'Tempo por etapa']) assert.ok(texto.includes(`name="${aba}"`), aba);
});

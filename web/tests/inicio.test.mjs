import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/inicio-dados.js';

const agora = new Date(2026, 9, 14, 10, 0, 0); // 14/10/2026
const d = (y, m, dia) => new Date(y, m - 1, dia, 9).toISOString();
const clientes = [
  { id: 'a', rascunho: false, status: 'minuta_em_maos', enviado_em: d(2026, 10, 2), corretor_id: 'c1', corretor_nome: 'Ana', imobiliaria_id: 'i1', imobiliaria_nome: 'Imob 1' },
  { id: 'b', rascunho: false, status: 'minuta_em_maos', enviado_em: d(2026, 9, 5), corretor_id: 'c2', corretor_nome: 'Bia', imobiliaria_id: null, imobiliaria_nome: 'Autônomo' },
  { id: 'c', rascunho: false, status: 'em_analise', enviado_em: d(2026, 9, 6), corretor_id: 'c2', corretor_nome: 'Bia', imobiliaria_id: null, imobiliaria_nome: 'Autônomo' },
  { id: 'r', rascunho: true, status: 'cadastro_recebido', enviado_em: null, corretor_id: 'c1', corretor_nome: 'Ana' },
];
const historico = [{ cliente_id: 'a', para: 'minuta_em_maos', em: d(2026, 10, 10) }, { cliente_id: 'b', para: 'minuta_em_maos', em: d(2026, 9, 20) }];

test('indicador compara com o mês anterior e ignora rascunho', () => {
  const ab = D.indicador('abertos', 'mes', clientes, historico, agora);
  assert.equal(ab.valor, 1); assert.equal(ab.anterior, 2); assert.equal(ab.variacao, -50);
  const mi = D.indicador('minutas', 'mes', clientes, historico, agora);
  assert.equal(mi.valor, 1); assert.equal(mi.anterior, 0); assert.equal(mi.variacao, null);
});
test('série mensal tem 6 meses com o atual por último', () => {
  const s = D.serieMensal('minutas', clientes, historico, { agora });
  assert.equal(s.length, 6); assert.equal(s[5].rotulo, 'out'); assert.equal(s[5].valor, 1); assert.equal(s[4].valor, 1); assert.equal(s[5].atual, true);
});
test('ranking agrupa por imobiliária (autônomos juntos) e por corretor', () => {
  const r = D.ranking('imobiliaria', 'abertos', 'ano', clientes, historico, { agora });
  assert.equal(r.total, 3); assert.equal(r.itens[0].nome, 'Autônomo'); assert.equal(r.itens[0].valor, 2);
  assert.equal(D.ranking('corretor', 'abertos', 'ano', clientes, historico, { agora }).itens[0].nome, 'Bia');
});
test('validade dos laudos e prazos da equipe', () => {
  const eng = [{ id: 'e1', laudo_aprovado: true, avaliacao_data: '2026-04-20', vendedor: { nome: 'Zé' } }, { id: 'e2', etapa: 'em_analise', docs_novos: true }];
  const v = D.validades(eng, agora); assert.equal(v.length, 1); assert.ok(v[0].dias >= 0 && v[0].dias <= 30);
  const p = D.pendenciasEquipe({ clientes: [], engenharias: eng, agora });
  assert.ok(p.prazos.some((x) => x.tipo === 'validade')); assert.ok(p.fazer.some((x) => x.tipo === 'eng-docs'));
});
test('dica do dia e saudação', () => { assert.ok(D.dicaDoDia(D.DICAS_EQUIPE, agora)); assert.equal(D.saudacao(agora), 'Bom dia'); });

test('alertas: certidões vencidas ou perto de vencer e descontos de cartório pendentes', async () => {
  const R = await import('../js/regras.js');
  const tipos = [{ codigo: 'ONUS_REAIS', nome: 'Certidão de ônus reais (vale 30 dias úteis)', pede_emissao: true, validade_dias: 30, validade_uteis: true },
    { codigo: 'VEND_ITC_IMOVEL', nome: 'Certidão de ITC no endereço do imóvel (vale 90 dias)', pede_emissao: true, validade_dias: 90 }];
  const cl = [{ id: 'a', nome: 'Ana', rascunho: false, status: 'em_analise', desconto_cartorio: true, valor_imovel: 500000 },
    { id: 'b', nome: 'Bia', rascunho: false, status: 'contrato_assinado' },
    { id: 'c', nome: 'Cris', rascunho: false, status: 'em_analise', desconto_cartorio: true, valor_imovel: 500000, grerj_pago_em: '2026-10-01' }];
  const emissoes = [
    { tipo_codigo: 'ONUS_REAIS', cliente_id: 'a', emitido_em: '2026-08-01' },      // vencido
    { tipo_codigo: 'ONUS_REAIS', cliente_id: 'c', emitido_em: '2026-09-10' },      // atenção
    { tipo_codigo: 'ONUS_REAIS', cliente_id: 'c', emitido_em: '2026-10-10' },      // ok
    { tipo_codigo: 'VEND_ITC_IMOVEL', cliente_id: 'b', emitido_em: '2026-01-01' }, // processo concluído: ignora
  ];
  const { fazer, prazos } = D.pendenciasEquipe({ clientes: cl, engenharias: [], emissoes, tipos, agora });
  const cert = prazos.filter((p) => p.tipo === 'certidao');
  assert.equal(cert.length, 2); assert.equal(cert[0].tom, 'alerta'); assert.equal(cert[1].tom, 'atencao');
  assert.match(cert[0].quando, /vencido/);
  const cart = fazer.find((f) => f.tipo === 'cartorio');
  assert.equal(cart.valor, 2); assert.match(cart.detalhe, /1 GRERJ para pagar/); assert.match(cart.detalhe, /1 requerimento para enviar/);
  assert.equal(D.pendenciasCorretor({ clientes: cl, engenharias: [], emissoes, tipos, agora }).prazos.filter((p) => p.tipo === 'certidao').length, 2);
});

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
  const tipos = [{ codigo: 'ONUS_REAIS', nome: 'Certidão de ônus reais (vale 30 dias)', pede_emissao: true, validade_dias: 30, validade_uteis: false },
    { codigo: 'VEND_ITC_IMOVEL', nome: 'Certidão de ITC no endereço do imóvel (vale 90 dias)', pede_emissao: true, validade_dias: 90 }];
  const cl = [{ id: 'a', nome: 'Ana', rascunho: false, status: 'em_analise', desconto_cartorio: true, valor_imovel: 500000 },
    { id: 'b', nome: 'Bia', rascunho: false, status: 'credito_liberado' },
    { id: 'c', nome: 'Cris', rascunho: false, status: 'em_analise', desconto_cartorio: true, valor_imovel: 500000, grerj_pago_em: '2026-10-01' }];
  const emissoes = [
    { tipo_codigo: 'ONUS_REAIS', cliente_id: 'a', emitido_em: '2026-08-01' },      // vencido
    { tipo_codigo: 'ONUS_REAIS', cliente_id: 'c', emitido_em: '2026-09-20' },      // atenção (vence 20/10, 30 dias corridos)
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

test('metas do mês, aniversariantes, tempo por etapa, recusas, inativos, programa e aniversário de contrato', () => {
  const m = D.metasDoMes({ abertos: 4, minutas: 1, assinados: 0 }, clientes, historico, agora);
  assert.equal(m.find((x) => x.cod === 'abertos').valor, 1); assert.equal(m.find((x) => x.cod === 'abertos').ritmo, 'atrasada');
  assert.equal(m.find((x) => x.cod === 'minutas').ritmo, 'batida'); assert.equal(m.find((x) => x.cod === 'assinados').ritmo, 'sem_meta');
  const cl = [{ id: 'a', nome: 'Ana', rascunho: false, data_nascimento: '1990-10-20', programa: 'MCMV', corretor_id: 'p1', enviado_em: d(2026, 10, 1) },
    { id: 'b', nome: 'Beto', rascunho: false, data_nascimento: '1985-10-03', programa: 'MCMV', corretor_id: 'p1', enviado_em: d(2026, 5, 1) },
    { id: 'c', nome: 'Caio', rascunho: false, data_nascimento: '1985-11-03', programa: 'SBPE', corretor_id: 'p2', enviado_em: d(2026, 9, 1) },
    { id: 'r', nome: 'Rascunho', rascunho: true, data_nascimento: '1985-10-14' }];
  const an = D.aniversariantes(cl, agora);
  assert.deepEqual(an.map((x) => x.c.nome), ['Beto', 'Ana']); assert.equal(an[0].passou, true); assert.equal(an[1].idade, 36);
  assert.deepEqual(D.porPrograma(cl).itens.map((x) => [x.nome, x.valor]), [['MCMV', 2], ['SBPE', 1]]);
  const h2 = [{ cliente_id: 'a', para: 'cadastro_recebido', em: d(2026, 10, 1) }, { cliente_id: 'a', para: 'documentacao_pendente', em: d(2026, 10, 3) }, { cliente_id: 'a', para: 'em_analise', em: d(2026, 10, 9) }];
  const t = D.tempoPorEtapa(h2, cl);
  assert.equal(t.itens.find((x) => x.codigo === 'cadastro_recebido').media, 2); assert.equal(t.maisLenta.codigo, 'documentacao_pendente');
  const rec = D.motivosRecusa([{ motivo_recusa: 'Documento cortado', conferido_em: d(2026, 10, 1) }, { motivo_recusa: 'Documento cortado', conferido_em: d(2026, 9, 1) }, { motivo_recusa: 'Ilegível', conferido_em: d(2025, 1, 1) }], { agora });
  assert.equal(rec.total, 2); assert.equal(rec.itens[0].valor, 2);
  const ina = D.corretoresInativos([{ id: 'p1', nome: 'P1', papel: 'corretor' }, { id: 'p2', nome: 'P2', papel: 'corretor' }, { id: 'p3', nome: 'P3', papel: 'corretor' }, { id: 'g', papel: 'gestor_imobiliaria' }], cl, { agora });
  assert.deepEqual(ina.map((x) => x.id), ['p3', 'p2']); assert.equal(ina[0].nunca, true);
  const ct = D.aniversarioContrato([{ id: 'a', nome: 'Ana', rascunho: false }], [{ cliente_id: 'a', para: 'contrato_assinado', em: d(2025, 10, 20) }], { agora });
  assert.equal(ct.length, 1); assert.equal(ct[0].anos, 1); assert.equal(ct[0].dias, 6);
  const rs = D.resumoSemana(cl, historico, { agora });
  assert.match(rs.texto, /Resumo da semana/); assert.equal(rs.linhas.length, 4);
});

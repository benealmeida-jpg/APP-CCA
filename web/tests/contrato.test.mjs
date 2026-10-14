import test from 'node:test';
import assert from 'node:assert/strict';
import { efeitoDoArquivo, passoContrato, mostraContrato, arquivosAtuais, podeAnexar } from '../js/contrato-dados.js';

test('três arquivos de preparo levam de Conformidade para Contrato e avisam o corretor', () => {
  assert.equal(efeitoDoArquivo({ status: 'conformidade', tipo: 'minuta', ativos: ['minuta', 'carta_credito'], nomeCliente: 'Ana', equipe: true }).irPara, null);
  const e = efeitoDoArquivo({ status: 'conformidade', tipo: 'carta_credito', ativos: ['minuta', 'carta_credito', 'planilha_progressao'], nomeCliente: 'Ana', equipe: true });
  assert.equal(e.irPara, 'minuta_em_maos'); assert.match(e.mensagem, /disponível para assinatura/);
});
test('minuta assinada pelo corretor avisa a equipe pela conversa; pela equipe não', () => {
  assert.match(efeitoDoArquivo({ status: 'minuta_em_maos', tipo: 'minuta_assinada', ativos: ['minuta_assinada'], nomeCliente: 'Ana', equipe: false }).conversa, /minuta assinada/);
  assert.equal(efeitoDoArquivo({ status: 'minuta_em_maos', tipo: 'minuta_assinada', ativos: ['minuta_assinada'], nomeCliente: 'Ana', equipe: true }).conversa, null);
});
test('contrato + validador + procuração: Contrato assinado e já em Registro', () => {
  assert.equal(efeitoDoArquivo({ status: 'minuta_em_maos', tipo: 'procuracao_gerente', ativos: ['contrato_assinado', 'validador_assinatura'], nomeCliente: 'Ana', equipe: true }).irPara, null);
  const e = efeitoDoArquivo({ status: 'minuta_em_maos', tipo: 'procuracao_gerente', ativos: ['contrato_assinado', 'validador_assinatura', 'procuracao_gerente'], nomeCliente: 'Ana', equipe: true });
  assert.deepEqual(e.historico, ['contrato_assinado', 'registro_cartorio']); assert.equal(e.irPara, 'registro_cartorio'); assert.equal(e.paraAviso, 'contrato_assinado'); assert.match(e.mensagem, /cartório de registro/);
});
test('contrato registrado + RGI + ônus: Conformidade final e avisa a equipe', () => {
  const e = efeitoDoArquivo({ status: 'registro_cartorio', tipo: 'onus_reais', ativos: ['contrato_registrado', 'talao_rgi', 'onus_reais'], nomeCliente: 'Ana', equipe: false });
  assert.equal(e.irPara, 'conformidade_final'); assert.match(e.conversa, /talão do RGI/);
});
test('passos e quem pode ver o bloco', () => {
  assert.equal(passoContrato('minuta_em_maos', []).vez, 'corretor');
  assert.equal(passoContrato('minuta_em_maos', ['minuta_assinada']).vez, 'cca');
  assert.equal(passoContrato('registro_cartorio', []).vez, 'corretor');
  assert.equal(passoContrato('conformidade_final', []).vez, 'cca');
  assert.equal(passoContrato('credito_liberado', []).vez, null);
  assert.equal(mostraContrato('conformidade', true), true); assert.equal(mostraContrato('conformidade', false), false);
  assert.equal(mostraContrato('minuta_em_maos', false), true); assert.equal(mostraContrato('entrevista_reprovada', true), false); assert.equal(mostraContrato('em_analise', true), false);
});
test('o mais novo de cada tipo vale; corretor só anexa o que é dele', () => {
  const m = arquivosAtuais([{ tipo: 'minuta', enviado_em: '2026-10-01', id: 1 }, { tipo: 'minuta', enviado_em: '2026-10-02', id: 2 }, { tipo: 'minuta', enviado_em: '2026-10-03', id: 3, substituido: true }]);
  assert.equal(m.get('minuta').id, 2);
  assert.equal(podeAnexar('minuta', { equipe: false }), false); assert.equal(podeAnexar('talao_rgi', { equipe: false }), true); assert.equal(podeAnexar('minuta', { equipe: true }), true);
});

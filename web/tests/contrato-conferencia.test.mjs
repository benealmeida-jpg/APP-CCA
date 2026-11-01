import test from 'node:test';
import assert from 'node:assert/strict';
import { situacaoProcuracao, procuracaoVigente, assinantesEsperados, conferirAssinaturasContrato, pendenciasLiberacao, dadosParaConferir, listaDeNomes, ITENS_CONFERENCIA } from '../js/contrato-conferencia-dados.js';

const agora = new Date('2026-11-01T12:00:00-03:00');

test('situação da procuração do gerente', () => {
  assert.equal(situacaoProcuracao(null, agora).estado, 'sem');
  assert.equal(situacaoProcuracao({ validade: null }, agora).estado, 'sem_validade');
  assert.equal(situacaoProcuracao({ validade: '2026-10-31' }, agora).estado, 'vencida');
  const logo = situacaoProcuracao({ validade: '2026-11-20' }, agora);
  assert.equal(logo.estado, 'vence_logo'); assert.equal(logo.dias, 19); assert.match(logo.texto, /20\/11\/2026/);
  assert.equal(situacaoProcuracao({ validade: '2027-06-30' }, agora).estado, 'ok');
  assert.equal(procuracaoVigente({ procuracoes: [{ id: 'a', enviado_em: '2026-01-01' }, { id: 'b', enviado_em: '2026-09-01' }] }).id, 'b');
});

test('quem precisa assinar: compradores, cônjuges, vendedor (PF e PJ) e gerente', () => {
  const cliente = { nome: 'Paula Souza' };
  const participantes = [{ papel: 'conjuge', nome: 'Rui Souza' }, { papel: 'dependente', nome: 'Filho' }];
  const pf = assinantesEsperados({ cliente, participantes, vendedor: { tipo: 'PF', nome: 'Vera Lima', conjuge_nome: 'Caio Lima' }, gerente: { nome: 'Gerson Melo' } });
  assert.deepEqual(pf.map((p) => p.nome), ['Paula Souza', 'Rui Souza', 'Vera Lima', 'Caio Lima', 'Gerson Melo']);
  const pj = assinantesEsperados({ cliente, vendedor: { tipo: 'PJ', nome: 'Realiza', assinantes: ['Diretor Um', 'Diretor Dois'] } });
  assert.deepEqual(pj.slice(1).map((p) => p.nome), ['Diretor Um', 'Diretor Dois']);
  const semQuem = assinantesEsperados({ cliente, vendedor: { tipo: 'PJ', nome: 'Realiza' } });
  assert.equal(semQuem[1].indefinido, true);
});

test('conferência das assinaturas lidas do PDF (digital e misto)', () => {
  const esperados = [{ nome: 'Paula Souza' }, { nome: 'Gerson Melo' }];
  const ok = conferirAssinaturasContrato(esperados, ['PAULA DE SOUZA', 'GERSON A MELO']);
  assert.equal(ok.completo, true); assert.match(ok.resumo, /Todas as 2/);
  const falta = conferirAssinaturasContrato(esperados, ['PAULA SOUZA'], 'digital');
  assert.equal(falta.faltam[0].nome, 'Gerson Melo'); assert.match(falta.resumo, /NATO Digital/);
  assert.match(conferirAssinaturasContrato(esperados, ['PAULA SOUZA'], 'misto').resumo, /à mão/);
  assert.match(conferirAssinaturasContrato(esperados, [], 'digital').resumo, /Nenhuma assinatura/);
});

test('pendências para liberar o contrato', () => {
  const base = { status: 'minuta_em_maos', contrato_tipo: 'digital', contrato_gerente_id: 'g1', contrato_conferencia: { itens: Object.fromEntries(ITENS_CONFERENCIA.map((i) => [i.codigo, true])) } };
  const gerente = { procuracoes: [{ validade: '2027-01-01', enviado_em: '2026-10-01' }] };
  assert.deepEqual(pendenciasLiberacao({ cliente: base, arquivos: ['contrato_assinado', 'validador_assinatura', 'procuracao_gerente'], gerente, agora }), []);
  const f = pendenciasLiberacao({ cliente: { ...base, contrato_conferencia: null }, arquivos: ['contrato_assinado'], gerente: { procuracoes: [{ validade: '2026-01-01' }] }, agora });
  assert.ok(f.includes('relatório de validação do ITI'));
  assert.ok(f.some((x) => /vencida/.test(x)));
  assert.ok(f.includes('conferir dados do imóvel'));
});

test('dados do cadastro para comparar com o contrato', () => {
  const d = dadosParaConferir({ cliente: { nome: 'Paula', cpf: '52998224725', estado_civil: 'Casado(a)', regime_bens: 'Comunhão parcial' },
    vendedor: { tipo: 'PJ', nome: 'Realiza', cpf_cnpj: '45723174000110', assinantes: ['Diretor Um'], regra_assinatura: 'Diretor assina só a última página' },
    imovel: { endereco: 'Rua A, 10', cidade: 'Itaboraí', uf: 'RJ', matricula: '1234' }, gerente: { nome: 'Gerson', cpf: '11144477735' } });
  assert.match(d.comprador[0], /529\.982\.247-25/);
  assert.match(d.vendedor.join(' '), /45\.723\.174\/0001-10/);
  assert.match(d.vendedor.join(' '), /última página/);
  assert.match(d.imovel.join(' '), /Matrícula 1234/);
  assert.deepEqual(listaDeNomes('Ana Silva\n Bia  Lima, Caio'), ['Ana Silva', 'Bia Lima', 'Caio']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/regras.js';

const tipos = [
  { codigo: 'RG_CNH', nome: 'RG ou CNH', grupo: 'Do cliente', regra: '**', condicao: [], ordem: 1 },
  { codigo: 'PIS', nome: 'Número do PIS', grupo: 'Do cliente', regra: '*', condicao: [], ordem: 2 },
  { codigo: 'CONTRACHEQUES', nome: '3 últimos contracheques', grupo: 'Renda', regra: '', condicao: [{ tipo_renda: 'Formal' }, { tipo_renda: 'Mista' }], ordem: 10 },
  { codigo: 'EXTRATO_FGTS', nome: 'Extrato do FGTS', grupo: 'FGTS', regra: '', condicao: [{ usa_fgts: true }], ordem: 20 },
];
const cliente = { nome: 'Mariana Costa', cpf: '12345678909', status: 'documentacao_pendente', tipo_renda: 'Formal', usa_fgts: false, celular: '21987654321', renda_bruta: '4200.00' };

test('CPF', () => {
  assert.equal(R.formatarCpf('12345678909'), '123.456.789-09');
  assert.equal(R.cpfValido('123.456.789-09'), true);
  assert.equal(R.cpfValido('123.456.789-00'), false);
  assert.equal(R.cpfValido('111.111.111-11'), false);
});

test('celular', () => {
  assert.equal(R.formatarCelular('21987654321'), '(21) 98765-4321');
  assert.equal(R.celularInternacional('(21) 98765-4321'), '+5521987654321');
  assert.equal(R.celularInternacional('+55 21 98765-4321'), '+5521987654321');
});

test('moeda', () => {
  assert.equal(R.lerMoeda('R$ 4.200,00'), 4200);
});

test('documentos por condição', () => {
  const n = R.documentosNecessarios(tipos, cliente, []);
  assert.deepEqual(n.map((x) => x.tipo_codigo), ['RG_CNH', 'PIS', 'CONTRACHEQUES']);
  const n2 = R.documentosNecessarios(tipos, { ...cliente, usa_fgts: true, tipo_renda: 'Informal' }, []);
  assert.deepEqual(n2.map((x) => x.tipo_codigo), ['RG_CNH', 'PIS', 'EXTRATO_FGTS']);
});

test('regra ** bloqueia análise; * não', () => {
  let n = R.documentosNecessarios(tipos, cliente, []);
  assert.equal(R.podeIrParaAnalise(n), false);
  const docs = [{ tipo_codigo: 'RG_CNH', versao: 1, situacao: 'em_conferencia', nome_original: 'rg.JPG' }];
  n = R.documentosNecessarios(tipos, cliente, docs);
  assert.equal(R.podeIrParaAnalise(n), true, 'PIS (*) pendente não bloqueia');
  docs[0].situacao = 'recusado';
  n = R.documentosNecessarios(tipos, cliente, docs);
  assert.equal(R.podeIrParaAnalise(n), false, 'RG recusado bloqueia');
});

test('versão atual ignora substituído', () => {
  const docs = [
    { tipo_codigo: 'RG_CNH', versao: 1, situacao: 'substituido' },
    { tipo_codigo: 'RG_CNH', versao: 2, situacao: 'aceito' },
  ];
  assert.equal(R.versaoAtual(docs, 'RG_CNH').versao, 2);
});

test('JSON do Cowork', () => {
  const docs = [{ tipo_codigo: 'RG_CNH', versao: 2, situacao: 'recusado', nome_original: 'cnh.JPG', motivo_recusa: 'Ilegível' }];
  const n = R.documentosNecessarios(tipos, cliente, docs);
  const j = R.montarCadastroJson({ cliente, corretor: { nome: 'João Alves', whatsapp: '+5521900000000' }, imobiliaria: null, necessarios: n, agora: new Date('2026-10-10T12:00:00Z') });
  assert.equal(j.versao_formato, 1);
  assert.equal(j.status, 'Documentação pendente');
  assert.equal(j.pode_ir_para_analise, false);
  assert.equal(j.corretor.imobiliaria, 'Autônomo');
  assert.equal(j.cliente.cpf, '123.456.789-09');
  assert.equal(j.cliente.telefone, '+5521987654321');
  assert.equal(j.renda.bruta_mensal, 4200);
  const rg = j.documentos.find((d) => d.tipo === 'RG_CNH');
  assert.equal(rg.arquivo, 'documentos/RG_CNH.jpg');
  assert.equal(rg.motivo_recusa, 'Ilegível');
  assert.equal(j.documentos.find((d) => d.tipo === 'PIS').arquivo, null);
  const md = R.montarFichaMd(j);
  assert.match(md, /# Ficha do cliente – Mariana Costa/);
  assert.match(md, /Recusado \(Ilegível\)/);
  JSON.parse(JSON.stringify(j));
});

test('mensagens de WhatsApp', () => {
  const n = R.documentosNecessarios(tipos, cliente, []);
  const m = R.msgCadastroRecebido({ corretor: { nome: 'João Alves' }, cliente, necessarios: n });
  assert.match(m, /Olá, João!/);
  assert.match(m, /Sem RG ou CNH, o processo não tem como ir para análise/);
  const r = R.msgRecusa({ corretor: { nome: 'João' }, cliente, documentoNome: 'RG ou CNH', motivo: 'Ilegível', regra: '**' });
  assert.match(r, /Motivo: Ilegível/);
  assert.match(r, /não tem como ir para análise/);
  assert.match(R.msgStatus({ corretor: { nome: 'Ana' }, cliente, novoStatus: 'minuta_em_maos' }), /\*Minuta em mãos\*/);
});

test('regra do IR: renda informal acima do limite sem IR cai para R$ 2.550', () => {
  const a = R.analisarRenda({ tipo_renda: 'Informal', renda_bruta: 4000, declara_ir: false });
  assert.equal(a.corte, true);
  assert.equal(a.considerada, 2550);
  const b = R.analisarRenda({ tipo_renda: 'Mista', renda_formal: 2000, renda_informal: 3500, declara_ir: false });
  assert.equal(b.considerada, 2000 + 2550);
  const c = R.analisarRenda({ tipo_renda: 'Informal', renda_bruta: 4000, declara_ir: true });
  assert.equal(c.corte, false);
  assert.equal(c.considerada, 4000);
  const d = R.analisarRenda({ tipo_renda: 'Informal', renda_bruta: 2800, declara_ir: false });
  assert.equal(d.corte, false, 'abaixo do limite de isenção (R$ 2.965,33/mês) não corta');
  const e = R.analisarRenda({ tipo_renda: 'Formal', renda_bruta: 5000, declara_ir: false });
  assert.equal(e.irObrigatorioSemIr, true);
  assert.equal(e.corte, false);
});

test('soma a renda dos compradores, sem o cônjuge sem renda', async () => {
  const R = await import('../js/regras.js');
  const cli = { tipo_renda: 'Formal', renda_bruta: 5200, declara_ir: true };
  const outros = [
    { papel: 'comprador', tipo_renda: 'Mista', renda_formal: 1000, renda_informal: 4000, declara_ir: false },
    { papel: 'conjuge', renda_bruta: 9999 },
  ];
  const t = R.rendaDoProcesso(cli, outros);
  assert.equal(t.pessoas, 2);
  assert.equal(t.bruta, 10200);
  assert.equal(t.considerada, 5200 + 1000 + 2550);
});

test('faixas do MCMV pela renda e pelo valor do imóvel', () => {
  const f = (renda, valor, zona) => R.enquadrarMcmv({ rendaMensal: renda, valorImovel: valor, zona });
  assert.equal(f(3200).faixa, 1);
  assert.equal(f(3200.01).faixa, 2);
  assert.equal(f(9600).faixa, 3);
  assert.equal(f(13000).faixa, 4);
  assert.equal(f(13000.01).foraPorRenda, true);
  assert.equal(f(4000, 300000).faixa, 3);       // valor acima do teto das faixas 1 e 2
  assert.equal(f(4000, 450000).faixa, 4);
  assert.equal(f(4000, 600001).foraPorValor, true);
  assert.equal(f(5000, null, 'Rural').faixa, 2); // 60 mil/ano
  assert.equal(f(13500, null, 'Rural').faixa, 4); // 162 mil/ano
  assert.equal(f(14000, null, 'Rural').foraPorRenda, true);
});

test('prazo máximo: 420 meses e idade + prazo até 85 anos', () => {
  const hoje = new Date(2026, 9, 11);
  assert.equal(R.prazoMaximo([{ nome: 'A', data_nascimento: '1996-01-01' }], undefined, hoje).prazo, 420);
  const r = R.prazoMaximo([{ nome: 'A', data_nascimento: '1990-01-01' }, { nome: 'B', data_nascimento: '1966-10-11' }], undefined, hoje);
  assert.equal(r.maisVelho.nome, 'B');
  assert.equal(r.maisVelho.anos, 60);
  assert.equal(r.prazo, 300);
  assert.equal(r.limitadoPelaIdade, true);
  assert.equal(R.prazoMaximo([{ nome: 'C', data_nascimento: '1940-01-01' }], undefined, hoje).prazo, 0);
});

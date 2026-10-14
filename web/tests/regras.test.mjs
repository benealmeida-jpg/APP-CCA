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
  assert.match(m, /^(Bom dia|Boa tarde|Boa noite), João!/);
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
  assert.equal(f(5000, null, 'Rural').faixa, 2); // zona não muda: sempre faixas urbanas (renda mensal)
});

test('zona rural e região metropolitana no FGTS', () => {
  assert.match(R.bloqueioZonaRural({ imovel_zona: 'Rural', programa: 'MCMV' }), /MCMV/);
  assert.match(R.bloqueioZonaRural({ imovel_zona: 'Rural', programa: 'Pró-Cotista' }), /Pró-Cotista/);
  assert.match(R.bloqueioZonaRural({ imovel_zona: 'Rural', programa: 'SBPE', usa_fgts: true }), /uso do FGTS/);
  assert.equal(R.bloqueioZonaRural({ imovel_zona: 'Rural', programa: 'SBPE', usa_fgts: false }), null);
  assert.equal(R.bloqueioZonaRural({ imovel_zona: 'Urbana', programa: 'MCMV' }), null);
  assert.equal(R.bloqueioFgtsLocal({ usa_fgts: false, fgts_local_ok: false }), null);
  assert.match(R.bloqueioFgtsLocal({ usa_fgts: true, fgts_local_ok: false }), /trabalha ou mora/);
  assert.match(R.bloqueioFgtsLocal({ usa_fgts: true, fgts_local_ok: true, fgts_tem_imovel_regiao: true }), /já tem imóvel/);
  assert.equal(R.bloqueioFgtsLocal({ usa_fgts: true, fgts_local_ok: true, fgts_tem_imovel_regiao: false }), null);
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

test('dependentes geram os documentos do fator social', () => {
  const tipos = [
    { codigo: 'FS_RG_CERT', por_dependente: true, nome: 'RG ou Certidão', grupo: 'Fator social', condicao: [{ filho: true }, { filho: false, menor: true }], ordem: 40 },
    { codigo: 'FS_RG_CNH', por_dependente: true, nome: 'RG ou CNH', grupo: 'Fator social', condicao: [{ filho: false, menor: false }], ordem: 41 },
    { codigo: 'DECL', por_dependente: true, nome: 'Declaração', grupo: 'Fator social', condicao: [{ filho: false }], ordem: 42 },
  ];
  const cli = { dependentes: 3, dependentes_info: [{ filho: true }, { filho: false, menor: true }, { filho: false, menor: false }] };
  const n = R.documentosNecessarios(tipos, cli, [{ tipo_codigo: 'DECL', dependente_ordem: 3, versao: 1, situacao: 'em_conferencia' }]);
  const por = (o) => n.filter((x) => x.dependente_ordem === o).map((x) => x.tipo_codigo);
  assert.deepEqual(por(1), ['FS_RG_CERT']);
  assert.deepEqual(por(2), ['FS_RG_CERT', 'DECL']);
  assert.deepEqual(por(3), ['FS_RG_CNH', 'DECL']);
  assert.equal(n.find((x) => x.dependente_ordem === 3 && x.tipo_codigo === 'DECL').situacao, 'em_conferencia');
  assert.equal(n.find((x) => x.dependente_ordem === 2 && x.tipo_codigo === 'DECL').situacao, 'pendente');
});

test('união estável é solteiro(a) para a Caixa; saudação pelo horário', () => {
  assert.equal(R.estadoCivilCaixa('União estável'), 'Solteiro(a)');
  assert.equal(R.estadoCivilCaixa('Casado(a)'), 'Casado(a)');
  assert.equal(R.saudacao(new Date('2026-10-11T08:00:00-03:00')), 'Bom dia');
  assert.equal(R.saudacao(new Date('2026-10-11T14:00:00-03:00')), 'Boa tarde');
  assert.equal(R.saudacao(new Date('2026-10-11T21:00:00-03:00')), 'Boa noite');
  assert.equal(R.saudacao(new Date('2026-10-12T01:00:00Z')), 'Boa noite'); // 22h em Brasília
});

test('CNPJ válido e documentos em páginas (vendedor, imóvel, outros)', async () => {
  const { TIPOS_DOCUMENTO } = await import('../js/dados-iniciais.js');
  assert.equal(R.cnpjValido('11.222.333/0001-81'), true);
  assert.equal(R.cnpjValido('11.222.333/0001-82'), false);
  assert.equal(R.formatarCnpj('11222333000181'), '11.222.333/0001-81');
  const cli = { nome: 'A B', modalidade: 'Aquisição de Imóvel', vendedor: 'Construtora / PJ', tipo_renda: 'Formal', usa_fgts: false };
  const vendedor = { tipo: 'PJ', pj_tipo: 'Avulso', nome: 'Construtora X', natureza_juridica: 'LTDA/Cia', teve_alteracao_contratual: true };
  const docs = [{ tipo_codigo: 'OUTROS', versao: 1, situacao: 'em_conferencia' }, { tipo_codigo: 'OUTROS', versao: 2, situacao: 'em_conferencia' }];
  const n = R.documentosNecessarios(TIPOS_DOCUMENTO, cli, docs, [], { vendedor, documentosVendedor: [{ tipo_codigo: 'VEND_PJ_CERTIDAO_JUNTA', situacao: 'aceito', versao: 1 }] });
  const sec = (x) => n.filter((i) => i.secao === x).map((i) => i.tipo_codigo);
  assert.deepEqual(sec('vendedor'), ['VEND_PJ_CONTRATO_SOCIAL', 'VEND_PJ_ALTERACOES', 'VEND_PJ_DOCS_SOCIOS', 'VEND_PJ_CERTIDAO_JUNTA']);
  assert.deepEqual(sec('imovel'), ['MATRICULA', 'ONUS_REAIS', 'ESPELHO_IPTU']);
  assert.deepEqual(sec('outros'), ['SIMULACAO', 'OUTROS', 'OUTROS', 'OUTROS']);
  assert.equal(n.find((i) => i.tipo_codigo === 'VEND_PJ_CERTIDAO_JUNTA').situacao, 'aceito');
  assert.equal(n.filter((i) => i.opcional).length, 1);
  assert.ok(!n.some((i) => i.tipo_codigo === 'DOCS_VENDEDOR'));
  // PF não pede docs de PJ; construção sem vendedor não pede docs de vendedor
  const docsPf = (estado_civil) => R.documentosNecessarios(TIPOS_DOCUMENTO, { ...cli, vendedor: 'Pessoa física' }, [], [], { vendedor: { tipo: 'PF', nome: 'Fulano', estado_civil } })
    .filter((i) => i.secao === 'vendedor').map((i) => i.tipo_codigo);
  assert.deepEqual(docsPf('Solteiro(a)'), ['VEND_PF_IDENTIDADE', 'VEND_PF_CERT_NASCIMENTO']);
  assert.deepEqual(docsPf('União estável'), ['VEND_PF_IDENTIDADE', 'VEND_PF_CERT_NASCIMENTO']);
  assert.deepEqual(docsPf('Casado(a)'), ['VEND_PF_IDENTIDADE', 'VEND_PF_CERT_CASAMENTO', 'VEND_CONJ_IDENTIDADE']);
  // Empreendimento (SPE): com recurso da Caixa não pede documentos; sem recurso pede os da PJ
  const spe = { tipo: 'PJ', pj_tipo: 'Empreendimento', nome: 'SPE X', natureza_juridica: 'LTDA/Cia' };
  assert.equal(R.documentosNecessarios(TIPOS_DOCUMENTO, { ...cli, empreendimento_caixa: true }, [], [], { vendedor: spe }).filter((i) => i.secao === 'vendedor').length, 0);
  assert.equal(R.documentosNecessarios(TIPOS_DOCUMENTO, { ...cli, empreendimento_caixa: false }, [], [], { vendedor: spe }).filter((i) => i.secao === 'vendedor').length, 3);
  // sem alteração contratual, o documento de alterações não é pedido
  assert.equal(R.documentosNecessarios(TIPOS_DOCUMENTO, cli, [], [], { vendedor: { ...vendedor, teve_alteracao_contratual: false } }).some((i) => i.tipo_codigo === 'VEND_PJ_ALTERACOES'), false);
  const obra = R.documentosNecessarios(TIPOS_DOCUMENTO, { ...cli, modalidade: 'Construção em Terreno Próprio' }, [], [], { vendedor });
  assert.equal(obra.filter((i) => i.secao === 'vendedor').length, 0);
  // resumo ignora o "anexar mais um"
  assert.equal(R.resumoDocumentos(n).total, n.length - 1);
});

test('teto das Faixas 1 e 2 vem do município quando informado', () => {
  // imóvel de R$ 240 mil: Faixa 2 com teto geral (275 mil), Faixa 3 num município de teto 235 mil
  assert.equal(R.enquadrarMcmv({ rendaMensal: 4000, valorImovel: 240000 }).faixa, 2);
  const m = R.enquadrarMcmv({ rendaMensal: 4000, valorImovel: 240000, tetoF12: 235000 });
  assert.equal(m.faixa, 3);
  assert.equal(m.tetoDoMunicipio, true);
  assert.equal(R.enquadrarMcmv({ rendaMensal: 4000, valorImovel: 235000, tetoF12: 235000 }).faixa, 2);
});

test('lista do curso Caixa: imóvel novo, pacto antenupcial e tipo de empresa', async () => {
  const { TIPOS_DOCUMENTO } = await import('../js/dados-iniciais.js');
  const base = { nome: 'A B', modalidade: 'Aquisição de Imóvel', imovel: 'Novo', vendedor: 'Pessoa física', tipo_renda: 'Informal' };
  assert.equal(R.docsImovelNovo({ ...base, programa: 'MCMV' }), 'FGTS');
  assert.equal(R.docsImovelNovo({ ...base, programa: 'SBPE' }), 'SBPE');
  assert.equal(R.docsImovelNovo({ ...base, imovel: 'Usado', programa: 'MCMV' }), null);
  assert.equal(R.docsImovelNovo({ ...base, vendedor: 'Construtora / PJ', empreendimento_caixa: true, programa: 'MCMV' }, { pj_tipo: 'Empreendimento' }), null);
  const imovel = (c) => R.documentosNecessarios(TIPOS_DOCUMENTO, c, []).filter((i) => i.secao === 'imovel').map((i) => i.tipo_codigo);
  assert.deepEqual(imovel({ ...base, docs_imovel_novo: 'SBPE' }), ['MATRICULA', 'ONUS_REAIS', 'ESPELHO_IPTU', 'IMOVEL_HABITESE', 'IMOVEL_ART_PROJ_EXEC', 'IMOVEL_CREA_CAU', 'IMOVEL_DECL_ELEMENTOS']);
  assert.deepEqual(imovel({ ...base, docs_imovel_novo: 'FGTS' }), ['MATRICULA', 'ONUS_REAIS', 'ESPELHO_IPTU', 'IMOVEL_HABITESE', 'IMOVEL_ART_PROJETO', 'IMOVEL_ART_EXECUCAO', 'IMOVEL_CNPJ_EMPRESA', 'IMOVEL_CREA_CAU', 'IMOVEL_DECL_ELEMENTOS', 'IMOVEL_SCPO', 'IMOVEL_RCPM']);
  assert.deepEqual(imovel(base), ['MATRICULA', 'ONUS_REAIS', 'ESPELHO_IPTU']);
  // comprador: carteira de trabalho só com renda formal/mista; PIS é campo, não documento
  const comp = R.documentosNecessarios(TIPOS_DOCUMENTO, base, []).map((i) => i.tipo_codigo);
  assert.ok(!comp.includes('CARTEIRA_TRABALHO'));
  assert.ok(R.documentosNecessarios(TIPOS_DOCUMENTO, { ...base, tipo_renda: 'Formal' }, []).some((i) => i.tipo_codigo === 'CARTEIRA_TRABALHO'));
  assert.ok(!comp.includes('PIS'));
  // pacto: casado fora da comunhão (parcial ou universal)
  const pacto = (regime) => R.documentosNecessarios(TIPOS_DOCUMENTO, { ...base, estado_civil: 'Casado(a)', regime_bens: regime }, []).some((i) => i.tipo_codigo === 'PACTO_ANTENUPCIAL');
  assert.equal(pacto('Comunhão parcial'), false);
  assert.equal(pacto('Comunhão universal'), true);
  assert.equal(pacto('Comunhão universal (casamento antes de 26/12/1977)'), false);
  assert.equal(pacto('Separação total (convencional)'), true);
  assert.equal(pacto('Separação obrigatória'), false);
  assert.equal(R.pedePacto({ estado_civil: 'Casado(a)', regime_bens: 'Comunhão universal' }), true);
  const vend = (v) => R.documentosNecessarios(TIPOS_DOCUMENTO, { ...base, vendedor: v.tipo === 'PF' ? 'Pessoa física' : 'Construtora / PJ' }, [], [], { vendedor: v }).filter((i) => i.secao === 'vendedor').map((i) => i.tipo_codigo);
  assert.ok(vend({ tipo: 'PF', nome: 'X', estado_civil: 'Casado(a)', regime_bens: 'Participação final nos aquestos' }).includes('VEND_PF_PACTO'));
  assert.ok(!vend({ tipo: 'PF', nome: 'X', estado_civil: 'Casado(a)', regime_bens: 'Separação obrigatória' }).includes('VEND_PF_PACTO'));
  assert.ok(!vend({ tipo: 'PF', nome: 'X', estado_civil: 'Casado(a)', regime_bens: 'Comunhão parcial' }).includes('VEND_PF_PACTO'));
  assert.deepEqual(vend({ tipo: 'PJ', pj_tipo: 'Avulso', nome: 'X', natureza_juridica: 'S/A' }), ['VEND_PJ_ESTATUTO', 'VEND_PJ_ATA_DIRETORIA', 'VEND_PJ_DOCS_SOCIOS', 'VEND_PJ_CERTIDAO_JUNTA']);
  assert.deepEqual(vend({ tipo: 'PJ', pj_tipo: 'Avulso', nome: 'X', natureza_juridica: 'Firma individual' }), ['VEND_PJ_CONSTITUICAO', 'VEND_PJ_DOCS_SOCIOS', 'VEND_PJ_CERTIDAO_JUNTA']);
});

// ---------- Engenharia ----------
import * as ENG from '../js/engenharia-regras.js';
import { test as testEng } from 'node:test';
import assertEng from 'node:assert/strict';
testEng('engenharia: validade do laudo é 180 dias depois da avaliação', () => {
  assertEng.equal(ENG.validadeDoLaudo('2026-01-01'), '2026-06-30');
  assertEng.equal(ENG.validadeDoLaudo('2026-10-13'), '2027-04-11');
  assertEng.equal(ENG.validadeDoLaudo(''), null);
});
testEng('engenharia: dias para vencer', () => {
  assertEng.equal(ENG.diasParaVencer('2026-10-20', new Date(2026, 9, 13)), 7);
  assertEng.equal(ENG.diasParaVencer('2026-10-10', new Date(2026, 9, 13)), -3);
});
testEng('engenharia: documentos exigidos por tipo', () => {
  assertEng.deepEqual(ENG.DOCS_POR_TIPO.usado, ['MATRICULA', 'IPTU', 'HABITESE']);
  assertEng.equal(ENG.DOCS_POR_TIPO.novo_fgts.length, 7);
  assertEng.ok(ENG.DOCS_POR_TIPO.atc.includes('PCI') && ENG.DOCS_POR_TIPO.ctp.includes('CREA_CAU'));
  assertEng.deepEqual(ENG.docsFaltando('novo_sbpe', [{ tipo: 'ART' }, { tipo: 'MATRICULA' }]), ['ALVARA', 'HABITESE', 'PROJETO']);
});
testEng('engenharia: reavaliação exige de 5 a 10 links', () => {
  const l = (n) => Array.from({ length: n }, (_, i) => `https://site.com/anuncio-${i}`);
  assertEng.equal(ENG.contestacaoValida('reavaliacao', l(4)).ok, false);
  assertEng.equal(ENG.contestacaoValida('reavaliacao', l(5)).ok, true);
  assertEng.equal(ENG.contestacaoValida('reavaliacao', l(11)).ok, false);
  assertEng.equal(ENG.contestacaoValida('segunda_instancia', []).ok, true);
  assertEng.equal(ENG.linksDeAnuncios('https://a.com/1, https://b.com/2\nlixo').length, 2);
});

// ---------- Emissão, validade, ITC e desconto no cartório ----------
import { TIPOS_DOCUMENTO as TIPOS_EV } from '../js/dados-iniciais.js';
test('30 dias úteis do ônus reais pulam fim de semana e feriado; JUCERJA 180 dias corridos', () => {
  assert.equal(R.somarDiasUteis('2026-09-10', 30), '2026-10-23'); // 12/10 é feriado
  assert.equal(R.ehDiaUtil('2026-04-23'), false); // São Jorge (RJ)
  assert.equal(R.ehDiaUtil('2026-02-17'), false); // Carnaval
  const onus = { validade_dias: 30, validade_uteis: true };
  assert.equal(R.validadeDoDocumento(onus, '2026-09-10', '2026-10-14').estado, 'atencao');
  assert.equal(R.validadeDoDocumento(onus, '2026-09-10', '2026-10-23').estado, 'atencao');
  assert.equal(R.validadeDoDocumento(onus, '2026-09-10', '2026-10-26').estado, 'vencido');
  assert.equal(R.validadeDoDocumento(onus, '2026-10-01', '2026-10-14').estado, 'ok');
  const jucerja = { validade_dias: 180, validade_uteis: false };
  assert.equal(R.validadeDoDocumento(jucerja, '2026-01-01', '2026-10-14').vencimento, '2026-06-30');
  assert.equal(R.validadeDoDocumento(jucerja, '2026-01-01', '2026-10-14').estado, 'vencido');
  assert.equal(R.validadeDoDocumento(jucerja, '2026-09-01', '2026-10-14').estado, 'ok');
  assert.equal(R.validadeDoDocumento({ validade_dias: 90 }, '2026-07-20', '2026-10-14').estado, 'atencao');
});
test('ITC: vendedor com 60+ anos pede uma certidão no imóvel e outra na residência, se morar em outra cidade', () => {
  const cli = { modalidade: 'Aquisição de Imóvel', imovel_municipio: 'Niterói', vendedor: 'Pessoa física' };
  const cods = (v) => R.documentosNecessarios(TIPOS_EV, cli, [], [], { vendedor: v, documentosVendedor: [] }).filter((n) => n.tipo_codigo.startsWith('VEND_ITC')).map((n) => n.tipo_codigo);
  const base = { tipo: 'PF', nome: 'Antônio', estado_civil: 'Solteiro(a)' };
  assert.deepEqual(cods({ ...base, data_nascimento: '1980-01-01', residencia_municipio: 'Rio de Janeiro' }), []);
  assert.deepEqual(cods({ ...base, data_nascimento: '1960-05-01', residencia_municipio: 'Niterói' }), ['VEND_ITC_IMOVEL']);
  assert.deepEqual(cods({ ...base, data_nascimento: '1960-05-01', residencia_municipio: 'niteroi ' }), ['VEND_ITC_IMOVEL']); // acento/maiúscula não importam
  assert.deepEqual(cods({ ...base, data_nascimento: '1950-05-01', residencia_municipio: 'Rio de Janeiro' }), ['VEND_ITC_RESIDENCIA', 'VEND_ITC_IMOVEL']);
  assert.deepEqual(cods({ ...base, data_nascimento: '1950-05-01' }), ['VEND_ITC_RESIDENCIA', 'VEND_ITC_IMOVEL']); // cidade ainda não informada
});
test('JUCERJA e ônus reais pedem data de emissão e mostram a validade', () => {
  const cli = { modalidade: 'Aquisição de Imóvel', vendedor: 'Construtora / PJ', empreendimento_caixa: false };
  const vend = { tipo: 'PJ', pj_tipo: 'Avulso', natureza_juridica: 'LTDA/Cia', nome: 'Construtora' };
  const hoje = R.hojeIso();
  const n = R.documentosNecessarios(TIPOS_EV, cli, [{ tipo_codigo: 'ONUS_REAIS', versao: 1, situacao: 'em_conferencia', emitido_em: R.somarDias(hoje, -100) }], [],
    { vendedor: vend, documentosVendedor: [{ tipo_codigo: 'VEND_PJ_CERTIDAO_JUNTA', situacao: 'aceito', emitido_em: R.somarDias(hoje, -10) }] });
  const onus = n.find((x) => x.tipo_codigo === 'ONUS_REAIS'); const jun = n.find((x) => x.tipo_codigo === 'VEND_PJ_CERTIDAO_JUNTA');
  assert.equal(onus.pede_emissao, true); assert.equal(onus.validade.estado, 'vencido');
  assert.equal(jun.pede_emissao, true); assert.equal(jun.validade.estado, 'ok'); assert.equal(jun.validade_dias, 180);
});
test('desconto de 50% no cartório: até R$ 372.030,00 é BIB; acima, busca específica de escritura e de RGI', () => {
  assert.equal(R.faixaDescontoCartorio({ desconto_cartorio: false, valor_imovel: 500000 }), null);
  assert.equal(R.faixaDescontoCartorio({ desconto_cartorio: true, valor_imovel: 372030 }), 'BIB');
  assert.equal(R.faixaDescontoCartorio({ desconto_cartorio: true, valor_imovel: 372030.01 }), 'BUSCA');
  const pede = (c) => R.documentosNecessarios(TIPOS_EV, { modalidade: 'Aquisição de Imóvel', ...c }, [], []).filter((n) => n.tipo_codigo.startsWith('CERT_BUSCA')).map((n) => n.tipo_codigo);
  assert.deepEqual(pede({ desconto_cartorio: true, valor_imovel: 300000 }), []);
  assert.deepEqual(pede({ desconto_cartorio: true, valor_imovel: 500000 }), ['CERT_BUSCA_ESCRITURA', 'CERT_BUSCA_RGI']);
  assert.deepEqual(pede({ desconto_cartorio: false, valor_imovel: 500000 }), []);
  const c = { nome: 'Ana', cpf: '12345678909', valor_imovel: 500000, desconto_cartorio: true, imovel_municipio: 'Niterói' };
  assert.equal(R.situacaoDescontoCartorio(c).etapa, 'pagar');
  assert.equal(R.situacaoDescontoCartorio({ ...c, grerj_pago_em: '2026-10-10' }).etapa, 'requerimento');
  assert.equal(R.situacaoDescontoCartorio({ ...c, grerj_pago_em: '2026-10-10', requerimento_enviado_em: '2026-10-11' }).etapa, 'aguardando');
  const t = R.textoRequerimento({ ...c, grerj_numero: '123456', grerj_valor: 87.5, grerj_pago_em: '2026-10-10' });
  assert.match(t.assunto, /GRERJ nº 123456/); assert.match(t.corpo, /87,50/); assert.match(t.corpo, /10\/10\/2026/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { pdfRequerimento, pdfDependente, blocosRequerimento, blocosDependente, pessoasDaBusca, situacaoGrerj } from '../js/docs-preenchidos.js';

const texto = (blocos) => blocos.map((b) => b.texto || '').join('\n');
test('requerimento: cada pessoa com as suas GRERJ e o requerente', () => {
  const pessoas = pessoasDaBusca({ nome: 'Mariana Costa', cpf: '12345678909' }, [{ ordem: 2, nome: 'Paulo Costa', cpf: '98765432100' }]);
  assert.deepEqual(pessoas.map((p) => p.ordem), [1, 2]);
  const t = texto(blocosRequerimento({ requerente: { nome: 'Mariana Costa', cpf: '12345678909', rg: '1234', orgao: 'IFP-RJ' }, pessoas,
    guias: [{ pessoa_ordem: 1, numero: '111', valor: 161.77, finalidade: 'escritura' }, { pessoa_ordem: 2, numero: '222', valor: 161.77, finalidade: 'registro' }], data: new Date(2026, 0, 12) }));
  assert.match(t, /Requerente: Mariana Costa, Portador\(a\) do RG: 1234, IFP-RJ e CPF: 123\.456\.789-09/);
  assert.match(t, /NOME: PAULO COSTA, Portador\(a\) do CPF: 987\.654\.321-00/);
  assert.match(t, /GRERJ Nº: 111 \(Escritura\)/); assert.match(t, /GRERJ Nº: 222 \(RGI\)/);
  assert.match(t, /R\$ 161,77/); assert.match(t, /Itaboraí, 12 de janeiro de 2026/);
  const pdf = Buffer.from(pdfRequerimento({ requerente: {}, pessoas, guias: [] }));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.match(pdf.toString('latin1'), /%%EOF\s*$/);
});
test('declaração de dependente com e sem cônjuge', () => {
  const sem = texto(blocosDependente({ parente: { nome: 'Ana', cpf: '11122233344', estado_civil: 'Viúva', grau: 'Mãe' }, proponente: { nome: 'Mariana', cpf: '12345678909' } }));
  assert.match(sem, /Eu, Ana, CPF 111\.222\.333-44, estado civil viúva, declaro que sou mãe do proponente Mariana/);
  assert.doesNotMatch(sem, /cônjuge do parente/);
  const com = blocosDependente({ parente: { nome: 'Ana' }, proponente: { nome: 'Mariana' }, conjuge: 'Pedro' });
  assert.match(texto(com), /Eu, Pedro, declaro que também não possuo/);
  assert.match(texto(com), /Assinatura do cônjuge do parente - Pedro/);
  assert.equal(Buffer.from(pdfDependente({ parente: {}, proponente: {} })).subarray(0, 5).toString(), '%PDF-');
});
test('situação da busca: de quem é a vez', () => {
  assert.equal(situacaoGrerj([], { esperadas: 2 }).vez, 'cca');
  assert.equal(situacaoGrerj([{ numero: '1' }], { esperadas: 2 }).etapa, 'gerar');
  assert.equal(situacaoGrerj([{ numero: '1' }, { numero: '2', pago_em: '2026-10-01' }], { esperadas: 2 }).etapa, 'pagar');
  const pagas = [{ numero: '1', pago_em: 'x' }, { numero: '2', pago_em: 'x' }];
  assert.equal(situacaoGrerj(pagas, { esperadas: 2 }).etapa, 'assinar');
  assert.equal(situacaoGrerj(pagas, { esperadas: 2, assinadoEm: 'x' }).vez, 'cca');
  assert.equal(situacaoGrerj(pagas, { esperadas: 2, assinadoEm: 'x', enviadoEm: 'y' }).vez, 'cartorio');
});
test('carta de cancelamento: texto do modelo da CCA', async () => {
  const { blocosCartaCancelamento, pdfCartaCancelamento } = await import('../js/docs-preenchidos.js');
  const t = blocosCartaCancelamento({ nome: 'Ana Carolina Siqueira', cpf: '14556698777', rg: '296236441', orgao: 'DETRAN RJ', feminino: true, data: new Date(2026, 8, 16) }).map((b) => b.texto || '').join('\n');
  assert.match(t, /Carta de Cancelamento de Crédito/);
  assert.match(t, /Eu, ANA CAROLINA SIQUEIRA, inscrita no CPF de número 145\.566\.987-77 e do RG número 296236441 DETRAN RJ, autorizo a CAIXA ECONÔMICA FEDERAL a cancelar qualquer avaliação habitacional ou comercial em meu nome\./);
  assert.match(t, /Itaboraí, 16 de setembro de 2026\./);
  assert.match(blocosCartaCancelamento({ nome: 'Matheus' }).map((b) => b.texto || '').join(''), /inscrito no CPF/);
  const pdf = Buffer.from(pdfCartaCancelamento({ nome: 'X' }, { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 10 })).toString('latin1');
  assert.match(pdf, /\/Filter \/DCTDecode/); assert.match(pdf, /\/Fundo Do/);
});
test('barreiras iniciais: texto do encerramento e etapa onde parou', async () => {
  const R = await import('../js/regras.js'); const F = await import('../js/fluxo-dados.js');
  assert.match(R.textoEncerrado({ barreira: 'restricao', barreira_obs: 'SPC' }), /restrição.*encerrado.*Observação da CCA: SPC/s);
  assert.match(R.textoEncerrado({ barreira: 'sem_qv' }, { doCliente: true }), /2 QV.*6 meses/);
  assert.equal(F.etapaDoEncerramento([{ para: 'cadastro_ok', de: 'cadastro_recebido', em: '1' }, { para: 'processo_encerrado', de: 'cadastro_ok', em: '2' }]), 'cadastro_ok');
  const fases = F.etapasDoFluxo('processo_encerrado', [{ para: 'processo_encerrado', de: 'cadastro_ok', em: '2026-10-23' }]);
  const itens = fases.flatMap((f) => f.itens);
  assert.equal(itens.find((e) => e.codigo === 'cadastro_ok').estado, 'reprovada');
  assert.equal(itens.find((e) => e.codigo === 'em_analise').estado, 'futura');
  assert.ok(R.STATUS_FINAIS.includes('processo_encerrado'));
});
test('datas: timestamp vira o dia de Brasília; data pura fica igual', async () => {
  const R = await import('../js/regras.js');
  assert.equal(R.formatarData('2026-10-24T01:30:00Z'), '23/10/2026');   // 22:30 em Brasília
  assert.equal(R.formatarData('2026-10-24T01:30:00.000+00:00'), '23/10/2026');
  assert.equal(R.formatarData('2026-10-24 15:00:00+00'), '24/10/2026');
  assert.equal(R.formatarData('2026-10-24'), '24/10/2026');
  assert.equal(R.formatarData(null), '');
});
test('nova tentativa: datas e situação', async () => {
  const R = await import('../js/regras.js');
  const agora = new Date('2026-10-24T15:00:00Z');
  assert.equal(R.somarAHoje({ meses: 6 }, agora), '2027-04-24');
  assert.equal(R.somarAHoje({ dias: 180 }, agora), '2027-04-22');
  assert.equal(R.situacaoNovaTentativa({ status: 'cadastro_ok', nova_tentativa_em: '2026-01-01' }), null);
  assert.equal(R.situacaoNovaTentativa({ status: 'entrevista_reprovada', nova_tentativa_em: '2027-04-22' }, '2026-10-24').texto, 'Nova tentativa a partir de 22/04/2027');
  assert.equal(R.situacaoNovaTentativa({ status: 'processo_encerrado', barreira: 'sem_qv', nova_tentativa_em: '2026-10-24' }, '2026-10-24').quando, 'ja');
  assert.equal(R.situacaoNovaTentativa({ status: 'processo_encerrado', barreira: 'restricao' }).quando, 'criterio');
});

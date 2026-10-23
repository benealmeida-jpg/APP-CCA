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

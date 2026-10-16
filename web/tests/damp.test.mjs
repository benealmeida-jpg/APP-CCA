import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as DM from '../js/damp-dados.js';
import { MO_OFICIAIS } from '../js/mo-oficiais.js';
import { preencherPdf, textoCaixa, quebrarLinhas, larguraTexto } from '../js/mo-pdf.js';

const M = DM.MODELOS_PADRAO;
const cliente = { nome: 'Joana Exemplo', cpf: '52998224725', programa: 'MCMV', usa_fgts: true, imovel_municipio: 'Niterói', modalidade: 'Aquisição de Imóvel', imovel: 'Usado',
  estado_civil: 'Casado(a)', regime_bens: 'Comunhão parcial', data_nascimento: '1990-05-04', pis: '12345678919', declara_ir: true, cotista_fgts: true, valor_imovel: 250000 };
const parts = [{ ordem: 2, nome: 'Carlos Exemplo', cpf: '11144477735', estado_civil: 'Casado(a)' }];

test('regra: vazia vale sempre; alternativas valem se qualquer uma bater', () => {
  assert.equal(DM.regraOk(cliente, []), true);
  assert.equal(DM.regraOk({ programa: 'SBPE', usa_fgts: false }, M[2].regra), false);
  assert.equal(DM.regraOk({ programa: 'SBPE', usa_fgts: true }, M[2].regra), true);
  assert.equal(DM.regraOk({ programa: 'Pró-Cotista' }, M[2].regra), true);
  assert.equal(DM.descreverRegra(M[0]), 'Sempre');
  assert.equal(DM.descreverRegra(M[3]), 'Só quando a CCA incluir');
  assert.match(DM.descreverRegra(M[2]), /usa o FGTS, ou Linha MCMV/);
});

test('kit: todos os modelos que valem; DAMP uma por comprador; sem duplicar', () => {
  const novos = DM.itensNovosDoKit(cliente, parts, M);
  assert.deepEqual(novos.map((n) => `${n.modelo_id}:${n.pessoa_ordem}`), ['mo-30844:0', 'mo-30825:0', 'damp-29300:1', 'damp-29300:2']);
  assert.equal(DM.itensNovosDoKit(cliente, parts, M, novos).length, 0);
  assert.equal(DM.itensNovosDoKit({ ...cliente, programa: 'SBPE', usa_fgts: false }, [], M).length, 2);
});

test('situação do kit e o que falta', () => {
  const mo = (codigo, extra = {}) => ({ modelo: { codigo, obrigatorio: true }, ...extra });
  assert.equal(DM.situacaoKit([]), 'sem_modelo');
  const itens = [mo('MO30844', { assinado: { em: 'x' } }), mo('DAMP 29300', { pessoa_nome: 'Ana' })];
  assert.equal(DM.situacaoKit(itens), 'para_assinar');
  assert.equal(DM.pendentes(itens), 'DAMP 29300 (Ana)');
  itens[1].dispensado_em = 'x';
  assert.equal(DM.situacaoKit(itens), 'assinada');
  itens[0].lancado_em = 'y';
  assert.equal(DM.situacaoKit(itens), 'lancada');
  assert.equal(DM.situacaoKit([{ modelo: { codigo: 'MO30679', obrigatorio: false } }]), 'sem_modelo');
});

test('dados dos documentos: caixa alta sem acento, CPF formatado, local e data', () => {
  const d = DM.dadosMo({ cliente, participantes: parts, hoje: new Date(2026, 9, 16) });
  assert.equal(d.titular_cpf, '529.982.247-25');
  assert.equal(d.p2_nome, 'Carlos Exemplo');
  assert.equal(d.local_data, 'NITEROI, 16 DE OUTUBRO DE 2026');
  const so2 = DM.dadosMo({ cliente, participantes: parts, pessoa: 2 });
  assert.equal(so2.titular_nome, 'Carlos Exemplo');
  assert.equal(textoCaixa('João Conceição'), 'JOAO CONCEICAO');
  const v = DM.valoresIniciais(MO_OFICIAIS.MO30844, d, { 4: '0001234' });
  assert.equal(v[1], 'Joana Exemplo');
  assert.equal(v[4], '0001234');
  assert.equal(v[5], 'X');
});

test('DAMP 29300: o que vem marcado do cadastro', () => {
  const d = DM.dadosDamp({ cliente, participantes: parts, hoje: new Date(2026, 9, 16) });
  assert.equal(d.textos.text_nome, 'JOANA EXEMPLO');
  assert.equal(d.textos.text_data1, '04/05/1990');
  assert.equal(d.textos.text_pis, '123.45678.91-9');
  assert.equal(d.estadoCivil, 'casado');
  assert.equal(d.regime, 'parcial');
  assert.equal(d.textos.text_enquad1, 'R$ 250.000,00');
  assert.deepEqual(d.marcar, ['chkir2', 'chkmodalidade1', 'chkenquadramento1', 'sn_1', 'sn_11']);
  const html = DM.htmlDampPreenchido('<html><body>x</body></html>', d);
  assert.match(html, /JOANA EXEMPLO[\s\S]*<\/script><\/body>/);
  assert.doesNotMatch(DM.scriptDamp({ ...d, textos: { text_nome: '</script><b>' } }), /<\/script><b>/);
});

test('PDF: preenche o modelo oficial com uma atualização incremental válida', () => {
  const of = MO_OFICIAIS.MO30844;
  const base = readFileSync(new URL(`../${of.arquivo}`, import.meta.url));
  const out = preencherPdf(base, of, { 1: 'Joana Exemplo', 2: '529.982.247-25', 5: 'X', 10: 'NITEROI, 16 DE OUTUBRO DE 2026' });
  const tail = Buffer.from(out.subarray(base.length)).toString('latin1');
  assert.ok(out.length > base.length);
  assert.match(tail, /\(JOANA EXEMPLO\) Tj/);
  assert.match(tail, /\/Prev \d+/);
  const xref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail)[1]);
  assert.equal(Buffer.from(out.subarray(xref, xref + 4)).toString(), 'xref');
  for (const p of of.paginas) {
    const m = new RegExp(`\\n${p.camada[0]} 1\\n(\\d{10}) `).exec(tail);
    const off = Number(m[1]);
    assert.equal(Buffer.from(out.subarray(off, off + 12)).toString('latin1').startsWith(`${p.camada[0]} ${p.camada[1]} obj`), true);
  }
});

test('texto: quebra em linhas e mede a largura', () => {
  assert.equal(Math.round(larguraTexto('AAAA', 10)), 27);
  assert.deepEqual(quebrarLinhas('um dois tres quatro', 10, 40), ['um dois', 'tres', 'quatro']);
});

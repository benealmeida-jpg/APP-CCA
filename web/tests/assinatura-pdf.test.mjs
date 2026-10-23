import test from 'node:test';
import assert from 'node:assert/strict';
import { lerAssinaturasPdf, conferirAssinantes, mesmaPessoa, limparCn } from '../js/assinatura-pdf.js';
import { esperadosDoItem, situacaoItem, govbrNaoAssina } from '../js/damp-dados.js';

// CN em DER: 06 03 55 04 03 + tag UTF8String (0x0C) + tamanho + texto
const cn = (txt) => { const b = Buffer.from(txt, 'utf8'); return Buffer.concat([Buffer.from([0x30, b.length + 7, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, b.length]), b]); };
const pdfAssinado = (nomes) => {
  const der = Buffer.concat([Buffer.alloc(300, 0x30), ...nomes.map(cn), cn('AC Final do Governo Federal do Brasil v1'), cn('Autoridade Certificadora Raiz Brasileira v10')]);
  const hex = der.toString('hex').padEnd(1200, '0');
  return new Uint8Array(Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange [0 100 200 300] /Contents <${hex}> >>\nendobj\n%%EOF`, 'latin1'));
};

test('lê os nomes dos certificados e ignora as autoridades certificadoras', () => {
  const r = lerAssinaturasPdf(pdfAssinado(['MARIANA COSTA SILVA', 'JOSÉ PEREIRA:12345678900']));
  assert.equal(r.digital, true);
  assert.deepEqual(r.nomes, ['MARIANA COSTA SILVA', 'JOSÉ PEREIRA']);
});
test('PDF sem assinatura digital e arquivo que não é PDF', () => {
  assert.deepEqual(lerAssinaturasPdf(new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj << /Type /Page >> endobj'))), { pdf: true, digital: false, nomes: [] });
  assert.equal(lerAssinaturasPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])).pdf, false);
});
test('compara nomes sem acento, com nome do meio omitido', () => {
  assert.equal(mesmaPessoa('JOSE PEREIRA', 'José da Silva Pereira'), true);
  assert.equal(mesmaPessoa('JOSE SANTOS', 'José da Silva Pereira'), false);
  assert.equal(limparCn('ANA LIMA:12345678900'), 'ANA LIMA');
  const r = conferirAssinantes([{ nome: 'Mariana Costa Silva', papel: 'comprador' }, { nome: 'José da Silva Pereira', papel: 'vendedor' }], ['MARIANA COSTA SILVA']);
  assert.deepEqual(r.assinaram.map((p) => p.papel), ['comprador']);
  assert.deepEqual(r.faltam.map((p) => p.papel), ['vendedor']);
});
test('quem assina cada formulário: compradores e, se o modelo pede, vendedores', () => {
  const ctx = { cliente: { nome: 'Mariana Costa' }, participantes: [{ ordem: 2, nome: 'Paulo Costa' }], vendedores: [{ nome: 'José Pereira' }, { nome: 'Rita Pereira' }] };
  assert.deepEqual(esperadosDoItem({ modelo: { assina: 'compradores' } }, ctx).map((p) => p.nome), ['Mariana Costa', 'Paulo Costa']);
  assert.deepEqual(esperadosDoItem({ modelo: { assina: 'cada_comprador' }, pessoa_nome: 'Paulo Costa' }, ctx).map((p) => p.nome), ['Paulo Costa']);
  assert.deepEqual(esperadosDoItem({ modelo: { assina: 'compradores', vendedor_assina: true } }, ctx).map((p) => p.papel), ['comprador', 'comprador', 'vendedor', 'vendedor']);
  assert.deepEqual(esperadosDoItem({ modelo: { assina: 'cca' } }, ctx), []);
  assert.equal(situacaoItem({ parcial: { em: 'x' } }), 'parcial');
  assert.equal(govbrNaoAssina('bronze'), true); assert.equal(govbrNaoAssina('prata'), false);
});

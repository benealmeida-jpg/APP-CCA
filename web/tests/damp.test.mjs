import test from 'node:test';
import assert from 'node:assert/strict';
import { escolherDamp, rendaDoCaso, situacaoDamp, MODELOS_EXEMPLO } from '../js/damp-dados.js';

test('escolhe o modelo mais específico pela linha, renda e FGTS', () => {
  assert.equal(escolherDamp({ programa: 'MCMV', usa_fgts: true, renda_bruta: 3000 }, MODELOS_EXEMPLO).codigo, 'EXEMPLO-01');
  assert.equal(escolherDamp({ programa: 'MCMV', usa_fgts: true, renda_bruta: 8000 }, MODELOS_EXEMPLO).codigo, 'EXEMPLO-03');
  assert.equal(escolherDamp({ programa: 'MCMV', usa_fgts: false, renda_bruta: 3000 }, MODELOS_EXEMPLO).codigo, 'EXEMPLO-02');
  assert.equal(escolherDamp({ programa: 'SBPE', usa_fgts: false, renda_bruta: 20000 }, MODELOS_EXEMPLO).codigo, 'EXEMPLO-04');
  assert.equal(escolherDamp({ programa: 'MCMV', usa_fgts: true, renda_bruta: 20000 }, MODELOS_EXEMPLO.filter((m) => m.programa === 'MCMV')), null);
});
test('renda soma os compradores que compõem renda', () => {
  assert.equal(rendaDoCaso({ renda_bruta: 2000 }, [{ renda_bruta: 1500 }, { renda_bruta: 900, compoe_renda: false }]), 3500);
  assert.equal(escolherDamp({ programa: 'MCMV', usa_fgts: true, renda_bruta: 4000 }, MODELOS_EXEMPLO, [{ renda_bruta: 2000 }]).codigo, 'EXEMPLO-03');
});
test('situação', () => {
  assert.equal(situacaoDamp(null), 'sem_modelo');
  assert.equal(situacaoDamp({ modelo_id: 'x' }), 'para_assinar');
  assert.equal(situacaoDamp({ assinada: { em: 'x' } }), 'assinada');
  assert.equal(situacaoDamp({ assinada: { em: 'x' }, lancada_em: 'y' }), 'lancada');
});

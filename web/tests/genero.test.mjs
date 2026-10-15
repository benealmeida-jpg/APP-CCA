import test from 'node:test';
import assert from 'node:assert/strict';
import { generoNeutro as g } from '../js/genero.js';

test('gênero entre parênteses para pessoas', () => {
  assert.equal(g('Conversa com o corretor'), 'Conversa com o(a) corretor(a)');
  assert.equal(g('Corretor / imobiliária'), 'Corretor(a) / imobiliária');
  assert.equal(g('O gestor recebe e envia ao comprador.'), 'O(a) gestor(a) recebe e envia ao(à) comprador(a).');
  assert.equal(g('Ficha do cliente'), 'Ficha do(a) cliente');
  assert.equal(g('Pelo gerente da Caixa'), 'Pelo(a) gerente da Caixa');
  assert.equal(g('Corretores'), 'Corretores(as)');
  assert.equal(g('dos vendedores'), 'dos(as) vendedores(as)');
});
test('não mexe em e-mail, login nem no que já tem parênteses', () => {
  assert.equal(g('corretor@demo'), 'corretor@demo');
  assert.equal(g('Use gestor@demo ou corretor@demo.'), 'Use gestor@demo ou corretor@demo.');
  assert.equal(g('o(a) corretor(a)'), 'o(a) corretor(a)');
  assert.equal(g('corretora parceira'), 'corretora parceira');
  assert.equal(g('Cliente Aprovado'), 'Cliente Aprovado');
  assert.equal(g('o processo do cliente'), 'o processo do(a) cliente');
  assert.equal(g('A CCA anexa'), 'A CCA anexa');
});
